// 訂單清單頁（/account?page=N）解析（05-features F2）
import type { OrderStatus } from '@/src/data/db';

export interface ParsedOrderItem {
  handle: string;
  productTitle: string;
  variantTitleRaw: string | null;
  quantity: number;
  /** 品項縮圖（絕對網址）；沒有時為 null */
  imageUrl: string | null;
}

/** 發送予定日：原文與計算用日期（YYYY-MM-DD，JST）；無法解析時 date 為 null */
export interface ShipBy {
  text: string;
  date: string | null;
}

export interface ParsedOrder {
  orderNumber: string;
  detailPath: string;
  date: string;
  status: OrderStatus;
  statusText: string;
  total: { amount: number; currency: string } | null;
  /** 沒有發送予定日欄位時為 null */
  shipBy: ShipBy | null;
  items: ParsedOrderItem[];
}

export interface ParsedOrdersPage {
  orders: ParsedOrder[];
  /** 分頁中的最大頁碼；沒有分頁時為 1 */
  lastPage: number;
}

/** 由 class 修飾詞判斷狀態，與語系無關 */
export function statusFromBadge(badge: Element | null): OrderStatus {
  if (!badge) return 'unknown';
  const modifier = [...badge.classList]
    .find((c) => c.startsWith('OrderStatusBadge--'))
    ?.slice('OrderStatusBadge--'.length)
    .toLowerCase();
  if (!modifier) return 'unknown';
  if (modifier.includes('cancel')) return 'cancelled';
  if (modifier.startsWith('partial')) return 'partial';
  if (modifier === 'unfulfilled') return 'unfulfilled';
  if (modifier === 'fulfilled') return 'fulfilled';
  return 'unknown';
}

/** 取出網址路徑中的商品 handle */
export function handleFromHref(href: string | null): string | null {
  if (!href) return null;
  const m = href.match(/\/products\/([^/?#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** 解析品項名稱：`商品名 - 規格 ×N個`；商品名以 img alt 為準，因為商品名本身可能含 ` - ` */
export function parseItemName(
  name: string,
  productTitle: string,
): { variantTitleRaw: string | null; quantity: number } {
  const text = name.replace(/\s+/g, ' ').trim();
  const qty = text.match(/\s*×\s*(\d+)\s*(?:個)?\s*$/);
  const quantity = qty?.[1] ? Number(qty[1]) : 1;
  const body = qty ? text.slice(0, qty.index).trim() : text;

  const title = productTitle.replace(/\s+/g, ' ').trim();
  if (title && body.startsWith(`${title} - `)) {
    return { variantTitleRaw: body.slice(title.length + 3).trim() || null, quantity };
  }
  if (title && body === title) return { variantTitleRaw: null, quantity };
  // 商品名與 alt 對不上時，以最後一個 ` - ` 切分（不保證正確，交給規格比對或詳細頁備援）
  const idx = body.lastIndexOf(' - ');
  return { variantTitleRaw: idx >= 0 ? body.slice(idx + 3).trim() : null, quantity };
}

const pad = (n: number) => String(n).padStart(2, '0');

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth(year, month)) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * 解析發送予定日（05-features F12）：
 * `YYYY年MM月DD日` 或 `YYYY/MM/DD` → 該日；只有年月時，上旬 → 10 日、中旬 → 20 日、下旬或只有月份 → 月底
 */
export function parseShipBy(raw: string): ShipBy | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const norm = text.normalize('NFKC');

  const full = norm.match(/(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})/);
  if (full) return { text, date: validDate(Number(full[1]), Number(full[2]), Number(full[3])) };

  const ym = norm.match(/(\d{4})\s*[年/.-]\s*(\d{1,2})\s*月?\s*(上旬|中旬|下旬|初旬|末)?/);
  if (ym) {
    const year = Number(ym[1]);
    const month = Number(ym[2]);
    if (month < 1 || month > 12) return { text, date: null };
    const part = ym[3];
    const day = part === '上旬' || part === '初旬' ? 10 : part === '中旬' ? 20 : lastDayOfMonth(year, month);
    return { text, date: validDate(year, month, day) };
  }
  return { text, date: null };
}

/** 縮圖網址轉為絕對網址（網站常用 `//cdn...` 或相對路徑） */
function absoluteUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  try {
    return new URL(src, 'https://shop.hololivepro.com').href;
  } catch {
    return null;
  }
}

function metaValue(card: Element, labels: string[]): Element | null {
  for (const row of card.querySelectorAll('.OrderCard_metaRow')) {
    const label = row.querySelector('.OrderCard_metaLabel')?.textContent?.trim().toUpperCase() ?? '';
    if (labels.some((l) => label === l.toUpperCase())) return row.querySelector('.OrderCard_metaValue');
  }
  return null;
}

function parseOrderCard(card: Element): ParsedOrder | null {
  const orderNumber = metaValue(card, ['注文番号', 'ORDER NUMBER'])?.textContent?.trim();
  const detailHref = card.querySelector('a[href*="/account/orders/"]')?.getAttribute('href');
  if (!orderNumber || !detailHref) return null;

  const dateEl = metaValue(card, ['注文日', 'ORDER DATE']);
  const date = dateEl?.querySelector('time')?.getAttribute('datetime') ?? dateEl?.textContent?.trim().replace(/\//g, '-') ?? '';

  const shipByEl = metaValue(card, ['発送予定日', 'SHIPPING PERIOD']);
  const shipBy = shipByEl ? parseShipBy(shipByEl.textContent ?? '') : null;

  const badge = card.querySelector('.OrderStatusBadge');
  const totalEl = card.querySelector('.OrderCard_totalValue');
  const price = Number(totalEl?.getAttribute('data-price'));
  const currency = totalEl?.getAttribute('data-currency');

  const items: ParsedOrderItem[] = [];
  for (const li of card.querySelectorAll('li.OrderItem')) {
    const nameEl = li.querySelector('a.OrderItem_name');
    const handle = handleFromHref(nameEl?.getAttribute('href') ?? null);
    if (!nameEl || !handle) continue;
    const img = li.querySelector('img.OrderItem_img');
    const productTitle = img?.getAttribute('alt')?.trim() ?? '';
    const src = img?.getAttribute('src') ?? img?.getAttribute('data-src');
    items.push({
      handle,
      productTitle,
      ...parseItemName(nameEl.textContent ?? '', productTitle),
      imageUrl: absoluteUrl(src),
    });
  }

  return {
    orderNumber,
    detailPath: new URL(detailHref, 'https://shop.hololivepro.com').pathname,
    date,
    status: statusFromBadge(badge),
    statusText: badge?.textContent?.trim() ?? '',
    total: Number.isFinite(price) && currency ? { amount: price / 100, currency } : null,
    shipBy,
    items,
  };
}

export function parseOrdersPage(doc: Document): ParsedOrdersPage {
  const orders = [...doc.querySelectorAll('li.OrderCard')]
    .map(parseOrderCard)
    .filter((o): o is ParsedOrder => o !== null);
  const pages = [...doc.querySelectorAll('.Pagination a[href*="page="]')]
    .map((a) => Number(new URL(a.getAttribute('href') ?? '', 'https://shop.hololivepro.com').searchParams.get('page')))
    .filter((n) => Number.isInteger(n) && n > 0);
  return { orders, lastPage: Math.max(1, ...pages) };
}
