import { describe, expect, it } from 'vitest';
import type { Favorite } from '@/src/data/db';
import { dueFavorites } from '@/src/reminder/rules';

const now = new Date('2026-02-01T12:00:00+09:00');

function fav(id: number, end: string | null, extra: Partial<Favorite> = {}): Favorite {
  return {
    productId: id,
    handle: `item_${id}`,
    title: { ja: `商品${id}` },
    imageUrl: null,
    salePeriod: end === null ? null : { start: null, end },
    addedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    muted: false,
    ...extra,
  };
}

describe('dueFavorites', () => {
  const list = [
    fav(1, '2026-02-05T18:00:00+09:00'), // 4 天內 → 提醒
    fav(2, '2026-02-20T18:00:00+09:00'), // 超過 7 天
    fav(3, '2026-01-31T18:00:00+09:00'), // 已截止
    fav(4, null), // 無期間
    fav(5, '2026-02-02T00:00:00+09:00', { muted: true }), // 靜音
    fav(6, '2026-02-03T00:00:00+09:00'), // 已購買
    fav(7, '2026-02-01T18:00:00+09:00'), // 今天截止 → 提醒且排最前
  ];
  const purchased = new Map([[6, 1]]);

  it('只回傳符合條件者並依截止時間排序', () => {
    expect(dueFavorites(list, purchased, 7, now).map((f) => f.productId)).toEqual([7, 1]);
  });

  it('天數設定影響範圍', () => {
    expect(dueFavorites(list, purchased, 1, now).map((f) => f.productId)).toEqual([7]);
    expect(dueFavorites(list, purchased, 30, now).map((f) => f.productId)).toEqual([7, 1, 2]);
  });
});
