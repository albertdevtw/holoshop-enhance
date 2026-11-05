import { describe, expect, it } from 'vitest';
import { daysUntil, formatJst, jstIso } from '@/src/shared/jst';

describe('jst', () => {
  it('jstIso 產生 +09:00 字串並拒絕不合法日期', () => {
    expect(jstIso(2026, 2, 7, 18, 0)).toBe('2026-02-07T18:00:00+09:00');
    expect(jstIso(2026, 2, 30, 0, 0)).toBeNull();
  });

  it('formatJst 一律以 JST 顯示', () => {
    expect(formatJst('2026-02-07T09:00:00Z')).toBe('2026/02/07 18:00 (JST)');
  });

  it('daysUntil 無條件進位', () => {
    const now = new Date('2026-02-01T00:00:00+09:00');
    expect(daysUntil('2026-02-01T12:00:00+09:00', now)).toBe(1);
    expect(daysUntil('2026-02-08T00:00:00+09:00', now)).toBe(7);
    expect(daysUntil('2026-01-31T00:00:00+09:00', now)).toBeLessThanOrEqual(0);
  });
});
