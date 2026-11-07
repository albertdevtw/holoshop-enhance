// タレント別統計（05-features F14；D-022；純函式）：依商品的 talent 標籤與品牌名稱歸類品項小計
import type { Order, OrderItem, ProductInfo } from '@/src/data/db';
import { OFFICIAL_VENDOR, REGION_VENDORS, TALENT_VENDORS } from '@/src/site-adapter/product-json';
import { convert, roundTo } from './currency';

export type TalentCategory = 'talent' | 'unit' | 'group' | 'other';
export const TALENT_CATEGORIES: TalentCategory[] = ['talent', 'unit', 'group', 'other'];

/** 固定文字的列（依介面語系翻譯）；其餘列名為標籤或品牌名稱原文 */
export type FixedRow = 'multiGroup' | 'unknown' | 'noTalent';

export interface Classification {
  category: TalentCategory;
  /** 列的識別：原文名稱，或固定列的代碼 */
  name: string;
  fixed: FixedRow | null;
}

const fixed = (category: TalentCategory, row: FixedRow): Classification => ({ category, name: row, fixed: row });
const named = (category: TalentCategory, name: string): Classification => ({ category, name, fixed: null });

const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g, '');

/** 規格名稱中出現的商品 talent；恰好一位時回傳該 talent */
export function talentInVariant(talents: string[], variantTitle: string | null | undefined): string | null {
  if (!variantTitle) return null;
  const title = normalize(variantTitle);
  const hits = talents.filter((t) => title.includes(normalize(t)));
  return hits.length === 1 ? hits[0]! : null;
}

/**
 * 依 F14 規則歸類一個品項（依序判斷）。
 * variantTitle：品項的規格名稱，用來拆分「多人商品但規格分 talent」的情況
 */
export function classifyProduct(product: ProductInfo | undefined, variantTitle?: string | null): Classification {
  if (!product) return fixed('other', 'unknown');
  const talents = product.talents ?? [];
  const vendor = product.vendor ?? '';
  // 特例：以一個 talent 活動的組合（例如 FUWAMOCO）歸タレント
  if (TALENT_VENDORS.includes(vendor)) return named('talent', vendor);
  if (talents.length === 0) return fixed('other', 'noTalent');
  if (talents.length === 1) return named('talent', talents[0]!);
  // 有組合名的商品維持歸組合
  if (vendor && vendor !== OFFICIAL_VENDOR && !REGION_VENDORS.includes(vendor)) return named('unit', vendor);
  // 多人商品但規格只對應一位 talent（例如各 talent 的單品）→ 歸該 talent
  const single = talentInVariant(talents, variantTitle);
  if (single) return named('talent', single);
  if (REGION_VENDORS.includes(vendor)) return named('group', vendor);
  if (talents.length === 2) return named('unit', [...talents].sort((a, b) => a.localeCompare(b, 'ja')).join(' + '));
  const generations = product.generations ?? [];
  if (generations.length === 1) return named('unit', generations[0]!);
  const groups = product.groups ?? [];
  if (groups.length === 1) return named('group', groups[0]!);
  if (groups.length >= 2) return fixed('group', 'multiGroup');
  return fixed('other', 'noTalent');
}

export interface TalentRow {
  category: TalentCategory;
  name: string;
  fixed: FixedRow | null;
  /** 換算成合計幣別的金額 */
  amount: number;
  quantity: number;
}

export interface TalentSummary {
  /** 依分類分組，各分類內依金額由大到小（固定列在最後） */
  rows: Record<TalentCategory, TalentRow[]>;
  subtotals: Record<TalentCategory, number>;
  total: number;
  /** 尚未取得明細的訂單數 */
  pendingOrders: number;
  /** 有品項的幣別沒有匯率而未計入 */
  partial: boolean;
  /** 有訂單的年份（新到舊） */
  years: string[];
}

interface ScanResult {
  pendingOrders: number;
  partial: boolean;
  years: string[];
}

/** 走訪統計範圍內（排除取消、指定年份、已取得小計）的品項，傳入換算後金額與歸類 */
function scanItems(
  orders: Order[],
  products: Map<number, ProductInfo>,
  year: string | null,
  base: string,
  rates: Record<string, number>,
  visit: (order: Order, item: OrderItem, amount: number, c: Classification) => void,
): ScanResult {
  const active = orders.filter((o) => o.status !== 'cancelled' && /^\d{4}/.test(o.date));
  const years = [...new Set(active.map((o) => o.date.slice(0, 4)))].sort().reverse();
  const inRange = year ? active.filter((o) => o.date.startsWith(year)) : active;
  let pendingOrders = 0;
  let partial = false;
  for (const order of inRange) {
    if (order.items.some((i) => i.lineTotal === undefined)) pendingOrders += 1;
    const currency = order.total?.currency;
    for (const item of order.items) {
      if (typeof item.lineTotal !== 'number' || !currency) continue;
      const amount = convert(item.lineTotal, currency, base, rates);
      if (amount === null) {
        partial = true;
        continue;
      }
      const product = item.productId === null ? undefined : products.get(item.productId);
      const variantTitle = product?.variants.find((v) => v.id === item.variantId)?.title ?? item.variantTitleRaw;
      visit(order, item, amount, classifyProduct(product, variantTitle));
    }
  }
  return { pendingOrders, partial, years };
}

export function summarizeByTalent(
  orders: Order[],
  products: Map<number, ProductInfo>,
  year: string | null,
  base: string,
  rates: Record<string, number>,
): TalentSummary {
  const map = new Map<string, TalentRow>();
  const { pendingOrders, partial, years } = scanItems(orders, products, year, base, rates, (_order, item, amount, c) => {
    const key = `${c.category}\u0000${c.name}`;
    const row = map.get(key) ?? { ...c, amount: 0, quantity: 0 };
    row.amount += amount;
    row.quantity += item.quantity;
    map.set(key, row);
  });

  const rows: Record<TalentCategory, TalentRow[]> = { talent: [], unit: [], group: [], other: [] };
  for (const row of map.values()) rows[row.category].push({ ...row, amount: roundTo(row.amount, base) });
  const subtotals = { talent: 0, unit: 0, group: 0, other: 0 } as Record<TalentCategory, number>;
  for (const category of TALENT_CATEGORIES) {
    rows[category].sort((a, b) => Number(a.fixed !== null) - Number(b.fixed !== null) || b.amount - a.amount || a.name.localeCompare(b.name));
    subtotals[category] = roundTo(
      rows[category].reduce((sum, r) => sum + r.amount, 0),
      base,
    );
  }
  const total = roundTo(
    TALENT_CATEGORIES.reduce((sum, c) => sum + subtotals[c], 0),
    base,
  );
  return { rows, subtotals, total, pendingOrders, partial, years };
}

export interface TalentDetailRow {
  key: string;
  handle: string;
  productTitle: string;
  variantTitle: string | null;
  imageUrl: string | null;
  quantity: number;
  /** 換算成合計幣別的合計 */
  total: number;
  /** 合計 ÷ 數量 */
  unitPrice: number;
  /** 最早的注文日（排序用） */
  firstDate: string;
}

export interface TalentDetail {
  rows: TalentDetailRow[];
  quantity: number;
  total: number;
}

/** 某一列的商品明細：不同訂單中同商品＋同規格的品項合併（05-features F14 商品明細） */
export function talentDetail(
  orders: Order[],
  products: Map<number, ProductInfo>,
  year: string | null,
  base: string,
  rates: Record<string, number>,
  target: { category: TalentCategory; name: string },
): TalentDetail {
  const map = new Map<string, TalentDetailRow & { latestDate: string }>();
  let rawTotal = 0;
  scanItems(orders, products, year, base, rates, (order, item, amount, c) => {
    if (c.category !== target.category || c.name !== target.name) return;
    rawTotal += amount;
    const key = `${item.productId ?? item.handle}\u0000${item.variantId ?? item.variantTitleRaw ?? ''}`;
    const row = map.get(key);
    if (!row) {
      map.set(key, {
        key,
        handle: item.handle,
        productTitle: item.productTitle || item.handle,
        variantTitle: item.variantTitleRaw,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        total: amount,
        unitPrice: 0,
        firstDate: order.date,
        latestDate: order.date,
      });
      return;
    }
    row.quantity += item.quantity;
    row.total += amount;
    if (order.date < row.firstDate) row.firstDate = order.date;
    // 名稱與縮圖取最新一筆訂單
    if (order.date >= row.latestDate) {
      row.latestDate = order.date;
      row.productTitle = item.productTitle || item.handle;
      row.variantTitle = item.variantTitleRaw;
      row.imageUrl = item.imageUrl ?? row.imageUrl;
    }
  });
  const rows = [...map.values()]
    .map(({ latestDate: _latest, ...r }) => ({
      ...r,
      total: roundTo(r.total, base),
      unitPrice: roundTo(r.quantity > 0 ? r.total / r.quantity : 0, base),
    }))
    .sort(
      (a, b) =>
        a.firstDate.localeCompare(b.firstDate) ||
        a.productTitle.localeCompare(b.productTitle, 'ja') ||
        (a.variantTitle ?? '').localeCompare(b.variantTitle ?? '', 'ja'),
    );
  return { rows, quantity: rows.reduce((n, r) => n + r.quantity, 0), total: roundTo(rawTotal, base) };
}
