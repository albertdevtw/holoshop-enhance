import { describe, expect, it } from 'vitest';
import type { Order, ProductInfo } from '@/src/data/db';
import { classifyProduct, summarizeByTalent, talentDetail } from '@/src/stats/talent';

const OFFICIAL = 'hololive production official shop';

function product(id: number, vendor: string, talents: string[], groups: string[] = [], generations: string[] = []): ProductInfo {
  return { productId: id, handle: `h${id}`, variants: [], vendor, talents, groups, generations, fetchedAt: '2026-01-01T00:00:00Z' };
}

describe('classifyProduct（05-features F14）', () => {
  it('單人商品歸タレント（品牌名稱是官方商店也一樣）', () => {
    expect(classifyProduct(product(1, OFFICIAL, ['AZKi'], ['ホロライブ']))).toMatchObject({ category: 'talent', name: 'AZKi' });
  });

  it('特例：FUWAMOCO 歸タレント', () => {
    expect(classifyProduct(product(11, 'FUWAMOCO', ['フワワ・アビスガード', 'モココ・アビスガード'], ['ホロライブ']))).toMatchObject({
      category: 'talent',
      name: 'FUWAMOCO',
    });
  });

  it('多人商品的規格只對應一位 talent 時歸該 talent', () => {
    const mascot = product(12, OFFICIAL, ['星街すいせい', '桃鈴ねね', '角巻わため'], ['ホロライブ'], ['x', 'y', 'z']);
    expect(classifyProduct(mascot, '角巻わため / おかぶりマスコット 角巻わため')).toMatchObject({ category: 'talent', name: '角巻わため' });
    // 規格沒有 talent 名、或含多位時照原規則
    expect(classifyProduct(mascot, 'セット / フルセット')).toMatchObject({ category: 'group', name: 'ホロライブ' });
    expect(classifyProduct(mascot, '星街すいせい＆角巻わため セット')).toMatchObject({ category: 'group' });
    const region = product(13, 'hololive Indonesia', ['ムーナ・ホシノヴァ', 'アユンダ・リス']);
    expect(classifyProduct(region, 'アクスタ ムーナ・ホシノヴァ')).toMatchObject({ category: 'talent', name: 'ムーナ・ホシノヴァ' });
  });

  it('有組合名的商品不依規格拆分', () => {
    expect(classifyProduct(product(14, 'FubuMio', ['白上フブキ', '大神ミオ']), 'アクスタ 白上フブキ')).toMatchObject({
      category: 'unit',
      name: 'FubuMio',
    });
  });

  it('專屬品牌名稱的多人商品歸ユニット', () => {
    expect(classifyProduct(product(2, 'FubuMio', ['白上フブキ', '大神ミオ']))).toMatchObject({ category: 'unit', name: 'FubuMio' });
    expect(classifyProduct(product(3, 'hololive ASOBIMAWARITAI', ['a', 'b', 'c', 'd']))).toMatchObject({
      category: 'unit',
      name: 'hololive ASOBIMAWARITAI',
    });
  });

  it('官方品牌、恰好 2 人時以「A + B」歸ユニット', () => {
    expect(classifyProduct(product(4, OFFICIAL, ['百鬼あやめ', '星街すいせい'], ['ホロライブ']))).toMatchObject({
      category: 'unit',
      name: '星街すいせい + 百鬼あやめ',
    });
  });

  it('單一期別歸ユニット', () => {
    expect(classifyProduct(product(5, OFFICIAL, ['a', 'b', 'c', 'd'], ['ホロライブ'], ['ホロライブ3期生']))).toMatchObject({
      category: 'unit',
      name: 'ホロライブ3期生',
    });
  });

  it('地區品牌、單一 Group、多個 Group 歸グループ', () => {
    expect(classifyProduct(product(6, 'hololive Indonesia', ['a', 'b', 'c'], ['ホロライブインドネシア'], ['x', 'y']))).toMatchObject({
      category: 'group',
      name: 'hololive Indonesia',
    });
    expect(classifyProduct(product(7, OFFICIAL, ['a', 'b', 'c'], ['ホロライブ'], ['x', 'y']))).toMatchObject({ category: 'group', name: 'ホロライブ' });
    expect(classifyProduct(product(8, OFFICIAL, ['a', 'b', 'c'], ['ホロライブ', 'ホロライブEnglish'], ['x', 'y']))).toMatchObject({
      category: 'group',
      fixed: 'multiGroup',
    });
  });

  it('沒有 talent、商品不明、多人且無 Group 歸その他', () => {
    expect(classifyProduct(product(9, OFFICIAL, []))).toMatchObject({ category: 'other', fixed: 'noTalent' });
    expect(classifyProduct(undefined)).toMatchObject({ category: 'other', fixed: 'unknown' });
    expect(classifyProduct(product(10, OFFICIAL, ['a', 'b', 'c'], [], ['x', 'y']))).toMatchObject({ category: 'other', fixed: 'noTalent' });
  });
});

describe('summarizeByTalent', () => {
  const products = new Map([
    [1, product(1, OFFICIAL, ['AZKi'])],
    [2, product(2, 'FubuMio', ['白上フブキ', '大神ミオ'])],
  ]);
  function order(no: string, date: string, items: Order['items'], status: Order['status'] = 'fulfilled', currency = 'JPY'): Order {
    return {
      orderNumber: no,
      detailPath: '/account/orders/x',
      date,
      status,
      statusText: '',
      total: { amount: 0, currency },
      shipBy: null,
      items,
      productIds: [],
      detailFetchedAt: null,
      updatedAt: '2026-01-01T00:00:00Z',
    };
  }
  const item = (productId: number | null, lineTotal: number | null | undefined, quantity = 1) => ({
    handle: 'h',
    productId,
    productTitle: '',
    variantTitleRaw: null,
    variantId: null,
    quantity,
    imageUrl: null,
    ...(lineTotal === undefined ? {} : { lineTotal }),
  });
  const orders = [
    order('#1', '2026-03-01', [item(1, 3000, 2), item(2, 5000)]),
    order('#2', '2025-03-01', [item(1, 1000)], 'fulfilled', 'TWD'),
    order('#3', '2026-04-01', [item(1, 9999)], 'cancelled'),
    order('#4', '2026-05-01', [item(1, undefined), item(null, 700)]),
  ];

  it('依分類加總品項小計並換算，排除取消，統計未取得明細的訂單', () => {
    const s = summarizeByTalent(orders, products, null, 'JPY', {});
    expect(s.rows.talent).toEqual([{ category: 'talent', name: 'AZKi', fixed: null, amount: 3000 + 4800, quantity: 3 }]);
    expect(s.rows.unit[0]).toMatchObject({ name: 'FubuMio', amount: 5000 });
    expect(s.rows.other[0]).toMatchObject({ fixed: 'unknown', amount: 700 });
    expect(s.total).toBe(3000 + 4800 + 5000 + 700);
    expect(s.pendingOrders).toBe(1);
    expect(s.years).toEqual(['2026', '2025']);
  });

  it('商品明細：同商品同規格跨訂單合併，依最早注文日排序，合計與列表一致', () => {
    const withVariant = (productId: number, lineTotal: number, quantity: number, variantId: number, title: string) => ({
      ...item(productId, lineTotal, quantity),
      variantId,
      productTitle: title,
      variantTitleRaw: `v${variantId}`,
    });
    const detailOrders = [
      order('#10', '2026-06-01', [withVariant(1, 2000, 2, 11, '新しい名前')]),
      order('#11', '2026-01-01', [withVariant(1, 1000, 1, 11, '古い名前'), withVariant(1, 500, 1, 12, '別の商品')]),
      order('#13', '2025-12-01', [withVariant(1, 700, 1, 13, 'Z')]),
      order('#12', '2026-03-01', [withVariant(2, 9000, 1, 21, 'FubuMio')]),
    ];
    const d = talentDetail(detailOrders, products, null, 'JPY', {}, { category: 'talent', name: 'AZKi' });
    // 最早注文日由舊到新；同日依商品名
    expect(d.rows.map((r) => [r.variantTitle, r.quantity, r.total, r.unitPrice, r.firstDate])).toEqual([
      ['v13', 1, 700, 700, '2025-12-01'],
      ['v11', 3, 3000, 1000, '2026-01-01'],
      ['v12', 1, 500, 500, '2026-01-01'],
    ]);
    // 名稱取最新一筆訂單
    expect(d.rows[1]?.productTitle).toBe('新しい名前');
    expect(d.quantity).toBe(5);
    const list = summarizeByTalent(detailOrders, products, null, 'JPY', {});
    expect(d.total).toBe(list.rows.talent[0]?.amount);
  });

  it('依年份篩選', () => {
    const s = summarizeByTalent(orders, products, '2025', 'JPY', {});
    expect(s.total).toBe(4800);
  });
});
