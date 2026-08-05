import { request } from '@/services/network/httpClient';
import type { WorkLog } from '@/types';
import { formatNumber } from '@/utils/price';
import { logger } from '@/utils/logger';

/**
 * Telegram order alerts.
 *
 * ⚠️ SECURITY NOTE
 * The original build hard-coded a live bot token in the JavaScript bundle, so
 * anyone who opened the site could read it and post as the shop's bot. The
 * token is therefore *not* reproduced here.
 *
 * Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` below (ideally from an EAS
 * secret rather than source control) to re-enable alerts. Until they are set
 * the calls become no-ops and nothing else in the app changes.
 *
 * The old token should be revoked with @BotFather — assume it is compromised.
 */

const TELEGRAM_BOT_TOKEN = '';
const TELEGRAM_CHAT_ID = '';

const isConfigured = (): boolean =>
  TELEGRAM_BOT_TOKEN.length > 0 && TELEGRAM_CHAT_ID.length > 0;

async function sendMessage(text: string): Promise<void> {
  if (!isConfigured()) {
    logger.debug('Telegram alert skipped — no token configured');
    return;
  }

  const result = await request(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      body: { chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' },
    },
  );

  // Alerts are best-effort — a failure must never block saving an order.
  if (!result.ok) logger.warn('Telegram alert failed', result.error.message);
}

/** Message body is byte-identical to the web build's `sendTelegram` call. */
export function notifyNewWorkLog(log: WorkLog): Promise<void> {
  const price = log.price
    ? `\n💰 Үнэ: ${formatNumber(Number(log.price))}₮${log.hasVat ? ' (НӨАТ)' : ''}`
    : '';
  const phone = log.phone ? `\n📞 ${log.phone}` : '';
  const note = log.note ? `\n📝 ${log.note}` : '';
  const time = log.receivedTime ? ` — ${log.receivedTime}` : '';

  return sendMessage(
    `🆕 <b>Шинэ захиалга!</b>${time}\n📋 ${log.job}${price}${phone}${note}`,
  );
}
