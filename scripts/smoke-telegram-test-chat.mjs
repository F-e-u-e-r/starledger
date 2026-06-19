// Opt-in live Telegram smoke for a disposable test chat.
// This never runs against a real chat unless TELEGRAM_SMOKE=1 is set manually.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.TELEGRAM_SMOKE !== '1') {
  console.log('Telegram test-chat smoke skipped (set TELEGRAM_SMOKE=1 to run it manually).');
  process.exit(0);
}

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
if (!token || !chatId) {
  throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required when TELEGRAM_SMOKE=1');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { createTelegramSender } = await import(join(root, 'packages/notifier/dist/index.js'));
const sender = createTelegramSender({ botToken: token, chatId });
await sender.send({
  text: '<b>StarLedger notifier smoke</b>\nManual P2 Telegram delivery check.',
  disable_web_page_preview: true,
});
console.log('✓ Telegram test-chat smoke PASSED');
