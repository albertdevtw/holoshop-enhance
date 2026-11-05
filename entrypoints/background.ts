// Service Worker：中央調度、帳號切換、資料寫入、同步指派、圖示徽章
import { getGlobalState, updateGlobalState, type GlobalState, type Settings } from '@/src/data/global';
import { buildBackup, exportAccount, importAccount } from '@/src/data/backup';
import { deleteUserDb, openSharedDb, openUserDb, type UserDb } from '@/src/data/db';
import {
  getFavorite,
  listFavorites,
  refreshFavorite,
  removeFavorite,
  setFavoriteMuted,
  toggleFavorite,
} from '@/src/data/favorites';
import { summarizePurchases } from '@/src/data/purchases';
import { createI18n, resolveUiLocale } from '@/src/i18n';
import type { BroadcastEvent, Message, PageContextMessage, ResponseMap, WriteResult } from '@/src/messaging';
import {
  applyResult,
  finishRun,
  getSyncMeta,
  ingestOrders,
  nextTask,
  prepareRun,
  setSyncMeta,
  shouldSync,
} from '@/src/sync/engine';
import { acquireLock, holdsLock, isSyncActive, releaseLock } from '@/src/sync/lock';
import { DONE_FLASH_MS, syncDisplay } from '@/src/sync/status';
import type { SyncTask } from '@/src/sync/types';
import { BADGE_ALARM, computeDue, ensureAlarms, purchasedMap } from '@/src/reminder/scheduler';

const LOG = '[holoshop]';
const SHOP_TABS = 'https://shop.hololivepro.com/*';

type Sender = { tab?: { id?: number } };

export default defineBackground(() => {
  // 點擊擴充圖示直接開啟 Side Panel（D-019）
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => {
    console.warn(LOG, 'setPanelBehavior failed', error);
  });

  browser.runtime.onInstalled.addListener(async () => {
    // 讀取並寫回一次，完成全域狀態的遷移
    await updateGlobalState(() => undefined);
    console.info(LOG, 'installed / updated');
    await ensureAlarms();
    await updateBadge();
  });
  browser.runtime.onStartup.addListener(() => void ensureAlarms().then(updateBadge));

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BADGE_ALARM) void updateBadge();
  });

  browser.runtime.onMessage.addListener((message: Message, sender: Sender, sendResponse) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((error: unknown) => {
        console.warn(LOG, 'message failed', message.type, error);
        sendResponse(undefined);
      });
    return true; // 非同步回應
  });

  // 執行同步的分頁關閉時釋放鎖，讓其他分頁接手
  browser.tabs.onRemoved.addListener((tabId) => void releaseLock(tabId).then(updateBadge));

  // 設定或目前帳號變更時更新徽章
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'global' in changes) void updateBadge();
  });
});

async function handleMessage(message: Message, sender: Sender): Promise<ResponseMap[Message['type']]> {
  const now = new Date();
  switch (message.type) {
    case 'pageContext':
      return handlePageContext(message);
    case 'getGlobalState':
      return getGlobalState();
    case 'updateSettings':
      return updateGlobalState((state) => {
        state.settings = mergeSettings(state.settings, message.patch);
      });

    case 'productViewed':
      return withAccount(message.customerId, async (db) => {
        const favorite =
          (await refreshFavorite(db, message.product)) ?? (await getFavorite(db, message.product.productId));
        const orders = await db.orders.where('productIds').equals(message.product.productId).toArray();
        const purchases = summarizePurchases(orders, message.product.productId);
        const info = await openSharedDb().products.get(message.product.productId);
        const variantTitles: Record<number, string> = {};
        for (const v of info?.variants ?? []) if (purchases.byVariant[v.id]) variantTitles[v.id] = v.title;
        return { favorite, purchases, variantTitles };
      });
    case 'toggleFavorite':
      return withAccount(message.customerId, async (db) => {
        const favorite = await toggleFavorite(db, message.product);
        await broadcast({
          type: 'favoritesChanged',
          customerId: message.customerId,
          productId: message.product.productId,
          favorite,
        });
        return { favorite };
      });
    case 'removeFavorite':
      return withAccount(message.customerId, async (db) => {
        await removeFavorite(db, message.productId);
        await broadcast({ type: 'favoritesChanged', customerId: message.customerId, productId: message.productId, favorite: null });
        return null;
      });
    case 'setFavoriteMuted':
      return withAccount(message.customerId, async (db) => {
        const favorite = await setFavoriteMuted(db, message.productId, message.muted);
        await broadcast({ type: 'favoritesChanged', customerId: message.customerId, productId: message.productId, favorite });
        return null;
      });
    case 'listFavorites': {
      const { activeAccountId } = await getGlobalState();
      if (!activeAccountId) return { customerId: null, favorites: [] };
      const [favorites, purchased] = await Promise.all([
        listFavorites(openUserDb(activeAccountId)),
        purchasedMap(activeAccountId),
      ]);
      return {
        customerId: activeAccountId,
        favorites: favorites.map((f) => ({ ...f, purchased: purchased.get(f.productId) ?? 0 })),
      };
    }

    case 'listUnfulfilledOrders': {
      const { activeAccountId } = await getGlobalState();
      if (!activeAccountId) return { customerId: null, orders: [] };
      const orders = await openUserDb(activeAccountId)
        .orders.filter((o) => o.status === 'unfulfilled')
        .toArray();
      return { customerId: activeAccountId, orders };
    }

    case 'syncClaim':
      return withAccount(message.customerId, async (db) => {
        const tabId = sender.tab?.id;
        if (tabId === undefined) return { task: null };
        let meta = await getSyncMeta(db);
        if (!shouldSync(meta, now)) return { task: null };
        if (!(await acquireLock(tabId, message.customerId))) return { task: null };
        meta = await prepareRun(db, meta, now);
        return { task: await advance(db, message.customerId, meta, tabId, now) };
      });
    case 'syncReport':
      return withAccount(message.customerId, async (db) => {
        const tabId = sender.tab?.id;
        if (tabId === undefined || !(await holdsLock(tabId, message.customerId))) return { task: null };
        await acquireLock(tabId, message.customerId); // 更新心跳
        let meta = await getSyncMeta(db);
        if (meta.state !== 'running') return { task: null };
        meta = await applyResult(db, openSharedDb(), meta, message.result, now);
        if (meta.state !== 'running') {
          await setSyncMeta(db, meta);
          await releaseLock(tabId);
          await afterSyncChange(message.customerId);
          return { task: null };
        }
        return { task: await advance(db, message.customerId, meta, tabId, now) };
      });
    case 'ingestOrders':
      return withAccount(message.customerId, async (db) => {
        const { unresolved } = await ingestOrders(db, openSharedDb(), message.orders, now);
        if (unresolved) {
          const meta = await getSyncMeta(db);
          if (meta.state !== 'running' && !meta.requested) await setSyncMeta(db, { ...meta, requested: 'resolve' });
        }
        // 狀態與發送予定日也可能變更（F12），一律通知
        await broadcast({ type: 'purchasesChanged', customerId: message.customerId });
        return null;
      });
    case 'requestSync': {
      const { activeAccountId } = await getGlobalState();
      if (!activeAccountId) return { hasTab: false };
      const db = openUserDb(activeAccountId);
      const meta = await getSyncMeta(db);
      await setSyncMeta(db, { ...meta, requested: message.mode, state: meta.state === 'running' ? meta.state : 'idle' });
      const tabs = await browser.tabs.query({ url: SHOP_TABS });
      const tab = tabs.find((t) => t.active) ?? tabs[0];
      if (tab?.id !== undefined) await browser.tabs.sendMessage(tab.id, { type: 'syncAvailable' }).catch(() => undefined);
      return { hasTab: tab?.id !== undefined };
    }
    case 'exportData': {
      const state = await getGlobalState();
      const ids = message.scope === 'all' ? Object.keys(state.accounts) : state.activeAccountId ? [state.activeAccountId] : [];
      const accounts = await Promise.all(
        ids.flatMap((id) => {
          const info = state.accounts[id];
          return info ? [exportAccount(openUserDb(id), info)] : [];
        }),
      );
      return accounts.length ? buildBackup(accounts, now) : null;
    }
    case 'importData': {
      const results = [];
      for (const account of message.backup.accounts) {
        const written = await importAccount(openUserDb(account.customerId), account);
        results.push({ customerId: account.customerId, ...written });
      }
      const iso = now.toISOString();
      const state = await updateGlobalState((s) => {
        for (const a of message.backup.accounts) {
          s.accounts[a.customerId] ??= { customerId: a.customerId, label: a.label, firstSeenAt: iso, lastSeenAt: iso };
        }
      });
      if (state.activeAccountId) await broadcast({ type: 'purchasesChanged', customerId: state.activeAccountId });
      return results;
    }
    case 'renameAccount':
      return updateGlobalState((s) => {
        const account = s.accounts[message.customerId];
        const label = message.label.trim().slice(0, 40);
        if (account && label) account.label = label;
      });
    case 'deleteAccount': {
      await deleteUserDb(message.customerId);
      await releaseLock();
      const state = await updateGlobalState((s) => {
        delete s.accounts[message.customerId];
        if (s.activeAccountId === message.customerId) s.activeAccountId = null;
      });
      await updateBadge();
      return state;
    }
    case 'getSyncStatus': {
      const { activeAccountId } = await getGlobalState();
      if (!activeAccountId) return { customerId: null, meta: null, active: false };
      return {
        customerId: activeAccountId,
        meta: await getSyncMeta(openUserDb(activeAccountId)),
        active: await isSyncActive(),
      };
    }
  }
}

/** 取得下一個工作並保存進度；沒有工作時結束同步 */
async function advance(db: UserDb, customerId: string, meta: Parameters<typeof setSyncMeta>[1], tabId: number, now: Date): Promise<SyncTask | null> {
  const task = await nextTask(db, openSharedDb(), meta, now);
  if (task) {
    await setSyncMeta(db, meta);
    await notifySyncStatus(customerId);
    return task;
  }
  await setSyncMeta(db, finishRun(meta, now));
  await releaseLock(tabId);
  await afterSyncChange(customerId);
  // 3 秒後恢復徽章（Service Worker 若被終止，下次喚醒時會依 finishedAt 判斷）
  setTimeout(() => void updateBadge(), DONE_FLASH_MS + 100);
  return null;
}

async function afterSyncChange(customerId: string): Promise<void> {
  await notifySyncStatus(customerId);
  await broadcast({ type: 'purchasesChanged', customerId });
}

async function notifySyncStatus(customerId: string): Promise<void> {
  await updateBadge();
  await browser.runtime.sendMessage({ type: 'syncStatusChanged', customerId } satisfies BroadcastEvent).catch(() => undefined);
}

/** 寫入個人資料前確認帳號與目前使用中帳號一致（DEVELOPMENT §8.3） */
async function withAccount<T>(customerId: string, fn: (db: UserDb) => Promise<T>): Promise<WriteResult<T>> {
  const { activeAccountId } = await getGlobalState();
  if (!customerId || customerId !== activeAccountId) {
    console.warn(LOG, 'account mismatch, write rejected');
    return { ok: false, error: 'account-mismatch' };
  }
  return { ok: true, value: await fn(openUserDb(customerId)) };
}

/** 通知擴充頁面（Side Panel 等）與所有商店分頁 */
async function broadcast(event: BroadcastEvent): Promise<void> {
  if (event.type === 'favoritesChanged' || event.type === 'purchasesChanged') await updateBadge();
  await browser.runtime.sendMessage(event).catch(() => undefined); // 沒有開啟的擴充頁面時會失敗，忽略
  const tabs = await browser.tabs.query({ url: SHOP_TABS });
  await Promise.all(
    tabs.map((tab) => (tab.id === undefined ? undefined : browser.tabs.sendMessage(tab.id, event).catch(() => undefined))),
  );
}

/** 依目前帳號的同步狀態更新圖示徽章與滑鼠提示（F9） */
async function updateBadge(): Promise<void> {
  const state = await getGlobalState();
  const i18n = await createI18n(resolveUiLocale(state.settings.localeMode, state.detectedSiteLocale));
  const t = i18n.t.bind(i18n);
  const appName = browser.i18n.getMessage('extName') || 'holoshop-enhance';

  let display = syncDisplay(null, t, Date.now(), false);
  if (state.activeAccountId && state.settings.sync.showOnIcon) {
    const meta = await getSyncMeta(openUserDb(state.activeAccountId));
    display = syncDisplay(meta, t, Date.now(), await isSyncActive());
  }
  if (display.kind === 'idle') {
    // 平常狀態：顯示截止前提醒的數量（F3）
    const due = await computeDue(state, new Date());
    if (due.length > 0) {
      display = { ...display, badge: String(due.length), color: '#f0883e', message: t('reminder.badgeTitle', { count: due.length }) };
    }
  }
  await browser.action.setBadgeText({ text: display.badge });
  if (display.badge) await browser.action.setBadgeBackgroundColor({ color: display.color });
  await browser.action.setTitle({ title: display.message ? `${appName}\n${display.message}` : appName });
}

async function handlePageContext(message: PageContextMessage): Promise<ResponseMap['pageContext']> {
  const now = new Date().toISOString();
  const state = await updateGlobalState((s: GlobalState) => {
    s.detectedSiteLocale = message.locale;
    if (message.identity.status !== 'confirmed') return;
    const { customerId } = message.identity;
    const existing = s.accounts[customerId];
    s.accounts[customerId] = existing
      ? { ...existing, lastSeenAt: now }
      : { customerId, label: `#${customerId.slice(-4)}`, firstSeenAt: now, lastSeenAt: now };
    s.activeAccountId = customerId;
  });

  if (message.identity.status === 'confirmed') {
    // 確保該帳號的資料庫已建立（Dexie 於第一次開啟時建立 schema）
    await openUserDb(message.identity.customerId).open();
  }
  return { activeAccountId: state.activeAccountId };
}

function mergeSettings(current: Settings, patch: Partial<Settings>): Settings {
  return {
    ...current,
    ...patch,
    reminder: { ...current.reminder, ...patch.reminder },
    list: { ...current.list, ...patch.list },
    sync: { ...current.sync, ...patch.sync },
    collection: { ...current.collection, ...patch.collection },
  };
}
