import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Favorite, Order } from '@/src/data/db';
import { deleteUserDb, openUserDb } from '@/src/data/db';
import {
  backupFileName,
  buildBackup,
  exportAccount,
  importAccount,
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
