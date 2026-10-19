import dayjs from 'dayjs';

/**
 * Converts a picked YYYY-MM-DD date into the timestamp sent to the server.
 * Today -> the current time (never in the future). Past days -> local noon,
 * which keeps the calendar date stable across time zones.
 */
export function toPlayedAt(date: string, now: Date = new Date()): string {
  const picked = dayjs(date);
  if (picked.isSame(dayjs(now), 'day')) return now.toISOString();
  return picked.hour(12).toISOString();
}
