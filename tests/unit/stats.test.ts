import { describe, expect, it } from 'vitest';
import type { Order } from '@/src/data/db';
import { migrateGlobalState } from '@/src/data/global';
import { convert, rateToJpy, roundTo, toJpyRate } from '@/src/stats/currency';
import { currenciesInOrders, summarizeByPeriod } from '@/src/stats/period';

function order(no: string, date: string, total: Order['total'], status: Order['status'] = 'fulfilled'): Order {
  return {
    orderNumber: no,
    detailPath: `/account/orders/${no}`,
    date,
    status,
    statusText: '',
    total,
    shipBy: null,
    items: [],
    productIds: [],
    detailFetchedAt: null,
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const orders = [
  order('#1', '2026-11-03', { amount: 12000, currency: 'JPY' }),
  order('#2', '2026-11-20', { amount: 2346, currency: 'TWD' }),
  order('#3', '2026-10-01', { amount: 1050, currency: 'TWD' }),
  order('#4', '2025-08-01', { amount: 8800, currency: 'JPY' }),
  order('#5', '2026-11-21', { amount: 99999, currency: 'JPY' }, 'cancelled'),
  order('#6', '2026-09-01', null),
];

describe('匯率', () => {
  it('自訂值優先，其次內建值；未知幣別為 null', () => {
    expect(rateToJpy('TWD', {})).toBe(4.8);
    expect(rateToJpy('TWD', { TWD: 5 })).toBe(5);
    expect(rateToJpy('XYZ', {})).toBeNull();
  });

  it('任兩幣別換算與四捨五入', () => {
    expect(convert(1000, 'TWD', 'JPY', {})).toBe(4800);
    expect(convert(150, 'JPY', 'USD', {})).toBe(1);
    expect(convert(1, 'XYZ', 'JPY', {})).toBeNull();
    expect(roundTo(123.456, 'JPY')).toBe(123);
    expect(roundTo(123.456, 'TWD')).toBe(123.46);
  });

  it('以合計幣別輸入的匯率換回 JPY 基準', () => {
    // 合計幣別 TWD 時輸入 1 USD = 31 TWD
    expect(toJpyRate(31, 'TWD', {})).toBeCloseTo(148.8);
  });
});

describe('期間別統計', () => {
  it('依年統計，排除取消，金額不明另計', () => {
    const s = summarizeByPeriod(orders, 'year', null, 'JPY', {});
    expect(s.rows.map((r) => r.key)).toEqual(['2026', '2025']);
    expect(s.rows[0]).toMatchObject({ amounts: { JPY: 12000, TWD: 3396 }, orderCount: 4, converted: Math.round(12000 + 3396 * 4.8) });
    expect(s.total.converted).toBe(Math.round(12000 + 8800 + 3396 * 4.8));
    expect(s.unknownAmount).toBe(1);
    expect(s.years).toEqual(['2026', '2025']);
    // 換算後金額大的幣別在前
    expect(s.currencies).toEqual(['JPY', 'TWD']);
  });

  it('依月統計只列出所選年份，且只顯示出現過的幣別', () => {
    const s = summarizeByPeriod(orders, 'month', '2025', 'JPY', {});
    expect(s.rows.map((r) => r.key)).toEqual(['2025-08']);
    expect(s.currencies).toEqual(['JPY']);
  });

  it('沒有匯率的幣別不計入換算並標示', () => {
    const s = summarizeByPeriod([order('#1', '2026-01-01', { amount: 10, currency: 'XYZ' }), ...orders], 'year', null, 'JPY', {});
    expect(s.rows[0]?.partial).toBe(true);
    expect(s.total.partial).toBe(true);
  });

  it('合計幣別切換', () => {
    const s = summarizeByPeriod(orders, 'year', null, 'TWD', {});
    expect(s.rows[1]?.converted).toBe(roundTo(8800 / 4.8, 'TWD'));
  });

  it('訂單中出現過的幣別', () => {
    expect(currenciesInOrders(orders)).toEqual(['JPY', 'TWD']);
  });
});

describe('統計設定遷移', () => {
  it('舊設定補上預設的統計設定', () => {
    const state = migrateGlobalState({ settings: { localeMode: 'ja' } });
    expect(state.settings.stats).toEqual({ baseCurrency: 'JPY', rates: {} });
  });
});
