import { describe, expect, it } from 'vitest';
import type { Order } from '@/src/data/db';
import { filterOrders, formatMoney, orderDetailUrl, orderYears, shipState, sortUnfulfilled } from '@/src/ui/orders-view';

function order(orderNumber: string, date: string, shipDate: string | null): Order {
  return {
    orderNumber,
    detailPath: `/account/orders/${orderNumber}`,
    date,
    status: 'unfulfilled',
    statusText: '未発送',
    total: { amount: 2346, currency: 'TWD' },
    shipBy: shipDate === null ? null : { text: shipDate, date: shipDate },
    items: [],
    productIds: [],
    detailFetchedAt: null,
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('shipState', () => {
  // JST 2026-11-05 10:00
  const now = new Date('2026-11-05T01:00:00Z');

  it('以 JST 日期計算剩餘／超過天數', () => {
    expect(shipState(order('#1', '2026-01-01', '2026-11-08'), now)).toEqual({ kind: 'days', days: 3 });
    expect(shipState(order('#1', '2026-01-01', '2026-11-05'), now)).toEqual({ kind: 'today' });
    expect(shipState(order('#1', '2026-01-01', '2026-11-02'), now)).toEqual({ kind: 'overdue', days: 3 });
    expect(shipState(order('#1', '2026-01-01', null), now)).toEqual({ kind: 'none' });
  });

  it('JST 換日：UTC 前一天 15:00 已是 JST 當天', () => {
    expect(shipState(order('#1', '2026-01-01', '2026-11-05'), new Date('2026-11-04T15:00:00Z'))).toEqual({ kind: 'today' });
    expect(shipState(order('#1', '2026-01-01', '2026-11-05'), new Date('2026-11-04T14:59:59Z'))).toEqual({
      kind: 'days',
      days: 1,
    });
  });
});

describe('sortUnfulfilled', () => {
  it('發送予定日由舊到新，沒有日期的依注文日排在最後', () => {
    const list = [
      order('#5', '2026-03-01', null),
      order('#4', '2026-02-01', '2026-12-31'),
      order('#3', '2026-01-01', null),
      order('#2', '2026-04-01', '2026-06-30'),
      order('#1', '2026-04-01', '2026-06-30'),
    ];
    expect(sortUnfulfilled(list).map((o) => o.orderNumber)).toEqual(['#1', '#2', '#4', '#3', '#5']);
  });
});

describe('格式化', () => {
  it('金額與網址', () => {
    expect(formatMoney({ amount: 2346, currency: 'JPY' }, 'ja')).toMatch(/2,346/);
    expect(formatMoney(null, 'ja')).toBe('');
    expect(orderDetailUrl(order('#1', '2026-01-01', null), 'en')).toBe('https://shop.hololivepro.com/en/account/orders/#1');
  });
});

describe('filterOrders（F15）', () => {
  const withStatus = (no: string, date: string, status: Order['status'], ship: string | null = null): Order => ({
    ...order(no, date, ship),
    status,
  });
  const list = [
    withStatus('#1', '2025-12-01', 'unfulfilled', '2026-03-31'),
    withStatus('#2', '2026-02-01', 'partial', '2026-01-31'),
    withStatus('#3', '2026-03-01', 'fulfilled'),
    withStatus('#4', '2026-05-01', 'fulfilled'),
    withStatus('#5', '2025-06-01', 'fulfilled'),
    withStatus('#6', '2026-04-01', 'cancelled'),
  ];

  it('未発送含部分發送、不受年份影響、依發送予定日排序', () => {
    expect(filterOrders(list, 'unfulfilled', '2026').map((o) => o.orderNumber)).toEqual(['#2', '#1']);
  });

  it('発送済み依年份篩選，注文日新到舊', () => {
    expect(filterOrders(list, 'fulfilled', '2026').map((o) => o.orderNumber)).toEqual(['#4', '#3']);
    expect(filterOrders(list, 'fulfilled', null).map((o) => o.orderNumber)).toEqual(['#4', '#3', '#5']);
  });

  it('すべて含取消的訂單', () => {
    expect(filterOrders(list, 'all', '2026').map((o) => o.orderNumber)).toEqual(['#4', '#6', '#3', '#2']);
  });

  it('年份清單新到舊', () => {
    expect(orderYears(list)).toEqual(['2026', '2025']);
  });
});
