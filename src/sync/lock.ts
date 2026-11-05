// 同步鎖：同一時間只有一個商店分頁執行同步（存於 chrome.storage.session）
import { LOCK_TIMEOUT_MS } from './types';

const KEY = 'syncLock';

export interface SyncLock {
  tabId: number;
  customerId: string;
  heartbeatAt: number;
}

export async function getLock(): Promise<SyncLock | null> {
  const stored = await browser.storage.session.get(KEY);
  return (stored[KEY] as SyncLock | undefined) ?? null;
}

/** 取得或更新鎖；被其他分頁持有且未逾時時回傳 false */
export async function acquireLock(tabId: number, customerId: string, now = Date.now()): Promise<boolean> {
  const lock = await getLock();
  if (lock && lock.tabId !== tabId && now - lock.heartbeatAt < LOCK_TIMEOUT_MS) return false;
  await browser.storage.session.set({ [KEY]: { tabId, customerId, heartbeatAt: now } satisfies SyncLock });
  return true;
}

/** 是否由指定分頁持有（且未逾時） */
export async function holdsLock(tabId: number, customerId: string, now = Date.now()): Promise<boolean> {
  const lock = await getLock();
  return !!lock && lock.tabId === tabId && lock.customerId === customerId && now - lock.heartbeatAt < LOCK_TIMEOUT_MS;
}

export async function releaseLock(tabId?: number): Promise<void> {
  const lock = await getLock();
  if (!lock || (tabId !== undefined && lock.tabId !== tabId)) return;
  await browser.storage.session.remove(KEY);
}

export async function isSyncActive(now = Date.now()): Promise<boolean> {
  const lock = await getLock();
  return !!lock && now - lock.heartbeatAt < LOCK_TIMEOUT_MS;
}
