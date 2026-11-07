// 全域狀態：存於 chrome.storage.local（04-data-model §1）
import type { SiteLocale } from '@/src/site-adapter/url';

export const GLOBAL_SCHEMA_VERSION = 1;
const STORAGE_KEY = 'global';

export type LocaleMode = 'follow-site' | 'ja' | 'en' | 'zh-TW';

export interface AccountInfo {
  customerId: string;
  label: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface Settings {
  localeMode: LocaleMode;
  reminder: {
    /** 截止前幾天開始提醒（1–30） */
    daysBefore: number;
  };
  list: {
    showExpired: boolean;
  };
  sync: {
    showOnIcon: boolean;
  };
  collection: {
    /** 商品列表自動載入更多（F10） */
    autoLoadMore: boolean;
  };
  stats: {
    /** 統計的合計幣別（F13） */
    baseCurrency: string;
    /** 使用者自訂匯率：1 單位該幣別 = N JPY；未自訂的幣別使用內建預設值 */
    rates: Record<string, number>;
  };
}

export interface GlobalState {
  schemaVersion: number;
  accounts: Record<string, AccountInfo>;
  activeAccountId: string | null;
  detectedSiteLocale: SiteLocale;
  settings: Settings;
}

export function defaultSettings(): Settings {
  return {
    localeMode: 'follow-site',
    reminder: { daysBefore: 7 },
    list: { showExpired: false },
    sync: { showOnIcon: true },
    collection: { autoLoadMore: true },
    stats: { baseCurrency: 'JPY', rates: {} },
  };
}

export function defaultGlobalState(): GlobalState {
  return {
    schemaVersion: GLOBAL_SCHEMA_VERSION,
    accounts: {},
    activeAccountId: null,
    detectedSiteLocale: 'ja',
    settings: defaultSettings(),
  };
}

/** 將儲存的資料補齊預設值並遷移到目前版本；可重複執行 */
export function migrateGlobalState(raw: unknown): GlobalState {
  const base = defaultGlobalState();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<GlobalState>;
  // 目前只有 v1：補齊缺少的欄位。日後版本在此依序遷移。
  const settings = data.settings ?? base.settings;
  return {
    ...base,
    ...data,
    schemaVersion: GLOBAL_SCHEMA_VERSION,
    accounts: data.accounts ?? {},
    settings: {
      ...base.settings,
      ...settings,
      // 只保留目前版本的欄位（D-015 移除系統通知後不再使用 enabled、timeOfDay）
      reminder: { daysBefore: settings.reminder?.daysBefore ?? base.settings.reminder.daysBefore },
      list: { ...base.settings.list, ...settings.list },
      sync: { ...base.settings.sync, ...settings.sync },
      collection: { ...base.settings.collection, ...settings.collection },
      stats: {
        baseCurrency: settings.stats?.baseCurrency ?? base.settings.stats.baseCurrency,
        rates: { ...settings.stats?.rates },
      },
    },
  };
}

export async function getGlobalState(): Promise<GlobalState> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  return migrateGlobalState(stored[STORAGE_KEY]);
}

// 讀取 → 修改 → 寫回依序執行，避免並行更新互相覆蓋（code-review CR-005）
let updateTail: Promise<void> = Promise.resolve();

/** 以更新函式修改全域狀態並寫回（只應由 Service Worker 呼叫） */
export function updateGlobalState(update: (state: GlobalState) => GlobalState | void): Promise<GlobalState> {
  const result = updateTail.then(async () => {
    const state = await getGlobalState();
    const next = update(state) ?? state;
    await browser.storage.local.set({ [STORAGE_KEY]: next });
    return next;
  });
  updateTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** 監聽全域狀態變化（UI 用來即時切換語系等） */
export function watchGlobalState(callback: (state: GlobalState) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && STORAGE_KEY in changes) {
      callback(migrateGlobalState(changes[STORAGE_KEY]?.newValue));
    }
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
