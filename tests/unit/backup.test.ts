import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Favorite, Order } from '@/src/data/db';
import { deleteUserDb, openSharedDb, openUserDb } from '@/src/data/db';
import {
  backupFileName,
  buildBackup,
  exportAccount,
  exportShared,
  importAccount,
  importShared,
  mergeNewer,
  parseBackup,
  summarizeBackup,
} from '@/src/data/backup';

const CID = '1000000001';

function fav(id: number, updatedAt: string): Favorite {
  return {
    productId: id,
    handle: `item_${id}`,
    title: { ja: `商品${id}` },
    imageUrl: null,
    salePeriod: null,
    addedAt: '2026-01-01T00:00:00Z',
    updatedAt,
    muted: false,
  };
}

function order(no: string, updatedAt: string): Order {
  return {
    orderNumber: no,
    detailPath: '/account/orders/token',
    date: '2026-01-01',
    status: 'fulfilled',
    statusText: '',
    total: null,
    shipBy: null,
    items: [],
    productIds: [],
    detailFetchedAt: null,
    updatedAt,
  };
}

describe('parseBackup', () => {
  const valid = buildBackup(
    [{ customerId: CID, label: '#0001', favorites: [fav(1, '2026-01-01T00:00:00Z')], orders: [order('#1', '2026-01-01T00:00:00Z')] }],
    new Date('2026-02-01T00:00:00Z'),
  );

  it('接受合法檔案並產生摘要', () => {
    const res = parseBackup(JSON.stringify(valid));
    expect(res.ok).toBe(true);
    if (res.ok) expect(summarizeBackup(res.backup)).toEqual([{ customerId: CID, label: '#0001', favorites: 1, orders: 1 }]);
  });

  it('拒絕欄位不完整的資料（code-review CR-004）', () => {
    const withFavorite = (f: unknown) =>
      parseBackup(JSON.stringify({ ...valid, accounts: [{ ...valid.accounts[0], favorites: [f] }] }));
    const withOrder = (o: unknown) =>
      parseBackup(JSON.stringify({ ...valid, accounts: [{ ...valid.accounts[0], orders: [o] }] }));
    const { title: _title, ...noTitle } = fav(1, '2026-01-01T00:00:00Z');
    expect(withFavorite(noTitle)).toEqual({ ok: false, error: 'invalid-data' });
    expect(withFavorite({ ...fav(1, 'not a date'), updatedAt: 'not a date' })).toEqual({ ok: false, error: 'invalid-data' });
    expect(withOrder({ ...order('#1', '2026-01-01T00:00:00Z'), items: [null] })).toEqual({ ok: false, error: 'invalid-data' });
    const item = { handle: 'a', productId: 5, productTitle: 'A', variantTitleRaw: null, variantId: null, quantity: 0, imageUrl: null };
    expect(withOrder({ ...order('#1', '2026-01-01T00:00:00Z'), items: [item] })).toEqual({ ok: false, error: 'invalid-data' });
    expect(withOrder({ ...order('#1', '2026-01-01T00:00:00Z'), status: 'shipped' })).toEqual({ ok: false, error: 'invalid-data' });
  });

  it('productIds 由品項重新計算，舊檔缺少的欄位補為 null', () => {
    const { shipBy: _shipBy, ...legacy } = order('#1', '2026-01-01T00:00:00Z');
    const item = { handle: 'a', productId: 5, productTitle: 'A', variantTitleRaw: null, variantId: null, quantity: 1 };
    const res = parseBackup(
      JSON.stringify({ ...valid, accounts: [{ ...valid.accounts[0], orders: [{ ...legacy, items: [item], productIds: [999] }] }] }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const o = res.backup.accounts[0]!.orders[0]!;
    expect(o.productIds).toEqual([5]);
    expect(o.shipBy).toBeNull();
    expect(o.items[0]?.imageUrl).toBeNull();
  });

  it('拒絕不合法的檔案', () => {
    expect(parseBackup('{')).toEqual({ ok: false, error: 'invalid-json' });
    expect(parseBackup('{"app":"other","accounts":[]}')).toEqual({ ok: false, error: 'not-backup' });
    expect(parseBackup(JSON.stringify({ ...valid, schemaVersion: 999 }))).toEqual({ ok: false, error: 'newer-version' });
    const broken = { ...valid, accounts: [{ ...valid.accounts[0], favorites: [{ nope: 1 }] }] };
    expect(parseBackup(JSON.stringify(broken))).toEqual({ ok: false, error: 'invalid-data' });
  });

  it('檔名格式', () => {
    expect(backupFileName(new Date(2026, 1, 3, 4, 5))).toBe('holoshop-enhance-20260203-0405.json');
  });
});

describe('mergeNewer', () => {
  it('只保留較新或不存在的資料', () => {
    const existing = [fav(1, '2026-01-02T00:00:00Z'), undefined, fav(3, '2026-01-01T00:00:00Z')];
    const incoming = [fav(1, '2026-01-01T00:00:00Z'), fav(2, '2026-01-01T00:00:00Z'), fav(3, '2026-01-05T00:00:00Z')];
    expect(mergeNewer(existing, incoming).map((f) => f.productId)).toEqual([2, 3]);
  });
});

describe('export / import', () => {
  beforeEach(() => deleteUserDb(CID));

  it('匯出後匯入可還原，重複匯入不重複寫入', async () => {
    const db = openUserDb(CID);
    await db.favorites.bulkPut([fav(1, '2026-01-01T00:00:00Z'), fav(2, '2026-01-01T00:00:00Z')]);
    await db.orders.put(order('#1', '2026-01-01T00:00:00Z'));
    const exported = await exportAccount(db, { customerId: CID, label: '#0001', firstSeenAt: '', lastSeenAt: '' });

    await deleteUserDb(CID);
    const fresh = openUserDb(CID);
    expect(await importAccount(fresh, exported)).toEqual({ favorites: 2, orders: 1 });
    expect(await fresh.favorites.count()).toBe(2);
    expect(await importAccount(fresh, exported)).toEqual({ favorites: 0, orders: 0 });
  });
});

describe('共用商品資訊（D-024）', () => {
  beforeEach(async () => {
    const shared = openSharedDb();
    await shared.products.clear();
    await shared.productHandles.clear();
  });

  const product = (id: number, handle: string, fetchedAt: string) => ({
    productId: id,
    handle,
    variants: [{ id: id * 10, title: 'A' }],
    vendor: 'V',
    talents: ['T'],
    groups: [],
    generations: [],
    fetchedAt,
  });
  const item = (handle: string, productId: number | null) => ({
    handle,
    productId,
    productTitle: handle,
    variantTitleRaw: null,
    variantId: null,
    quantity: 1,
    imageUrl: null,
    lineTotal: 100,
  });

  it('只匯出帳號用到的商品（含商品不存在的紀錄），匯入後可還原', async () => {
    const shared = openSharedDb();
    const t = '2026-01-01T00:00:00.000Z';
    await shared.products.bulkPut([product(5, 'a', t), product(6, 'b', t), product(7, 'unused', t)]);
    await shared.productHandles.bulkPut([
      { handle: 'a', productId: 5, fetchedAt: t },
      { handle: 'b', productId: 6, fetchedAt: t },
      { handle: 'gone', productId: null, fetchedAt: t },
      { handle: 'unused', productId: 7, fetchedAt: t },
    ]);
    const account = {
      customerId: CID,
      label: '#0001',
      favorites: [{ ...fav(6, t), handle: 'b' }],
      orders: [{ ...order('#1', t), items: [item('a', 5), item('gone', null)], productIds: [5] }],
    };
    const data = await exportShared(shared, [account]);
    expect(data.products.map((p) => p.productId).sort()).toEqual([5, 6]);
    expect(data.productHandles.map((h) => h.handle).sort()).toEqual(['a', 'b', 'gone']);

    // 匯出檔經過驗證後再匯入到空的共用庫
    const parsed = parseBackup(JSON.stringify(buildBackup([account], new Date(t), data)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await shared.products.clear();
    await shared.productHandles.clear();
    expect(await importShared(shared, parsed.backup.shared!)).toBe(5);
    expect((await shared.products.get(5))?.talents).toEqual(['T']);
    expect((await shared.productHandles.get('gone'))?.productId).toBeNull();
  });

  it('本機較新的商品資訊不被覆蓋', async () => {
    const shared = openSharedDb();
    await shared.products.put({ ...product(5, 'a', '2026-02-01T00:00:00.000Z'), vendor: 'local' });
    const written = await importShared(shared, { products: [product(5, 'a', '2026-01-01T00:00:00.000Z')], productHandles: [] });
    expect(written).toBe(0);
    expect((await shared.products.get(5))?.vendor).toBe('local');
  });

  it('沒有 shared 的舊備份仍可匯入；不合法的商品資訊拒絕整個檔案', () => {
    const base = buildBackup([{ customerId: CID, label: '#0001', favorites: [], orders: [] }], new Date());
    expect(parseBackup(JSON.stringify(base)).ok).toBe(true);
    const bad = { ...base, shared: { products: [{ productId: 'x', handle: 'a', variants: [], fetchedAt: 'bad' }], productHandles: [] } };
    expect(parseBackup(JSON.stringify(bad))).toEqual({ ok: false, error: 'invalid-data' });
  });
});
