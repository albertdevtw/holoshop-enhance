import { describe, expect, it } from 'vitest';
import { parseItemName, parseOrdersPage, parseShipBy, statusFromBadge } from '@/src/site-adapter/orders-page';
import { parseOrderDetail } from '@/src/site-adapter/order-detail';
import { loadFixture } from './fixtures';

describe('parseOrdersPage', () => {
  const page = parseOrdersPage(loadFixture('orders-page.html'));

  it('解析每筆訂單與分頁', () => {
    expect(page.lastPage).toBe(12);
    expect(page.orders.map((o) => o.orderNumber)).toEqual(['#1000003', '#1000002', '#1000001']);
  });

  it('訂單欄位', () => {
    const o = page.orders[0]!;
    expect(o).toMatchObject({
      date: '2026-01-20',
      status: 'unfulfilled',
      statusText: '未発送',
      detailPath: '/account/orders/token0003',
      total: { amount: 2346, currency: 'TWD' },
    });
    expect(page.orders[2]?.status).toBe('cancelled');
    expect(page.orders[2]?.total).toBeNull();
  });

  it('品項：商品名含 " - " 時仍以 alt 去前綴', () => {
    expect(page.orders[0]?.items).toEqual([
      {
        handle: 'sample_set_2026',
        productTitle: 'サンプル商品 - Parade -Special-',
        variantTitleRaw: 'セット / フルセット',
        quantity: 2,
        imageUrl: 'https://shop.hololivepro.com/x.jpg',
      },
      {
        handle: 'sample_single',
        productTitle: '単品サンプル',
        variantTitleRaw: null,
        quantity: 1,
        imageUrl: 'https://shop.hololivepro.com/x.jpg',
      },
    ]);
  });

  it('發送予定日：有欄位時解析，沒有時為 null', () => {
    expect(page.orders[0]?.shipBy).toEqual({ text: '2026年05月下旬', date: '2026-05-31' });
    expect(page.orders[1]?.shipBy).toBeNull();
  });

  it('英文版數量格式（×N）', () => {
    expect(page.orders[2]?.items[0]?.quantity).toBe(3);
  });

  it('沒有分頁時 lastPage 為 1', () => {
    const d = loadFixture('orders-page.html');
    d.querySelector('.Pagination')?.remove();
    expect(parseOrdersPage(d).lastPage).toBe(1);
  });
});

describe('parseItemName', () => {
  it('alt 對不上時以最後一個 " - " 切分', () => {
    expect(parseItemName('新しい名前 - グッズ / 缶バッジ ×4個', '古い名前')).toEqual({
      variantTitleRaw: 'グッズ / 缶バッジ',
      quantity: 4,
    });
  });
});

describe('statusFromBadge', () => {
  const badge = (cls: string) => {
    const el = document.createElement('span');
    el.className = `OrderStatusBadge ${cls}`;
    return el;
  };
  it('依 class 修飾詞判斷', () => {
    expect(statusFromBadge(badge('OrderStatusBadge--fulfilled'))).toBe('fulfilled');
    expect(statusFromBadge(badge('OrderStatusBadge--partially_fulfilled'))).toBe('partial');
    expect(statusFromBadge(badge('OrderStatusBadge--something'))).toBe('unknown');
    expect(statusFromBadge(null)).toBe('unknown');
  });
});

describe('parseOrderDetail', () => {
  it('取得 handle、variant ID、規格與數量', () => {
    expect(parseOrderDetail(loadFixture('order-detail.html'))).toEqual([
      { handle: 'sample_set_2026', variantId: 3000000001, variantTitle: 'セット / フルセット（旧名称）', quantity: 2 },
      { handle: 'sample_single', variantId: 3000000009, variantTitle: null, quantity: 1 },
    ]);
  });
});

describe('parseShipBy', () => {
  it('明確日期', () => {
    expect(parseShipBy('2026年06月15日までに発送')).toEqual({ text: '2026年06月15日までに発送', date: '2026-06-15' });
    expect(parseShipBy('2026/6/5')?.date).toBe('2026-06-05');
    expect(parseShipBy('２０２６年７月１日')?.date).toBe('2026-07-01');
  });

  it('模糊日期取邏輯上的最後一天', () => {
    expect(parseShipBy('2026年11月上旬')?.date).toBe('2026-11-10');
    expect(parseShipBy('2026年11月中旬')?.date).toBe('2026-11-20');
    expect(parseShipBy('2026年11月下旬')?.date).toBe('2026-11-30');
    expect(parseShipBy('2028年2月')?.date).toBe('2028-02-29');
  });

  it('無法解析時保留原文、date 為 null；空白回傳 null', () => {
    expect(parseShipBy('未定')).toEqual({ text: '未定', date: null });
    expect(parseShipBy('2026年13月')?.date).toBeNull();
    expect(parseShipBy('   ')).toBeNull();
  });
});
