import { describe, expect, it } from 'vitest';
import {
  findVariantOptions,
  parseProductId,
  parseProductImage,
  parseProductTitle,
  parseSalePeriod,
  parseSalePeriodText,
} from '@/src/site-adapter/product-page';
import { loadFixture } from './fixtures';

const doc = () => loadFixture('product-page.html');

describe('parseSalePeriodText', () => {
  it('日文格式（〜 分隔）', () => {
    expect(parseSalePeriodText('受注受付期間 : 2026年01月10日 21時00分 〜 2026年02月07日 18時00分')).toEqual({
      start: '2026-01-10T21:00:00+09:00',
      end: '2026-02-07T18:00:00+09:00',
    });
  });

  it('日文格式（全形 ～ 分隔）', () => {
    expect(parseSalePeriodText('販売期間 : 2026年3月1日 12時00分 ～ 2026年3月31日 23時59分')?.end).toBe(
      '2026-03-31T23:59:00+09:00',
    );
  });

  it('英文格式', () => {
    expect(parseSalePeriodText('Order Period : 2026/01/10 21:00 ~ 2026/02/07 18:00 (JST)')).toEqual({
      start: '2026-01-10T21:00:00+09:00',
      end: '2026-02-07T18:00:00+09:00',
    });
  });

  it('只有一個日期時結束為 null', () => {
    expect(parseSalePeriodText('Sales Period : 2026/01/10 21:00 ~')).toEqual({
      start: '2026-01-10T21:00:00+09:00',
      end: null,
    });
  });

  it('沒有日期或日期不合法時回傳 null', () => {
    expect(parseSalePeriodText('発送予定日：決済確認後に発送')).toBeNull();
    expect(parseSalePeriodText('2026/13/40 25:00 ~ 2026/14/01 00:00')).toBeNull();
  });
});

describe('商品頁 fixture', () => {
  it('販售期間只取期間標籤的段落', () => {
    expect(parseSalePeriod(doc())).toEqual({
      start: '2026-01-10T21:00:00+09:00',
      end: '2026-02-07T18:00:00+09:00',
    });
  });

  it('沒有期間段落時回傳 null', () => {
    const d = doc();
    d.querySelector('section.Pdt_shipping p')?.remove();
    expect(parseSalePeriod(d)).toBeNull();
  });

  it('商品 ID、標題、圖片', () => {
    expect(parseProductId(doc())).toBe(2000000002);
    expect(parseProductTitle(doc())).toBe('サンプル商品 2026');
    expect(parseProductImage(doc())).toBe('https://shop.hololivepro.com/cdn/shop/files/sample.jpg');
  });

  it('非商品頁沒有商品 ID', () => {
    const d = doc();
    d.getElementById('__st')!.textContent = 'var __st={"cid":1,"p":"home"};';
    expect(parseProductId(d)).toBeNull();
  });
});

describe('findVariantOptions', () => {
  it('取得規格 ID 與名稱元素', () => {
    const options = findVariantOptions(doc());
    expect(options.map((o) => o.variantId)).toEqual([3000000001, 3000000002]);
    expect(options[1]?.titleElement.textContent).toBe('グッズ B');
  });
});
