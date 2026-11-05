// 匯出／匯入（05-features F8、04-data-model §5）
import type { Favorite, Order, UserDb } from './db';
import { GLOBAL_SCHEMA_VERSION, type AccountInfo } from './global';

export const BACKUP_APP = 'holoshop-enhance';

export interface BackupAccount {
  customerId: string;
  label: string;
  favorites: Favorite[];
  orders: Order[];
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  accounts: BackupAccount[];
}

export type BackupError = 'invalid-json' | 'not-backup' | 'newer-version' | 'invalid-data';

export interface ImportSummary {
  customerId: string;
  label: string;
  favorites: number;
  orders: number;
}

export async function exportAccount(db: UserDb, account: AccountInfo): Promise<BackupAccount> {
  const [favorites, orders] = await Promise.all([db.favorites.toArray(), db.orders.toArray()]);
  return { customerId: account.customerId, label: account.label, favorites, orders };
}

export function buildBackup(accounts: BackupAccount[], now: Date): BackupFile {
  return { app: BACKUP_APP, schemaVersion: GLOBAL_SCHEMA_VERSION, exportedAt: now.toISOString(), accounts };
}

/** 匯出檔名：holoshop-enhance-yyyyMMdd-HHmm.json（本機時間） */
export function backupFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${BACKUP_APP}-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function validFavorite(v: unknown): v is Favorite {
  return isObject(v) && Number.isSafeInteger(v.productId) && typeof v.handle === 'string' && typeof v.updatedAt === 'string';
}

function validOrder(v: unknown): v is Order {
  return isObject(v) && typeof v.orderNumber === 'string' && Array.isArray(v.items) && typeof v.updatedAt === 'string';
}

/** 解析並驗證匯入檔；版本較新（未來版本匯出）時拒絕 */
export function parseBackup(text: string): { ok: true; backup: BackupFile } | { ok: false; error: BackupError } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP || !Array.isArray(raw.accounts)) return { ok: false, error: 'not-backup' };
  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion > GLOBAL_SCHEMA_VERSION) {
    return { ok: false, error: 'newer-version' };
  }
  const accounts: BackupAccount[] = [];
  for (const a of raw.accounts) {
    if (
      !isObject(a) ||
      typeof a.customerId !== 'string' ||
      !/^\d+$/.test(a.customerId) ||
      !Array.isArray(a.favorites) ||
      !Array.isArray(a.orders) ||
      !a.favorites.every(validFavorite) ||
      !a.orders.every(validOrder)
    ) {
      return { ok: false, error: 'invalid-data' };
    }
    accounts.push({
      customerId: a.customerId,
      label: typeof a.label === 'string' ? a.label : `#${a.customerId.slice(-4)}`,
      favorites: a.favorites,
      orders: a.orders,
    });
  }
  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      schemaVersion: raw.schemaVersion,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      accounts,
    },
  };
}

export function summarizeBackup(backup: BackupFile): ImportSummary[] {
  return backup.accounts.map((a) => ({
    customerId: a.customerId,
    label: a.label,
    favorites: a.favorites.length,
    orders: a.orders.length,
  }));
}

/** 合併：同一筆資料以 updatedAt 較新者為準（D-012）；回傳需要寫入的資料 */
export function mergeNewer<T extends { updatedAt: string }>(
  existing: (T | undefined)[],
  incoming: T[],
): T[] {
  return incoming.filter((item, i) => {
    const current = existing[i];
    return !current || new Date(item.updatedAt).getTime() > new Date(current.updatedAt).getTime();
  });
}

/** 將一個帳號的備份合併進資料庫；回傳實際寫入的筆數 */
export async function importAccount(db: UserDb, account: BackupAccount): Promise<{ favorites: number; orders: number }> {
  return db.transaction('rw', db.favorites, db.orders, async () => {
    const favs = mergeNewer(await db.favorites.bulkGet(account.favorites.map((f) => f.productId)), account.favorites);
    const orders = mergeNewer(await db.orders.bulkGet(account.orders.map((o) => o.orderNumber)), account.orders);
    await db.favorites.bulkPut(favs);
    await db.orders.bulkPut(orders);
    return { favorites: favs.length, orders: orders.length };
  });
}
