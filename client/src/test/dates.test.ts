import dayjs from 'dayjs';
import { toPlayedAt } from '../lib/dates';

describe('toPlayedAt', () => {
  it('uses the current time for today, so it is never in the future', () => {
    const now = new Date(2026, 9, 20, 9, 15); // 9:15 local, before noon
    expect(toPlayedAt('2026-10-20', now)).toBe(now.toISOString());
  });

  it('uses local noon for past dates', () => {
    const now = new Date(2026, 9, 20, 9, 15);
    const sent = dayjs(toPlayedAt('2026-10-18', now));
    expect(sent.format('YYYY-MM-DD HH:mm')).toBe('2026-10-18 12:00');
  });
});
