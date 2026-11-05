import { describe, expect, it } from 'vitest';
import type { Order, ProductInfo } from '@/src/data/db';
import { applyDetail, needsDetail, summarizePurchases, toOrder, type ProductLookup } from '@/src/data/purchases';
import { matchVariant, parseProductJson } from '@/src/site-adapter/product-json';
import { parseOrderDetail } from '@/src/site-adapter/order-detail';
import { parseOrdersPage } from '@/src/site-adapter/orders-page';
import { loadFixture } from './fixtures';

const NOW = '2026-02-01T00:00:00.000Z';

const setProduct: ProductInfo = {
  productId: 2000000002,
  handle: 'sample_set_2026',
  variants: [
    { id: 3000000001, title: 'セット / フルセット（旧名称）' },
    { id: 3000000003, title: 'グッズ / アクリルスタンド' },
  ],
  fetchedAt: NOW,
};
const singleProduct: ProductInfo = {
  productId: 2000000009,
  handle: 'sample_single',
  variants: [{ id: 3000000009, title: 'Default Title' }],
  fetchedAt: NOW,
};

const lookup: ProductLookup = {
  handles: new Map([
    ['sample_set_2026', { handle: 'sample_set_2026', productId: 2000000002, fetchedAt: NOW }],
    ['sample_single', { handle: 'sample_single', productId: 2000000009, fetchedAt: NOW }],
  ]),
  products: new Map([
    [setProduct.productId, setProduct],
    [singleProduct.productId, singleProduct],
  ]),
};

function orders(): Order[] {
  return parseOrdersPage(loadFixture('orders-page.html')).orders.map((p) => toOrder(p, undefined, lookup, NOW));
}

describe('parseProductJson / matchVariant', () => {
  it('解析商品 JSON', () => {
    expect(parseProductJson({ id: 5, variants: [{ id: 6, title: 'A' }] }, 'h', NOW)).toEqual({
      productId: 5,
      handle: 'h',
      variants: [{ id: 6, title: 'A' }],
      fetchedAt: NOW,
    });
    expect(parseProductJson({ nope: 1 }, 'h', NOW)).toBeNull();
  });

  it('規格名稱比對（忽略全半形與空白差異）', () => {
    expect(matchVariant('グッズ / アクリルスタンド', setProduct)).toBe(3000000003);
    expect(matchVariant('グッズ /  アクリルスタンド', setProduct)).toBe(3000000003);
    expect(matchVariant('セット / フルセット', setProduct)).toBeNull();
    expect(matchVariant(null, singleProduct)).toBe(3000000009);
  });
});

describe('toOrder / summarizePurchases', () => {
  it('填入商品 ID 與規格，對不到的需要詳細頁', () => {
    const [o3, o2] = orders();
    expect(o3?.productIds).toEqual([2000000002, 2000000009]);
    expect(o3?.items[0]?.variantId).toBeNull();
    expect(needsDetail(o3!)).toBe(true);
    expect(o2?.items[0]?.variantId).toBe(3000000003);
    expect(needsDetail(o2!)).toBe(false);
  });

  it('彙總排除取消的訂單，對不到的規格計入 unmatched', () => {
    expect(summarizePurchases(orders(), 2000000002)).toEqual({
      productId: 2000000002,
      total: 3,
      byVariant: { 3000000003: 1 },
      unmatched: 2,
    });
    expect(summarizePurchases(orders(), 2000000009).total).toBe(1);
  });

  it('套用詳細頁後規格補齊', () => {
    const [o3] = orders();
    const fixed = applyDetail(o3!, parseOrderDetail(loadFixture('order-detail.html')), NOW);
    expect(fixed.items[0]?.variantId).toBe(3000000001);
    expect(needsDetail(fixed)).toBe(false);
    expect(summarizePurchases([fixed], 2000000002).byVariant).toEqual({ 3000000001: 2 });
  });

  it('重新解析時保留已解析的規格', () => {
    const [o3] = orders();
    const fixed = applyDetail(o3!, parseOrderDetail(loadFixture('order-detail.html')), NOW);
    const parsed = parseOrdersPage(loadFixture('orders-page.html')).orders[0]!;
    const again = toOrder(parsed, fixed, lookup, NOW);
    expect(again.items[0]?.variantId).toBe(3000000001);
    expect(again.detailFetchedAt).toBe(NOW);
  });
});
