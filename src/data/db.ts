// IndexedDB：每帳號一庫＋共用商品庫（04-data-model §2、§3）
import Dexie, { type EntityTable } from 'dexie';

export interface SalePeriod {
  start: string | null;
  end: string | null;
}

export interface Favorite {
  productId: number;
  handle: string;
  title: { ja?: string; en?: string };
  imageUrl: string | null;
  salePeriod: SalePeriod | null;
  addedAt: string;
  updatedAt: string;
  muted: boolean;
}

export type OrderStatus = 'unfulfilled' | 'fulfilled' | 'partial' | 'cancelled' | 'unknown';

export interface OrderItem {
  handle: string;
  productId: number | null;
  productTitle: string;
  variantTitleRaw: string | null;
  variantId: number | null;
  quantity: number;
  /** 品項縮圖（F12）；沒有時為 null */
  imageUrl: string | null;
}

export interface Order {
  orderNumber: string;
  detailPath: string;
  date: string;
  status: OrderStatus;
  statusText: string;
  total: { amount: number; currency: string } | null;
  /** 發送予定日（F12、D-018）；訂單頁沒有此欄位時為 null */
  shipBy: { text: string; date: string | null } | null;
  items: OrderItem[];
  productIds: number[];
  /** 已抓過訂單詳細頁的時間（D-007 備援）；未抓過為 null */
  detailFetchedAt: string | null;
  updatedAt: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export interface ProductInfo {
  productId: number;
  handle: string;
  variants: { id: number; title: string }[];
  fetchedAt: string;
}

export interface ProductHandle {
  handle: string;
  productId: number | null;
  fetchedAt: string;
}

export type UserDb = Dexie & {
  favorites: EntityTable<Favorite, 'productId'>;
  orders: EntityTable<Order, 'orderNumber'>;
  meta: EntityTable<MetaEntry, 'key'>;
};

export type SharedDb = Dexie & {
  products: EntityTable<ProductInfo, 'productId'>;
  productHandles: EntityTable<ProductHandle, 'handle'>;
};

export function userDbName(customerId: string): string {
  if (!/^\d+$/.test(customerId)) throw new Error(`invalid customerId: ${customerId}`);
  return `holoshop_user_${customerId}`;
}

const userDbs = new Map<string, UserDb>();

/** 開啟指定帳號的資料庫；同一個執行環境內重複使用連線 */
export function openUserDb(customerId: string): UserDb {
  const cached = userDbs.get(customerId);
  if (cached) return cached;
  const db = new Dexie(userDbName(customerId)) as UserDb;
  db.version(1).stores({
    favorites: 'productId, handle, salePeriod.end',
    orders: 'orderNumber, date, *productIds',
    meta: 'key',
  });
  userDbs.set(customerId, db);
  return db;
}

/** 刪除指定帳號的整個資料庫 */
export async function deleteUserDb(customerId: string): Promise<void> {
  userDbs.get(customerId)?.close();
  userDbs.delete(customerId);
  await Dexie.delete(userDbName(customerId));
}

let sharedDb: SharedDb | null = null;

export function openSharedDb(): SharedDb {
  if (sharedDb) return sharedDb;
  const db = new Dexie('holoshop_shared') as SharedDb;
  db.version(1).stores({
    products: 'productId, handle',
    productHandles: 'handle',
  });
  sharedDb = db;
  return db;
}
