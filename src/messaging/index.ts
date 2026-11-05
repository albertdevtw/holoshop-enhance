// 訊息協定：所有元件與 Service Worker 之間的訊息型別（DEVELOPMENT §8.1）
import type { Favorite, Order } from '@/src/data/db';
import type { ProductSnapshot } from '@/src/data/favorites';
import type { BackupFile } from '@/src/data/backup';
import type { PurchaseSummary } from '@/src/data/purchases';
import type { ParsedOrder } from '@/src/site-adapter/orders-page';
import type { SyncMeta, SyncResult, SyncTask } from '@/src/sync/types';
import type { GlobalState, Settings } from '@/src/data/global';
import type { Identity } from '@/src/site-adapter/identity';
import type { PageType, SiteLocale } from '@/src/site-adapter/url';

// ---- 送給 Service Worker 的請求 ----

export interface PageContextMessage {
  type: 'pageContext';
  identity: Identity;
  locale: SiteLocale;
  pageType: PageType;
}

export interface GetGlobalStateMessage {
  type: 'getGlobalState';
}

export interface UpdateSettingsMessage {
  type: 'updateSettings';
  patch: Partial<Settings>;
}

/** 商品頁載入時：取得最愛狀態，若已是最愛則順便更新商品資訊 */
export interface ProductViewedMessage {
  type: 'productViewed';
  customerId: string;
  product: ProductSnapshot;
}

export interface ToggleFavoriteMessage {
  type: 'toggleFavorite';
  customerId: string;
  product: ProductSnapshot;
}

export interface SetFavoriteMutedMessage {
  type: 'setFavoriteMuted';
  customerId: string;
  productId: number;
  muted: boolean;
}

export interface ListFavoritesMessage {
  type: 'listFavorites';
}

/** Side Panel：目前帳號的未発送訂單（F12） */
export interface ListUnfulfilledOrdersMessage {
  type: 'listUnfulfilledOrders';
}

export interface RemoveFavoriteMessage {
  type: 'removeFavorite';
  customerId: string;
  productId: number;
}

/** 商店分頁要求同步工作；不需同步或鎖被占用時 task 為 null */
export interface SyncClaimMessage {
  type: 'syncClaim';
  customerId: string;
}

/** 回報工作結果並取得下一個工作 */
export interface SyncReportMessage {
  type: 'syncReport';
  customerId: string;
  result: SyncResult;
}

/** 使用者瀏覽 /account 時被動擷取的訂單 */
export interface IngestOrdersMessage {
  type: 'ingestOrders';
  customerId: string;
  orders: ParsedOrder[];
}

/** Side Panel／設定頁要求立即同步 */
export interface RequestSyncMessage {
  type: 'requestSync';
  mode: 'full' | 'incremental';
}

export interface GetSyncStatusMessage {
  type: 'getSyncStatus';
}

/** 匯出：目前帳號或全部帳號 */
export interface ExportDataMessage {
  type: 'exportData';
  scope: 'active' | 'all';
}

/** 匯入（已在設定頁驗證並經使用者確認） */
export interface ImportDataMessage {
  type: 'importData';
  backup: BackupFile;
}

export interface RenameAccountMessage {
  type: 'renameAccount';
  customerId: string;
  label: string;
}

export interface DeleteAccountMessage {
  type: 'deleteAccount';
  customerId: string;
}

export type Message =
  | PageContextMessage
  | GetGlobalStateMessage
  | UpdateSettingsMessage
  | ProductViewedMessage
  | ToggleFavoriteMessage
  | ListFavoritesMessage
  | ListUnfulfilledOrdersMessage
  | RemoveFavoriteMessage
  | SetFavoriteMutedMessage
  | SyncClaimMessage
  | SyncReportMessage
  | IngestOrdersMessage
  | RequestSyncMessage
  | GetSyncStatusMessage
  | ExportDataMessage
  | ImportDataMessage
  | RenameAccountMessage
  | DeleteAccountMessage;

/** 清單用：最愛加上已購數量 */
export type FavoriteView = Favorite & { purchased: number };

export type WriteResult<T> = { ok: true; value: T } | { ok: false; error: 'account-mismatch' };

export interface ResponseMap {
  pageContext: { activeAccountId: string | null };
  getGlobalState: GlobalState;
  updateSettings: GlobalState;
  productViewed: WriteResult<{
    favorite: Favorite | null;
    purchases: PurchaseSummary;
    /** 已購規格的名稱（日文，來自共用商品資料），供頁面上沒有規格選項時列出 */
    variantTitles: Record<number, string>;
  }>;
  toggleFavorite: WriteResult<{ favorite: Favorite | null }>;
  listFavorites: { customerId: string | null; favorites: FavoriteView[] };
  listUnfulfilledOrders: { customerId: string | null; orders: Order[] };
  setFavoriteMuted: WriteResult<null>;
  removeFavorite: WriteResult<null>;
  syncClaim: WriteResult<{ task: SyncTask | null }>;
  syncReport: WriteResult<{ task: SyncTask | null }>;
  ingestOrders: WriteResult<null>;
  requestSync: { hasTab: boolean };
  getSyncStatus: { customerId: string | null; meta: SyncMeta | null; active: boolean };
  exportData: BackupFile | null;
  importData: { customerId: string; favorites: number; orders: number }[];
  renameAccount: GlobalState;
  deleteAccount: GlobalState;
}

export type ResponseOf<M extends Message> = ResponseMap[M['type']];

/** 送訊息給 Service Worker 並取得對應型別的回應 */
export function sendMessage<M extends Message>(message: M): Promise<ResponseOf<M>> {
  return browser.runtime.sendMessage(message) as Promise<ResponseOf<M>>;
}

// ---- Service Worker 廣播給各元件的通知 ----

export interface FavoritesChangedEvent {
  type: 'favoritesChanged';
  customerId: string;
  productId: number;
  favorite: Favorite | null;
}

/** 購買資料有變動（同步完成、被動擷取） */
export interface PurchasesChangedEvent {
  type: 'purchasesChanged';
  customerId: string;
}

/** 同步狀態有變動 */
export interface SyncStatusChangedEvent {
  type: 'syncStatusChanged';
  customerId: string;
}

/** 通知商店分頁可以來領取同步工作 */
export interface SyncAvailableEvent {
  type: 'syncAvailable';
}

export type BroadcastEvent = FavoritesChangedEvent | PurchasesChangedEvent | SyncStatusChangedEvent | SyncAvailableEvent;

const BROADCAST_TYPES = new Set<string>(['favoritesChanged', 'purchasesChanged', 'syncStatusChanged', 'syncAvailable']);

export function isBroadcastEvent(value: unknown): value is BroadcastEvent {
  const type = value && typeof value === 'object' ? (value as { type?: unknown }).type : undefined;
  return typeof type === 'string' && BROADCAST_TYPES.has(type);
}
