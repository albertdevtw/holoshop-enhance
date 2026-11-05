// 訂單整理與購買數量彙總（純函式，Service Worker 與測試共用）
import type { Order, OrderItem, ProductHandle, ProductInfo } from './db';
import type { ParsedDetailItem } from '@/src/site-adapter/order-detail';
import type { ParsedOrder } from '@/src/site-adapter/orders-page';
import { matchVariant } from '@/src/site-adapter/product-json';

export interface PurchaseSummary {
  productId: number;
  total: number;
  /** key = variantId */
  byVariant: Record<number, number>;
  /** 規格對不到的數量（只計入 total） */
  unmatched: number;
}

export interface ProductLookup {
  handles: Map<string, ProductHandle>;
  products: Map<number, ProductInfo>;
}

/** 依已知的商品資料填入 productId 與 variantId；已有 variantId 的品項保留 */
export function resolveItem(item: OrderItem, lookup: ProductLookup): OrderItem {
  const productId = item.productId ?? lookup.handles.get(item.handle)?.productId ?? null;
  if (productId === null) return { ...item, productId: null };
  if (item.variantId !== null) return { ...item, productId };
  const product = lookup.products.get(productId);
  return { ...item, productId, variantId: product ? matchVariant(item.variantTitleRaw, product) : null };
}

/** 將解析結果轉成儲存格式；保留既有訂單中已解析出的 productId／variantId */
export function toOrder(parsed: ParsedOrder, existing: Order | undefined, lookup: ProductLookup, now: string): Order {
  const items = parsed.items.map((p, i) => {
    const prev = existing?.items[i];
    const same = prev && prev.handle === p.handle && prev.variantTitleRaw === p.variantTitleRaw;
    const base: OrderItem = {
      handle: p.handle,
      productTitle: p.productTitle,
      variantTitleRaw: p.variantTitleRaw,
      quantity: p.quantity,
      imageUrl: p.imageUrl,
      productId: same ? prev.productId : null,
      variantId: same ? prev.variantId : null,
    };
    return resolveItem(base, lookup);
  });
  return withProductIds({
    ...parsed,
    items,
    productIds: [],
    detailFetchedAt: existing?.detailFetchedAt ?? null,
    updatedAt: now,
  });
}

export function withProductIds(order: Order): Order {
  const ids = [...new Set(order.items.map((i) => i.productId).filter((v): v is number => v !== null))];
  return { ...order, productIds: ids };
}

/** 以詳細頁結果補上 variantId（依 handle 與出現順序對應） */
export function applyDetail(order: Order, detail: ParsedDetailItem[], now: string): Order {
  const pool = [...detail];
  const items = order.items.map((item) => {
    if (item.variantId !== null) return item;
    const idx = pool.findIndex((d) => d.handle === item.handle && d.variantId !== null);
    if (idx < 0) return item;
    const [hit] = pool.splice(idx, 1);
    return { ...item, variantId: hit?.variantId ?? null };
  });
  return { ...order, items, detailFetchedAt: now, updatedAt: now };
}

/** 是否需要抓詳細頁：有已知商品但規格對不到的品項，且尚未抓過 */
export function needsDetail(order: Order): boolean {
  return !order.detailFetchedAt && order.items.some((i) => i.productId !== null && i.variantId === null);
}

export function summarizePurchases(orders: Order[], productId: number): PurchaseSummary {
  const summary: PurchaseSummary = { productId, total: 0, byVariant: {}, unmatched: 0 };
  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    for (const item of order.items) {
      if (item.productId !== productId) continue;
      summary.total += item.quantity;
      if (item.variantId === null) summary.unmatched += item.quantity;
      else summary.byVariant[item.variantId] = (summary.byVariant[item.variantId] ?? 0) + item.quantity;
    }
  }
  return summary;
}
