// 截止前提醒：計算目前帳號的提醒數量，以圖示徽章顯示（只在 Service Worker 中使用；D-015）
import { openUserDb, type Favorite } from '@/src/data/db';
import type { GlobalState } from '@/src/data/global';
import { dueFavorites } from './rules';

/** 截止時間會隨時間經過，徽章定期重新計算 */
export const BADGE_ALARM = 'badge-refresh';

/** 已購數量（排除取消的訂單）；key = productId */
export async function purchasedMap(customerId: string): Promise<Map<number, number>> {
  const orders = await openUserDb(customerId).orders.toArray();
  const totals = new Map<number, number>();
  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    for (const item of order.items) {
      if (item.productId !== null) totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
    }
  }
  return totals;
}

/** 目前帳號符合提醒條件的最愛（D-009） */
export async function computeDue(state: GlobalState, now: Date): Promise<Favorite[]> {
  if (!state.activeAccountId) return [];
  const favorites = await openUserDb(state.activeAccountId).favorites.toArray();
  return dueFavorites(favorites, await purchasedMap(state.activeAccountId), state.settings.reminder.daysBefore, now);
}

/** 建立徽章重新計算的 alarm（安裝與啟動時呼叫） */
export async function ensureAlarms(): Promise<void> {
  if (!(await browser.alarms.get(BADGE_ALARM))) {
    await browser.alarms.create(BADGE_ALARM, { periodInMinutes: 60 });
  }
}
