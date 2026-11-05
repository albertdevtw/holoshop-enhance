// 同步狀態機（只在 Service Worker 中使用）：決定下一個工作、套用結果（03-architecture §3.2）
import type { Order, SharedDb, UserDb } from '@/src/data/db';
import { applyDetail, needsDetail, resolveItem, toOrder, withProductIds, type ProductLookup } from '@/src/data/purchases';
import type { ParsedOrder } from '@/src/site-adapter/orders-page';
import {
  AUTO_SYNC_INTERVAL_MS,
  defaultSyncMeta,
  PRODUCT_RETRY_MS,
  type SyncMeta,
  type SyncMode,
  type SyncResult,
  type SyncTask,
} from './types';

const META_KEY = 'sync';

export async function getSyncMeta(db: UserDb): Promise<SyncMeta> {
  const entry = await db.meta.get(META_KEY);
  return { ...defaultSyncMeta(), ...(entry?.value as Partial<SyncMeta> | undefined) };
}

export async function setSyncMeta(db: UserDb, meta: SyncMeta): Promise<void> {
  await db.meta.put({ key: META_KEY, value: meta });
}

/** 是否需要同步：有要求、進行中（續跑）、從未成功、或距上次成功超過間隔 */
export function shouldSync(meta: SyncMeta, now: Date): boolean {
  if (meta.requested || meta.state === 'running') return true;
  if (!meta.lastSuccessAt) return true;
  return now.getTime() - new Date(meta.lastSuccessAt).getTime() > AUTO_SYNC_INTERVAL_MS;
}

/** 開始新的同步，或沿用進行中的進度 */
export function startRun(meta: SyncMeta, now: Date): SyncMeta {
  if (meta.state === 'running' && !meta.requested) return meta;
  const mode: SyncMode = meta.requested ?? (meta.lastSuccessAt ? 'incremental' : 'full');
  return {
    ...meta,
    state: 'running',
    mode,
    phase: mode === 'resolve' ? 'resolve' : 'pages',
    nextPage: 1,
    lastPage: mode === 'resolve' ? meta.lastPage : null,
    pagesDone: 0,
    newOrderCount: 0,
    coverTarget: null,
    covered: true,
    requested: null,
    startedAt: now.toISOString(),
    finishedAt: null,
    error: null,
  };
}

/** 訂單號的數字部分；比較同一天的訂單先後用 */
function orderSeq(orderNumber: string): number {
  return Number(orderNumber.replace(/\D/g, '')) || 0;
}

/** a 是否比 b 舊或相同（依注文日，同日依訂單號） */
export function isOlderOrSame(a: { date: string; orderNumber: string }, b: { date: string; orderNumber: string }): boolean {
  if (a.date !== b.date) return a.date < b.date;
  return orderSeq(a.orderNumber) <= orderSeq(b.orderNumber);
}

/** 本機最舊的未発送訂單（增量同步的涵蓋目標，D-018） */
export async function oldestUnfulfilled(db: UserDb): Promise<{ date: string; orderNumber: string } | null> {
  const orders = await db.orders.filter((o) => o.status === 'unfulfilled').toArray();
  let oldest: { date: string; orderNumber: string } | null = null;
  for (const o of orders) {
    if (!oldest || isOlderOrSame(o, oldest)) oldest = { date: o.date, orderNumber: o.orderNumber };
  }
  return oldest;
}

/** startRun 加上增量同步的涵蓋目標；沿用進行中的同步時不變 */
export async function prepareRun(db: UserDb, meta: SyncMeta, now: Date): Promise<SyncMeta> {
  const next = startRun(meta, now);
  if (next === meta || next.mode !== 'incremental') return next;
  const coverTarget = await oldestUnfulfilled(db);
  return { ...next, coverTarget, covered: coverTarget === null };
}

export async function loadLookup(shared: SharedDb): Promise<ProductLookup> {
  const [handles, products] = await Promise.all([shared.productHandles.toArray(), shared.products.toArray()]);
  return {
    handles: new Map(handles.map((h) => [h.handle, h])),
    products: new Map(products.map((p) => [p.productId, p])),
  };
}

/** 決定下一個工作；沒有工作時回傳 null（同步完成） */
export async function nextTask(db: UserDb, shared: SharedDb, meta: SyncMeta, now: Date): Promise<SyncTask | null> {
  if (meta.phase === 'pages') return { kind: 'page', page: meta.nextPage };

  const [orders, lookup] = await Promise.all([db.orders.toArray(), loadLookup(shared)]);
  for (const order of orders) {
    for (const item of order.items) {
      if (item.productId !== null) continue;
      const known = lookup.handles.get(item.handle);
      const stale = known && known.productId === null && now.getTime() - new Date(known.fetchedAt).getTime() > PRODUCT_RETRY_MS;
      if (!known || stale) return { kind: 'product', handle: item.handle };
    }
  }
  const pending = orders.find(needsDetail);
  if (pending) return { kind: 'detail', orderNumber: pending.orderNumber, path: pending.detailPath };
  return null;
}

/** 寫入一批訂單（同步或被動擷取）；回傳新訂單數與是否整批都已存在 */
export async function ingestOrders(
  db: UserDb,
  shared: SharedDb,
  parsed: ParsedOrder[],
  now: Date,
): Promise<{ added: number; allKnown: boolean; unresolved: boolean }> {
  const lookup = await loadLookup(shared);
  const iso = now.toISOString();
  return db.transaction('rw', db.orders, async () => {
    const existing = await db.orders.bulkGet(parsed.map((p) => p.orderNumber));
    const next = parsed.map((p, i) => toOrder(p, existing[i], lookup, iso));
    await db.orders.bulkPut(next);
    const added = existing.filter((e) => !e).length;
    const unresolved = next.some((o) => o.items.some((it) => it.productId === null) || needsDetail(o));
    return { added, allKnown: added === 0, unresolved };
  });
}

/** 套用一個工作的結果，回傳更新後的同步狀態 */
export async function applyResult(
  db: UserDb,
  shared: SharedDb,
  meta: SyncMeta,
  result: SyncResult,
  now: Date,
): Promise<SyncMeta> {
  const iso = now.toISOString();
  switch (result.kind) {
    case 'error':
      return {
        ...meta,
        state: result.reason === 'needs-login' || result.reason === 'account-mismatch' ? 'needs-login' : 'error',
        error: result.reason,
        finishedAt: iso,
      };

    case 'page': {
      const { added, allKnown } = await ingestOrders(db, shared, result.orders, now);
      const lastPage = Math.max(result.lastPage, result.page);
      const reachedEnd = result.orders.length === 0 || result.page >= lastPage;
      const target = meta.coverTarget;
      const covered = meta.covered || !target || result.orders.some((o) => isOlderOrSame(o, target));
      const stopIncremental = meta.mode === 'incremental' && result.orders.length > 0 && allKnown && covered;
      return {
        ...meta,
        covered,
        lastPage,
        pagesDone: meta.pagesDone + 1,
        nextPage: result.page + 1,
        newOrderCount: meta.newOrderCount + added,
        phase: reachedEnd || stopIncremental ? 'resolve' : 'pages',
      };
    }

    case 'product': {
      await shared.transaction('rw', shared.productHandles, shared.products, async () => {
        await shared.productHandles.put({ handle: result.handle, productId: result.product?.productId ?? null, fetchedAt: iso });
        if (result.product) await shared.products.put(result.product);
      });
      if (result.product) await reresolveOrders(db, shared, result.handle, iso);
      return meta;
    }

    case 'detail': {
      const order = await db.orders.get(result.orderNumber);
      if (order) await db.orders.put(applyDetail(order, result.items, iso));
      return meta;
    }
  }
}

/** 取得商品資訊後，重新解析含該 handle 的訂單品項 */
async function reresolveOrders(db: UserDb, shared: SharedDb, handle: string, iso: string): Promise<void> {
  const lookup = await loadLookup(shared);
  await db.transaction('rw', db.orders, async () => {
    const orders = await db.orders.toArray();
    const changed: Order[] = [];
    for (const order of orders) {
      if (!order.items.some((i) => i.handle === handle)) continue;
      const items = order.items.map((i) => (i.handle === handle ? resolveItem(i, lookup) : i));
      changed.push(withProductIds({ ...order, items, updatedAt: iso }));
    }
    if (changed.length) await db.orders.bulkPut(changed);
  });
}

export function finishRun(meta: SyncMeta, now: Date): SyncMeta {
  const iso = now.toISOString();
  return { ...meta, state: 'idle', finishedAt: iso, lastSuccessAt: iso, error: null };
}
