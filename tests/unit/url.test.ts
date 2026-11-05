import { describe, expect, it } from 'vitest';
import { parsePageUrl } from '@/src/site-adapter/url';

describe('parsePageUrl', () => {
  it('日文商品頁', () => {
    expect(parsePageUrl('https://shop.hololivepro.com/products/sample_item_2026')).toEqual({
      locale: 'ja',
      type: 'product',
      handle: 'sample_item_2026',
    });
  });

  it('英文商品頁（/en/ 前綴）與查詢字串', () => {
    expect(parsePageUrl('https://shop.hololivepro.com/en/products/sample_item?variant=1')).toEqual({
      locale: 'en',
      type: 'product',
      handle: 'sample_item',
    });
  });

  it('collection 底下的商品頁', () => {
    expect(parsePageUrl('https://shop.hololivepro.com/collections/new/products/sample')?.handle).toBe('sample');
  });

  it('數位內容列表', () => {
    expect(parsePageUrl('https://shop.hololivepro.com/apps/downloads/orders/123?line_items_page=2')).toEqual({
      locale: 'ja',
      type: 'downloads',
    });
    expect(parsePageUrl('https://shop.hololivepro.com/en/apps/downloads/orders/123')?.type).toBe('downloads');
  });

  it('商品列表頁', () => {
    expect(parsePageUrl('https://shop.hololivepro.com/collections/all')).toEqual({ locale: 'ja', type: 'collection' });
    expect(parsePageUrl('https://shop.hololivepro.com/en/collections/new?sort_by=x')).toEqual({
      locale: 'en',
      type: 'collection',
    });
  });

  it('帳號與訂單詳細頁', () => {
    expect(parsePageUrl('https://shop.hololivepro.com/account?page=2')?.type).toBe('account');
    expect(parsePageUrl('https://shop.hololivepro.com/en/account')).toEqual({ locale: 'en', type: 'account' });
    expect(parsePageUrl('https://shop.hololivepro.com/account/orders/abc123')?.type).toBe('order-detail');
  });

  it('首頁與英文首頁', () => {
    expect(parsePageUrl('https://shop.hololivepro.com/')).toEqual({ locale: 'ja', type: 'other' });
    expect(parsePageUrl('https://shop.hololivepro.com/en')).toEqual({ locale: 'en', type: 'other' });
  });

  it('/en 開頭但不是語系前綴的路徑不視為英文', () => {
    expect(parsePageUrl('https://shop.hololivepro.com/entry')?.locale).toBe('ja');
  });

  it('其他網域或無效網址回傳 null', () => {
    expect(parsePageUrl('https://example.com/products/x')).toBeNull();
    expect(parsePageUrl('not a url')).toBeNull();
  });
});
