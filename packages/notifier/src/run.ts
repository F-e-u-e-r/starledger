import {
  type NotifierConfig,
  loadNotifierConfig,
  readGithubToken,
  readTelegramCredentials,
} from './config';
import { itemKey, notificationKey, type DiscoveryItem, type PendingNotification } from './models';
import {
  createOctokitRepositoryResolver,
  resolveDiscoveryItem,
  type RepositoryResolver,
} from './resolve-repo';
import {
  createHttpYoutubeFeedClient,
  createOctokitAwesomeStarsClient,
  runSources,
  type SourceClients,
  type SourceError,
} from './sources';
import {
  emptyState,
  hasPending,
  isItemTerminal,
  isNotificationSent,
  loadState,
  type NotifierState,
  NotifierStateSchema,
  pruneState,
  serializeState,
} from './state';
import { GitStateStore, type SaveResult, type StateStore } from './state-store';
import { DeterministicSummaryProvider, type SummaryProvider } from './summary';
import { createTelegramSender, renderTelegramMessage, type TelegramSender } from './telegram';
import { redactSecrets } from '@starred/github-client';

export const NOTIFIER_VERSION = '0.1.0';

const COMMIT_MESSAGE = 'chore(notifier): update discovery state';

export interface RunOptions {
  configPath?: string;
  /** Repository directory whose `origin` holds the state branch. */
  cwd?: string;
  clients?: SourceClients;
  store?: StateStore;
  resolver?: RepositoryResolver;
  summaryProvider?: SummaryProvider;
  telegramSender?: TelegramSender;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export interface NotifierRunError {
  source: SourceError['source'] | 'resolution' | 'summary' | 'telegram';
  target: string;
  message: string;
}

export interface RunOutcome {
  config: NotifierConfig;
  /** Items emitted by sources this run (new videos / newly-added repos). */
  discovered: number;
  /** New items durably appended to the pending queue this run. */
  enqueued: number;
  /** Pending queue size after this run. */
  pendingCount: number;
  errors: NotifierRunError[];
  save: SaveResult;
}

/**
 * Exit-code policy (parallels the exporter): a partial source failure or a
 * push that did not land is a deferred outcome (20) — the run is visibly
 * incomplete and will be retried — while a clean run is 0. Terminal failures
 * (config/token/invalid-state) are thrown and carry their own exit code.
 */
export function runExitCode(outcome: RunOutcome): number {
  if (outcome.errors.length > 0) return 20;
  if (outcome.save.changed && !outcome.save.pushed) return 20;
  return 0;
}

function buildRealClients(config: NotifierConfig, env: NodeJS.ProcessEnv): SourceClients {
  const token = readGithubToken(env);
  return {
    youtube: createHttpYoutubeFeedClient(),
    awesomeStars: createOctokitAwesomeStarsClient(config.awesome_stars.repository, token),
  };
}

export interface PendingProcessor {
  resolver: RepositoryResolver;
  summaryProvider: SummaryProvider;
  telegramSender: TelegramSender;
}

function buildPendingProcessor(options: RunOptions, env: NodeJS.ProcessEnv): PendingProcessor {
  return {
    resolver: options.resolver ?? createOctokitRepositoryResolver(readGithubToken(env)),
    summaryProvider: options.summaryProvider ?? new DeterministicSummaryProvider(),
    telegramSender: options.telegramSender ?? createTelegramSender(readTelegramCredentials(env)),
  };
}

function recordItemTerminal(
  state: NotifierState,
  pending: PendingNotification,
  deliveries: NotifierState['deliveries'],
  status: 'skipped_no_repo' | 'permanent_failure',
  detail: string,
  now: Date,
): void {
  const key = pending.item_key;
  if (isItemTerminal({ ...state, deliveries }, key)) return;
  deliveries.push({
    notification_key: key,
    status,
    completed_at: now.toISOString(),
    detail,
  });
}

function safeErrorMessage(err: unknown, env: NodeJS.ProcessEnv): string {
  const message = err instanceof Error ? err.message : String(err);
  return redactSecrets(message, [
    env.STAR_SYNC_TOKEN,
    env.TELEGRAM_BOT_TOKEN,
    env.TELEGRAM_CHAT_ID,
    env.LLM_API_KEY,
  ]);
}

function errorSource(err: unknown): 'resolution' | 'summary' | 'telegram' {
  const stage = (err as { notifierStage?: unknown })?.notifierStage;
  return stage === 'summary' || stage === 'telegram' ? stage : 'resolution';
}

function stagedError(stage: 'resolution' | 'summary' | 'telegram', err: unknown): Error {
  const out = err instanceof Error ? err : new Error(String(err));
  Object.defineProperty(out, 'notifierStage', { value: stage, enumerable: false });
  return out;
}

export interface PendingProcessResult {
  state: NotifierState;
  errors: NotifierRunError[];
}

/**
 * Processes the durable pending queue serially. Each item remains pending on
 * any resolution, summary, or Telegram failure; successful per-repository sends
 * are recorded immediately in memory so a later failure retries only the
 * unsent repository keys. The single state push in `run` creates the accepted
 * at-least-once window: a process crash after Telegram accepts a message but
 * before state persistence may send that message once more next run.
 */
export async function processPendingNotifications(
  state: NotifierState,
  processor: PendingProcessor,
  config: NotifierConfig,
  now: Date,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PendingProcessResult> {
  const pending: PendingNotification[] = [];
  const deliveries = [...state.deliveries];
  const errors: NotifierRunError[] = [];

  for (const entry of state.pending) {
    try {
      let resolution;
      try {
        resolution = await resolveDiscoveryItem(entry.item, processor.resolver);
      } catch (err) {
        throw stagedError('resolution', err);
      }

      if (resolution.repositories.length === 0) {
        const detail =
          resolution.candidateCount === 0
            ? 'No valid public GitHub repository candidate found'
            : 'No public GitHub repository resolved from candidates';
        recordItemTerminal(state, entry, deliveries, 'skipped_no_repo', detail, now);
        continue;
      }

      for (const repository of resolution.repositories) {
        const key = notificationKey(
          entry.item.source,
          entry.item.source_item_id,
          repository.node_id,
        );
        if (isNotificationSent({ ...state, deliveries }, key)) continue;

        let summary;
        try {
          summary = await processor.summaryProvider.summarize(repository);
        } catch (err) {
          throw stagedError('summary', err);
        }

        try {
          await processor.telegramSender.send(
            renderTelegramMessage(entry.item, repository, summary, {
              disableWebPagePreview: config.telegram.disable_web_page_preview,
            }),
          );
        } catch (err) {
          throw stagedError('telegram', err);
        }

        // Only Telegram success produces a sent record. If persistence later
        // fails, the remote still has the old pending entry: accepted at-least-once.
        deliveries.push({
          notification_key: key,
          status: 'sent',
          completed_at: now.toISOString(),
          detail: null,
        });
      }
    } catch (err) {
      const message = safeErrorMessage(err, env);
      errors.push({ source: errorSource(err), target: entry.item_key, message });
      pending.push({
        ...entry,
        attempts: entry.attempts + 1,
        last_attempt_at: now.toISOString(),
        last_error: message,
      });
    }
  }

  return { state: { ...state, pending, deliveries }, errors };
}

/**
 * Append genuinely-new discoveries to the durable pending queue. An item is
 * skipped if it is already pending or has already reached an item-level terminal
 * outcome; otherwise it is enqueued WITH its full payload so it survives the
 * source's recent window. P2.2/P2.3 then resolve and deliver items from that
 * durable queue.
 */
function enqueueDiscoveries(
  state: NotifierState,
  discoveries: readonly DiscoveryItem[],
): { state: NotifierState; enqueued: number } {
  const pending = [...state.pending];
  let enqueued = 0;
  for (const item of discoveries) {
    const key = itemKey(item.source, item.source_item_id);
    const working: NotifierState = { ...state, pending };
    if (hasPending(working, key) || isItemTerminal(state, key)) continue;
    pending.push({
      item_key: key,
      item,
      attempts: 0,
      first_seen_at: item.discovered_at,
      last_attempt_at: null,
      last_error: null,
    });
    enqueued += 1;
  }
  return { state: { ...state, pending }, enqueued };
}

/**
 * One notifier pass: load last-known-good state, poll sources (per-source
 * isolation), durably enqueue new discoveries, resolve/deliver the pending
 * queue, then validate and persist the next state as ONE change-gated commit.
 * A schema-invalid loaded state or a failed push leaves the remote's
 * last-known-good untouched.
 */
export async function run(options: RunOptions = {}): Promise<RunOutcome> {
  const env = options.env ?? process.env;
  const now = (options.now ?? (() => new Date()))();
  const cwd = options.cwd ?? process.cwd();
  const config = loadNotifierConfig(options.configPath);
  const store = options.store ?? new GitStateStore(cwd, config.state);

  const raw = await store.load();
  // loadState validates + reconciles; an invalid remote document throws
  // (deferred) so we never overwrite last-known-good with a repaired guess.
  const loaded = raw === null ? emptyState(config) : loadState(raw, config);

  const clients = options.clients ?? buildRealClients(config, env);
  const sources = await runSources(loaded, config, clients, now);

  const { state: withPending, enqueued } = enqueueDiscoveries(sources.nextState, sources.items);

  const processed =
    withPending.pending.length === 0
      ? { state: withPending, errors: [] }
      : await processPendingNotifications(
          withPending,
          buildPendingProcessor(options, env),
          config,
          now,
          env,
        );

  const pruned = pruneState(processed.state, config, now);

  // Validate-before-persist: a malformed next state must never be written.
  const validated = NotifierStateSchema.parse(pruned);
  const save = await store.save(serializeState(validated), COMMIT_MESSAGE);

  return {
    config,
    discovered: sources.items.length,
    enqueued,
    pendingCount: validated.pending.length,
    errors: [...sources.errors, ...processed.errors],
    save,
  };
}
