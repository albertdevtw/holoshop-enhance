// UI 用的語系 store：讀取全域狀態並在設定變更時即時切換
import { readable, type Readable } from 'svelte/store';
import { getGlobalState, watchGlobalState, type GlobalState } from '@/src/data/global';
import { createI18n, resolveUiLocale, type TFunction, type UiLocale } from '@/src/i18n';

export interface I18nState {
  locale: UiLocale;
  t: TFunction;
}

function localeOf(state: GlobalState): UiLocale {
  return resolveUiLocale(state.settings.localeMode, state.detectedSiteLocale);
}

/** 擴充功能頁面（Popup／Side Panel／Options）使用的翻譯 store；初始化完成前為 null */
export function createI18nStore(): Readable<I18nState | null> {
  return readable<I18nState | null>(null, (set) => {
    let current: UiLocale | null = null;
    const apply = async (state: GlobalState) => {
      const locale = localeOf(state);
      if (locale === current) return;
      current = locale;
      const instance = await createI18n(locale);
      set({ locale, t: instance.t.bind(instance) as TFunction });
    };
    void getGlobalState().then(apply);
    return watchGlobalState((state) => void apply(state));
  });
}
