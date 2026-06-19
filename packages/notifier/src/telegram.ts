import { type TelegramCredentials } from './config';
import type { DiscoveryItem, ResolvedRepository } from './models';
import type { RepositorySummary } from './summary';

export const TELEGRAM_TEXT_LIMIT = 4096;

export interface TelegramMessage {
  text: string;
  disable_web_page_preview: boolean;
}

export interface TelegramSender {
  send(message: TelegramMessage): Promise<void>;
}

/** Escape every external string before inserting it into Telegram HTML mode. */
export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeTelegramHtml(value).replace(/"/g, '&quot;');
}

function trimCodePoints(value: string, limit: number): string {
  const points = Array.from(value);
  if (points.length <= limit) return value;
  if (limit <= 1) return points.slice(0, Math.max(0, limit)).join('');
  return `${points.slice(0, limit - 1).join('')}…`;
}

function fitText(value: string, limit: number, render: (value: string) => string): string | null {
  if (limit <= 0) return null;
  if (render(value).length <= limit) return value;

  const points = Array.from(value);
  let low = 0;
  let high = points.length;
  let best = '';
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = trimCodePoints(value, mid);
    if (render(candidate).length <= limit) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best || null;
}

/**
 * Builds HTML from complete escaped fragments. It budgets *before* rendering
 * and additionally caps the raw payload at 4096, which is stricter than
 * Telegram's post-entity-parsing limit. It never slices rendered HTML, so tags
 * and entities always remain valid.
 */
export function renderTelegramMessage(
  item: DiscoveryItem,
  repository: ResolvedRepository,
  summary: RepositorySummary,
  opts: { disableWebPagePreview?: boolean; maxLength?: number } = {},
): TelegramMessage {
  const maxLength = opts.maxLength ?? TELEGRAM_TEXT_LIMIT;
  const blocks: string[] = [];
  const append = (render: (value: string) => string, value: string): void => {
    const prefix = blocks.length === 0 ? '' : '\n\n';
    const fitted = fitText(
      value,
      maxLength - blocks.join('\n\n').length - prefix.length,
      (text) => `${prefix}${render(text)}`,
    );
    if (fitted !== null) blocks.push(render(fitted));
  };

  append(
    (value) => `<b>${escapeTelegramHtml(value)}</b>`,
    summary.title || repository.name_with_owner,
  );
  append((value) => escapeTelegramHtml(value), summary.body);

  const repositoryLink = `<a href="${escapeAttribute(repository.url)}">Open repository</a>`;
  if ((blocks.join('\n\n') + '\n\n' + repositoryLink).length <= maxLength) {
    blocks.push(repositoryLink);
  }
  const sourceLink = `Source: <a href="${escapeAttribute(item.url)}">${escapeTelegramHtml(item.title)}</a>`;
  if ((blocks.join('\n\n') + '\n\n' + sourceLink).length <= maxLength) {
    blocks.push(sourceLink);
  }

  const text = blocks.join('\n\n');
  // A valid repository name always supplies a nonempty title. This guard is
  // defensive if a future caller supplies a pathological length budget.
  if (!text) throw new Error('Telegram message cannot be empty');
  return { text, disable_web_page_preview: opts.disableWebPagePreview ?? true };
}

interface TelegramApiResponse {
  ok?: boolean;
}

/**
 * Telegram sender that resolves only after a successful `sendMessage` response.
 * Its errors intentionally omit the URL, token, chat id, and remote body so
 * callers cannot leak credentials through logs or persisted retry errors.
 */
export function createTelegramSender(
  credentials: TelegramCredentials,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): TelegramSender {
  return {
    async send(message) {
      const response = await fetchImpl(
        `https://api.telegram.org/bot${encodeURIComponent(credentials.botToken)}/sendMessage`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: credentials.chatId,
            text: message.text,
            parse_mode: 'HTML',
            disable_web_page_preview: message.disable_web_page_preview,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`Telegram sendMessage returned HTTP ${response.status}`);
      }
      let payload: TelegramApiResponse;
      try {
        payload = (await response.json()) as TelegramApiResponse;
      } catch {
        throw new Error('Telegram sendMessage returned invalid JSON');
      }
      if (payload.ok !== true) throw new Error('Telegram sendMessage was not accepted');
    },
  };
}
