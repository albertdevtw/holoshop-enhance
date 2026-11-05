import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteUserDb, openSharedDb, openUserDb, type ProductInfo } from '@/src/data/db';
import { summarizePurchases } from '@/src/data/purchases';
import {
  applyResult,
  finishRun,
  getSyncMeta,
  nextTask,
  prepareRun,
  setSyncMeta,
  shouldSync,
  startRun,
} from '@/src/sync/engine';
import type { Order } from '@/src/data/db';
import { parseOrderDetail } from '@/src/site-adapter/order-detail';
import { parseOrdersPage } from '@/src/site-adapter/orders-page';
import { defaultSyncMeta, type SyncMeta, type SyncResult } from '@/src/sync/types';
import { loadFixture } from './fixtures';

const CID = '1000000001';
const now = new Date('2026-02-01T00:00:00Z');
const parsed = parseOrdersPage(loadFixture('orders-page.html'));

async function reset() {
  await deleteUserDb(CID);
  const shared = openSharedDb();
  await shared.productHandles.clear();
  await shared.products.clear();
}

async function step(meta: SyncMeta, result: SyncResult) {
  return applyResult(openUserDb(CID), openSharedDb(), meta, result, now);
}

describe('sync engine', () => {
  beforeEach(reset);

  it('shouldSync / startRun', () => {
    const meta = defaultSyncMeta();
    expect(shouldSync(meta, now)).toBe(true);
    expect(startRun(meta, now)).toMatchObject({ state: 'running', mode: 'full', phase: 'pages', nextPage: 1 });
    const recent = { ...meta, lastSuccessAt: '2026-01-31T23:00:00Z' };
    expect(shouldSync(recent, now)).toBe(false);
    expect(startRun({ ...recent, requested: 'incremental' }, now).mode).toBe('incremental');
    expect(startRun({ ...recent, requested: 'resolve' }, now).phase).toBe('resolve');
  });

  it('完整同步：逐頁 → 換算商品 → 詳細頁 → 完成', async () => {
    const db = openUserDb(CID);
    let meta = startRun(defaultSyncMeta(), now);

    // 第 1 頁
    expect(await nextTask(db, openSharedDb(), meta, now)).toEqual({ kind: 'page', page: 1 });
    meta = await step(meta, { kind: 'page', page: 1, orders: parsed.orders, lastPage: 2 });
    expect(meta).toMatchObject({ phase: 'pages', nextPage: 2, pagesDone: 1, lastPage: 2, newOrderCount: 3 });

    // 最後一頁（空頁也會結束）
    meta = await step(meta, { kind: 'page', page: 2, orders: [], lastPage: 2 });
    expect(meta.phase).toBe('resolve');

    // 換算商品（順序不拘）
    const products: Record<'sample_set_2026' | 'sample_single', ProductInfo | null> = {
      sample_set_2026: {
        productId: 2000000002,
        handle: 'sample_set_2026',
        variants: [
          { id: 3000000001, title: 'セット / フルセット（旧名称）' },
          { id: 3000000003, title: 'グッズ / アクリルスタンド' },
        ],
        fetchedAt: now.toISOString(),
      },
      sample_single: null, // 已下架
    };
    const seen: string[] = [];
    for (let i = 0; i < 2; i++) {
      const task = await nextTask(db, openSharedDb(), meta, now);
      expect(task?.kind).toBe('product');
      const handle = (task as { handle: keyof typeof products }).handle;
      seen.push(handle);
      meta = await step(meta, { kind: 'product', handle, product: products[handle] });
    }
    expect(seen.sort()).toEqual(['sample_set_2026', 'sample_single']);

    // 規格對不到 → 詳細頁
    expect(await nextTask(db, openSharedDb(), meta, now)).toEqual({
      kind: 'detail',
      orderNumber: '#1000003',
      path: '/account/orders/token0003',
    });
    meta = await step(meta, {
      kind: 'detail',
      orderNumber: '#1000003',
      items: parseOrderDetail(loadFixture('order-detail.html')),
    });
    expect(await nextTask(db, openSharedDb(), meta, now)).toBeNull();

    const orders = await db.orders.toArray();
    expect(summarizePurchases(orders, 2000000002)).toEqual({
      productId: 2000000002,
      total: 3,
      byVariant: { 3000000001: 2, 3000000003: 1 },
      unmatched: 0,
    });
  });

  it('增量同步遇到整頁都是已知訂單時停止', async () => {
    const db = openUserDb(CID);
    let meta = startRun(defaultSyncMeta(), now);
    meta = await step(meta, { kind: 'page', page: 1, orders: parsed.orders, lastPage: 5 });
    await setSyncMeta(db, finishRun(meta, now));

    meta = startRun({ ...(await getSyncMeta(db)), requested: 'incremental' }, now);
    meta = await step(meta, { kind: 'page', page: 1, orders: parsed.orders, lastPage: 5 });
    expect(meta).toMatchObject({ phase: 'resolve', newOrderCount: 0 });
  });

  it('增量同步延伸到涵蓋本機最舊的未発送訂單（D-018）', async () => {
    const db = openUserDb(CID);
    let meta = startRun(defaultSyncMeta(), now);
    meta = await step(meta, { kind: 'page', page: 1, orders: parsed.orders, lastPage: 5 });
    await setSyncMeta(db, finishRun(meta, now));
    // 更舊的未発送訂單（不在第 1 頁）
    const old: Order = { ...(await db.orders.get('#1000001'))!, orderNumber: '#0999999', date: '2025-06-01', status: 'unfulfilled' };
    await db.orders.put(old);

    meta = await prepareRun(db, { ...(await getSyncMeta(db)), requested: 'incremental' }, now);
    expect(meta).toMatchObject({ coverTarget: { date: '2025-06-01', orderNumber: '#0999999' }, covered: false });

    // 第 1 頁全是已知訂單，但還沒涵蓋目標 → 繼續
    meta = await step(meta, { kind: 'page', page: 1, orders: parsed.orders, lastPage: 5 });
    expect(meta).toMatchObject({ phase: 'pages', nextPage: 2, covered: false });

    // 看到比目標更舊的訂單 → 停止
    const older = { ...parsed.orders[2]!, orderNumber: '#0999000', date: '2025-05-01' };
    await step(meta, { kind: 'page', page: 2, orders: [older], lastPage: 5 }); // 新訂單 → 寫入
    meta = await step(meta, { kind: 'page', page: 2, orders: [older], lastPage: 5 });
    expect(meta).toMatchObject({ phase: 'resolve', covered: true });
  });

  it('沒有未発送訂單時涵蓋目標為 null', async () => {
    const db = openUserDb(CID);
    const meta = await prepareRun(db, { ...defaultSyncMeta(), lastSuccessAt: '2026-01-01T00:00:00Z', requested: 'incremental' }, now);
    expect(meta).toMatchObject({ mode: 'incremental', coverTarget: null, covered: true });
  });

  it('需要重新登入時停止並記錄狀態', async () => {
    const meta = await step(startRun(defaultSyncMeta(), now), { kind: 'error', reason: 'needs-login' });
    expect(meta).toMatchObject({ state: 'needs-login', error: 'needs-login' });
  });
});
