// Built-artifact replay smoke (P2.3 release gate).
// A sent record must prevent a repeat Telegram send when a pending item is
// replayed after a partial prior run. The separate run test covers the accepted
// at-least-once window when state persistence itself fails after a send.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { NotifierConfigSchema, emptyState, notificationKey, processPendingNotifications } =
  await import(join(root, 'packages/notifier/dist/index.js'));

const assert = (condition, message) => {
  if (!condition) throw new Error(`REPLAY SMOKE FAILED: ${message}`);
};

const config = NotifierConfigSchema.parse({});
const now = new Date('2026-06-19T12:00:00Z');
const item = {
  source: 'youtube',
  source_item_id: 'smoke-video',
  title: 'Smoke video',
  url: 'https://www.youtube.com/watch?v=smoke-video',
  description: null,
  published_at: null,
  extraction_text: 'https://github.com/acme/widget',
  discovered_at: now.toISOString(),
};
const pending = {
  item_key: 'youtube:smoke-video',
  item,
  attempts: 0,
  first_seen_at: now.toISOString(),
  last_attempt_at: null,
  last_error: null,
};
const repository = {
  node_id: 'R_smoke',
  name_with_owner: 'acme/widget',
  owner: 'acme',
  name: 'widget',
  url: 'https://github.com/acme/widget',
  description: 'Smoke repository',
  primary_language: 'TypeScript',
  topics: [],
  stargazer_count: 1,
  license_spdx: null,
  is_archived: false,
  is_fork: false,
  latest_release: null,
};
const processor = {
  resolver: {
    async resolve() {
      return [repository];
    },
  },
  summaryProvider: {
    async summarize() {
      return { title: 'acme/widget', body: 'Smoke summary' };
    },
  },
  telegramSender: {
    sends: 0,
    async send() {
      this.sends += 1;
    },
  },
};

const firstState = { ...emptyState(config), pending: [pending] };
const first = await processPendingNotifications(firstState, processor, config, now);
assert(processor.telegramSender.sends === 1, 'first delivery must call Telegram exactly once');
assert(first.state.pending.length === 0, 'successful item must leave pending');
const sentKey = notificationKey('youtube', 'smoke-video', 'R_smoke');
assert(
  first.state.deliveries.some(
    (delivery) => delivery.notification_key === sentKey && delivery.status === 'sent',
  ),
  'successful delivery must write the per-repository sent key',
);

// A stored sent key from a prior partial item attempt suppresses a replay of
// that exact per-repository notification.
const replayState = {
  ...emptyState(config),
  pending: [pending],
  deliveries: [
    {
      notification_key: sentKey,
      status: 'sent',
      completed_at: now.toISOString(),
      detail: null,
    },
  ],
};
const replay = await processPendingNotifications(replayState, processor, config, now);
assert(processor.telegramSender.sends === 1, 'sent key must suppress a replayed Telegram send');
assert(replay.state.pending.length === 0, 'replayed sent item must complete');

console.log('✓ notifier replay smoke PASSED');
