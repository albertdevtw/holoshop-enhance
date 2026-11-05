// 同步工作與結果的型別（Service Worker 與 Content Script 共用）
import type { ProductInfo } from '@/src/data/db';
import type { ParsedDetailItem } from '@/src/site-adapter/order-detail';
import type { ParsedOrder } from '@/src/site-adapter/orders-page';

export type SyncMode = 'full' | 'incremental' | 'resolve';

/** Service Worker 指派給商店分頁的單一工作（每個工作對應一個網站請求） */
export type SyncTask =
  | { kind: 'page'; page: number }
  | { kind: 'product'; handle: string }
  | { kind: 'detail'; orderNumber: string; path: string };

export type SyncErrorReason = 'needs-login' | 'account-mismatch' | 'network' | 'parse';

export type SyncResult =
  | { kind: 'page'; page: number; orders: ParsedOrder[]; lastPage: number }
  /** product 為 null 代表商品不存在（404） */
  | { kind: 'product'; handle: string; product: ProductInfo | null }
  | { kind: 'detail'; orderNumber: string; items: ParsedDetailItem[] }
  | { kind: 'error'; reason: SyncErrorReason };

export interface SyncMeta {
  state: 'idle' | 'running' | 'needs-login' | 'error';
  mode: SyncMode;
  phase: 'pages' | 'resolve';
  nextPage: number;
  lastPage: number | null;
  pagesDone: number;
  newOrderCount: number;
  /** 增量同步需涵蓋的最舊未発送訂單（D-018）；null = 沒有 */
  coverTarget: { date: string; orderNumber: string } | null;
  /** 本次同步是否已看到涵蓋目標或更舊的訂單 */
  covered: boolean;
  /** 使用者或被動擷取要求的下一次同步；執行時清除 */
  requested: SyncMode | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastSuccessAt: string | null;
  error: SyncErrorReason | null;
}

export function defaultSyncMeta(): SyncMeta {
  return {
    state: 'idle',
    mode: 'full',
    phase: 'pages',
    nextPage: 1,
    lastPage: null,
    pagesDone: 0,
    newOrderCount: 0,
    coverTarget: null,
    covered: true,
    requested: null,
    startedAt: null,
    finishedAt: null,
    lastSuccessAt: null,
    error: null,
  };
}

/** 兩次自動增量同步之間的最短間隔 */
export const AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** 商品不存在（404）後重試的間隔 */
export const PRODUCT_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
/** 每個網站請求之間的間隔（DEVELOPMENT §8.4） */
export const REQUEST_INTERVAL_MS = 3000;
/** 同步鎖的心跳逾時 */
export const LOCK_TIMEOUT_MS = 60 * 1000;
