// 匯出／匯入（05-features F8、04-data-model §5）
import type { Favorite, Order, OrderItem, OrderStatus, UserDb } from './db';
import { GLOBAL_SCHEMA_VERSION, type AccountInfo } from './global';
import { withProductIds } from './purchases';

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

// 匯入驗證：檢查介面與同步會用到的每個欄位，避免不完整的資料寫入資料庫（code-review CR-004）
const isText = (v: unknown): v is string => typeof v === 'string';
const isNonEmptyText = (v: unknown): v is string => isText(v) && v.length > 0;
const isNullableText = (v: unknown): boolean => v === null || isText(v);
/** 舊匯出檔可能沒有此欄位 */
const isOptionalNullableText = (v: unknown): boolean => v === undefined || isNullableText(v);
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const isDate = (v: unknown): v is string => isText(v) && Number.isFinite(Date.parse(v));
const isNullableDate = (v: unknown): boolean => v === null || isDate(v);
const ORDER_STATUSES: OrderStatus[] = ['unfulfilled', 'fulfilled', 'partial', 'cancelled', 'unknown'];

function validFavorite(v: unknown): v is Favorite {
  return (
    isObject(v) &&
    isId(v.productId) &&
    isNonEmptyText(v.handle) &&
    isObject(v.title) &&
    (v.title.ja === undefined || isText(v.title.ja)) &&
    (v.title.en === undefined || isText(v.title.en)) &&
    isNullableText(v.imageUrl) &&
    (v.salePeriod === null ||
      (isObject(v.salePeriod) && isNullableDate(v.salePeriod.start) && isNullableDate(v.salePeriod.end))) &&
    isDate(v.addedAt) &&
    isDate(v.updatedAt) &&
    typeof v.muted === 'boolean'
  );
}

function validOrderItem(v: unknown): v is OrderItem {
  return (
    isObject(v) &&
    isNonEmptyText(v.handle) &&
    (v.productId === null || isId(v.productId)) &&
    isText(v.productTitle) &&
    isNullableText(v.variantTitleRaw) &&
    (v.variantId === null || isId(v.variantId)) &&
    isId(v.quantity) &&
    isOptionalNullableText(v.imageUrl)
  );
}

function validOrder(v: unknown): v is Order {
  return (
    isObject(v) &&
    isNonEmptyText(v.orderNumber) &&
    isText(v.detailPath) &&
    v.detailPath.startsWith('/') &&
    isDate(v.date) &&
    ORDER_STATUSES.includes(v.status as OrderStatus) &&
    isText(v.statusText) &&
    (v.total === null ||
      (isObject(v.total) &&
        typeof v.total.amount === 'number' &&
        Number.isFinite(v.total.amount) &&
        isNonEmptyText(v.total.currency))) &&
    (v.shipBy === undefined ||
      v.shipBy === null ||
      (isObject(v.shipBy) && isText(v.shipBy.text) && (v.shipBy.date === null || isDate(v.shipBy.date)))) &&
    Array.isArray(v.items) &&
    v.items.every(validOrderItem) &&
    isNullableDate(v.detailFetchedAt) &&
    isDate(v.updatedAt)
  );
}

/** 補上舊匯出檔缺少的欄位；productIds 由品項重新計算，不採用檔案中的值 */
function normalizeOrder(order: Order): Order {
  return withProductIds({
    ...order,
    shipBy: order.shipBy ?? null,
    items: order.items.map((i) => ({ ...i, imageUrl: i.imageUrl ?? null })),
    productIds: [],
  });
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
      orders: a.orders.map(normalizeOrder),
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
