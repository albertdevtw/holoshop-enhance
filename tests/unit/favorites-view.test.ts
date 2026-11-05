import { describe, expect, it } from 'vitest';
import type { Favorite } from '@/src/data/db';
import { deadlineState, favoriteTitle, filterFavorites, productUrl, sortFavorites } from '@/src/ui/favorites-view';

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

describe('deadlineState', () => {
  it('依截止時間判斷狀態', () => {
    expect(deadlineState(fav(1, null), now)).toEqual({ kind: 'none' });
    expect(deadlineState(fav(1, '2026-02-01T11:00:00+09:00'), now)).toEqual({ kind: 'ended' });
    expect(deadlineState(fav(1, '2026-02-01T18:00:00+09:00'), now)).toEqual({ kind: 'today' });
    expect(deadlineState(fav(1, '2026-02-05T12:00:00+09:00'), now)).toEqual({ kind: 'days', days: 4 });
  });
});

describe('sortFavorites', () => {
  it('未截止由近到遠 → 無期間 → 已截止', () => {
    const list = [
      fav(1, '2026-01-20T00:00:00+09:00'),
      fav(2, null),
      fav(3, '2026-03-01T00:00:00+09:00'),
      fav(4, '2026-02-10T00:00:00+09:00'),
    ];
    expect(sortFavorites(list, now).map((f) => f.productId)).toEqual([4, 3, 2, 1]);
  });
});

describe('favoriteTitle / productUrl', () => {
  it('依語系選名稱，沒有時退回另一語系', () => {
    const f = fav(1, null, { title: { ja: '日本語名' } });
    expect(favoriteTitle(f, 'en')).toBe('日本語名');
    expect(favoriteTitle({ ...f, title: { ja: '日', en: 'EN' } }, 'en')).toBe('EN');
    expect(favoriteTitle({ ...f, title: {} }, 'ja')).toBe('item_1');
  });

  it('英文介面使用 /en/ 前綴', () => {
    expect(productUrl(fav(1, null), 'en')).toBe('https://shop.hololivepro.com/en/products/item_1');
    expect(productUrl(fav(1, null), 'zh-TW')).toBe('https://shop.hololivepro.com/products/item_1');
  });
});

describe('filterFavorites', () => {
  const list = [
    { ...fav(1, '2026-02-05T12:00:00+09:00'), purchased: 0 },
    { ...fav(2, '2026-02-05T12:00:00+09:00'), purchased: 2 },
    { ...fav(3, '2026-01-20T12:00:00+09:00'), purchased: 0 }, // 已截止未購買
    { ...fav(4, '2026-01-20T12:00:00+09:00'), purchased: 1 }, // 已截止已購買
  ];
  const ids = (l: { productId: number }[]) => l.map((f) => f.productId);

  it('預設（未購買、隱藏已截止）', () => {
    expect(ids(filterFavorites(list, 'unpurchased', false, now))).toEqual([1]);
  });

  it('顯示已截止', () => {
    expect(ids(filterFavorites(list, 'unpurchased', true, now))).toEqual([1, 3]);
    expect(ids(filterFavorites(list, 'all', true, now))).toEqual([1, 2, 3, 4]);
  });

  it('已購買的已截止商品不隱藏', () => {
    expect(ids(filterFavorites(list, 'purchased', false, now))).toEqual([2, 4]);
    expect(ids(filterFavorites(list, 'all', false, now))).toEqual([1, 2, 4]);
  });
});
