import { existsSync, readFileSync } from 'node:fs';
import { TerminalError } from '@starred/github-client';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/**
 * Versioned notifier configuration. Secrets are NEVER configured here — the
 * GitHub PAT, Telegram bot token/chat id and the optional LLM key are read from
 * the environment (see the env readers below).
 */
export const NotifierConfigSchema = z
  .object({
    youtube: z
      .object({
        /** Channel ids to poll (the `channel_id` in the Atom feed URL). */
        channels: z.array(z.string().min(1)).default([]),
        /** Per-channel cap on the retained "recently seen video" window (fix #2/#3). */
        recent_seen_limit: z.number().int().min(50).max(500).default(100),
      })
      .strict()
      .default({}),

    awesome_stars: z
      .object({
        repository: z.string().min(1).default('maguowei/awesome-stars'),
        // maguowei/awesome-stars defaults to `master`, not `main`. Configurable.
        ref: z.string().min(1).default('master'),
        // P2 watches README.md only, but the contract allows adding paths later.
        paths: z.array(z.string().min(1)).min(1).default(['README.md']),
      })
      .strict()
      .default({}),

    telegram: z
      .object({
        /** Telegram caps text at 4096 chars AFTER entity parsing (enforced in P2.3). */
        disable_web_page_preview: z.boolean().default(true),
      })
      .strict()
      .default({}),

    state: z
      .object({
        // Dedicated branch so notifier state never touches main / stars.json.
        branch: z.string().min(1).default('starledger-state'),
        file: z.string().min(1).default('notifier-state.json'),
        remote: z.string().min(1).default('origin'),
      })
      .strict()
      .default({}),

    retention: z
      .object({
        // Delivery log is pruned by age OR count; pending is NEVER pruned.
        delivery_days: z.number().int().min(1).default(90),
        delivery_max: z.number().int().min(1).default(2000),
      })
      .strict()
      .default({}),

    summary: z
      .object({
        // P2 operates with the deterministic summary; the LLM adapter (P2.3) is
        // strictly optional and falls back to deterministic on any failure.
        use_llm: z.boolean().default(false),
      })
      .strict()
      .default({}),
  })
  .strict();

export type NotifierConfig = z.infer<typeof NotifierConfigSchema>;

export function loadNotifierConfig(path?: string): NotifierConfig {
  if (path !== undefined && existsSync(path)) {
    const raw: unknown = parseYaml(readFileSync(path, 'utf8')) ?? {};
    return NotifierConfigSchema.parse(raw);
  }
  return NotifierConfigSchema.parse({});
}

// --- environment-supplied secrets (terminal, exit 10, when a required one is missing) ---

export class MissingGithubTokenError extends TerminalError {
  constructor() {
    super(
      'STAR_SYNC_TOKEN is not set. Provide a fine-grained PAT with `Contents: read` (read-only).',
      'MISSING_TOKEN',
    );
  }
}

export class MissingTelegramCredentialsError extends TerminalError {
  constructor(which: string) {
    super(
      `${which} is not set. Telegram delivery requires a bot token and a chat id.`,
      'MISSING_TELEGRAM',
    );
  }
}

/** GitHub PAT used to read commit SHAs / file contents and to resolve repositories. */
export function readGithubToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.STAR_SYNC_TOKEN?.trim();
  if (!token) throw new MissingGithubTokenError();
  return token;
}

export interface TelegramCredentials {
  botToken: string;
  chatId: string;
}

/** Telegram bot credentials, required only when actually delivering (P2.3). */
export function readTelegramCredentials(env: NodeJS.ProcessEnv = process.env): TelegramCredentials {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) throw new MissingTelegramCredentialsError('TELEGRAM_BOT_TOKEN');
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!chatId) throw new MissingTelegramCredentialsError('TELEGRAM_CHAT_ID');
  return { botToken, chatId };
}

/** Optional LLM key. Absent is normal: P2 must work without it (fix #5). */
export function readLlmApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.LLM_API_KEY?.trim();
  return key ? key : null;
}
