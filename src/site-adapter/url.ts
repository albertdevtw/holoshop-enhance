// 商店網址解析：語系、頁面類型、商品 handle

export const SITE_ORIGIN = 'https://shop.hololivepro.com';

export type SiteLocale = 'ja' | 'en';
export type PageType = 'product' | 'collection' | 'account' | 'order-detail' | 'downloads' | 'other';

export interface PageInfo {
  locale: SiteLocale;
  type: PageType;
  /** 商品頁才有 */
  handle?: string;
}

/** 解析商店網址；非商店網域時回傳 null */
export function parsePageUrl(input: string | URL): PageInfo | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.origin !== SITE_ORIGIN) return null;

  let path = url.pathname;
  let locale: SiteLocale = 'ja';
  if (path === '/en' || path.startsWith('/en/')) {
    locale = 'en';
    path = path.slice(3) || '/';
  }

  const product = path.match(/^\/(?:collections\/[^/]+\/)?products\/([^/?#.]+)\/?$/);
  if (product?.[1]) {
    return { locale, type: 'product', handle: decodeURIComponent(product[1]) };
  }
  if (/^\/collections\/[^/]+\/?$/.test(path)) return { locale, type: 'collection' };
  if (/^\/apps\/downloads\/orders\/[^/]+\/?$/.test(path)) return { locale, type: 'downloads' };
  if (/^\/account\/orders\/[^/]+\/?$/.test(path)) return { locale, type: 'order-detail' };
  if (/^\/account\/?$/.test(path)) return { locale, type: 'account' };
  return { locale, type: 'other' };
}

/**
 * 訂單詳細頁路徑是否合法：`/account/orders/<token>` 或 `/en/account/orders/<token>`，且只在商店網域
 * （匯入與同步抓詳細頁前使用，避免向外部網站發出請求；code-review CR-007）
 */
export function isOrderDetailPath(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\/(?:en\/)?account\/orders\/[A-Za-z0-9_-]+\/?$/.test(value)) return false;
  try {
    const url = new URL(value, SITE_ORIGIN);
    return url.origin === SITE_ORIGIN && url.pathname === value;
  } catch {
    return false;
  }
}
