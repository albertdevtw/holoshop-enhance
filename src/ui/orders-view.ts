// 未発送訂單清單的排序與顯示用計算（05-features F12；純函式，便於測試）
import type { Order } from '@/src/data/db';
import type { UiLocale } from '@/src/i18n';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ShipState =
  | { kind: 'none' }
  | { kind: 'today' }
  | { kind: 'days'; days: number }
  | { kind: 'overdue'; days: number };

/** JST 今天的日期序號（自 1970-01-01 起的天數） */
function jstDayIndex(now: Date): number {
  return Math.floor((now.getTime() + JST_OFFSET_MS) / DAY_MS);
}

function dateIndex(date: string): number | null {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

/** 剩餘天數：以發送予定日當天 23:59:59（JST）為準 */
export function shipState(order: Order, now: Date = new Date()): ShipState {
  const date = order.shipBy?.date;
  const target = date ? dateIndex(date) : null;
  if (target === null) return { kind: 'none' };
  const diff = target - jstDayIndex(now);
  if (diff === 0) return { kind: 'today' };
  return diff > 0 ? { kind: 'days', days: diff } : { kind: 'overdue', days: -diff };
}

function orderSeq(orderNumber: string): number {
  return Number(orderNumber.replace(/\D/g, '')) || 0;
}

/** 排序：發送予定日由舊到新 → 沒有日期的依注文日由舊到新 */
export function sortUnfulfilled<T extends Order>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const da = a.shipBy?.date ?? null;
    const db = b.shipBy?.date ?? null;
    if (da !== db) {
      if (da === null) return 1;
      if (db === null) return -1;
      return da < db ? -1 : 1;
    }
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return orderSeq(a.orderNumber) - orderSeq(b.orderNumber);
  });
}

export type OrderFilter = 'unfulfilled' | 'fulfilled' | 'all';
export const ORDER_FILTERS: OrderFilter[] = ['unfulfilled', 'fulfilled', 'all'];

/** 還有品項未出貨（未発送＋部分發送） */
export function isPendingShipment(order: Order): boolean {
  return order.status === 'unfulfilled' || order.status === 'partial';
}

/** 有訂單的年份（新到舊） */
export function orderYears(orders: Order[]): string[] {
  return [...new Set(orders.map((o) => o.date.slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort().reverse();
}

/**
 * 訂單分頁的篩選與排序（05-features F15）：
 * 未発送不限年份、依發送予定日排序；発送済み／すべて依年份篩選、注文日由新到舊
 */
export function filterOrders<T extends Order>(orders: T[], filter: OrderFilter, year: string | null): T[] {
  if (filter === 'unfulfilled') return sortUnfulfilled(orders.filter(isPendingShipment));
  const list = orders.filter((o) => (filter === 'all' || o.status === 'fulfilled') && (!year || o.date.startsWith(year)));
  return list.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : orderSeq(b.orderNumber) - orderSeq(a.orderNumber)));
}

const intlLocale: Record<UiLocale, string> = { ja: 'ja-JP', en: 'en-US', 'zh-TW': 'zh-TW' };

/** 金額：依幣別格式化 */
export function formatMoney(total: Order['total'], locale: UiLocale): string {
  if (!total) return '';
  try {
    return new Intl.NumberFormat(intlLocale[locale], { style: 'currency', currency: total.currency }).format(total.amount);
  } catch {
    return `${total.amount} ${total.currency}`;
  }
}

/** 注文日顯示：YYYY/MM/DD */
export function formatOrderDate(date: string): string {
  return date.replace(/-/g, '/');
}

const prefix = (locale: UiLocale) => (locale === 'en' ? '/en' : '');

export function orderDetailUrl(order: Order, locale: UiLocale): string {
  return `https://shop.hololivepro.com${prefix(locale)}${order.detailPath}`;
}

export function itemProductUrl(handle: string, locale: UiLocale): string {
  return `https://shop.hololivepro.com${prefix(locale)}/products/${encodeURIComponent(handle)}`;
}
