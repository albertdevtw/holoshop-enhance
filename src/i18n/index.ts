// 多語系：語系決定與 i18next 初始化（05-features F7）
import i18next, { type i18n, type TFunction } from 'i18next';
import type { LocaleMode } from '@/src/data/global';
import type { SiteLocale } from '@/src/site-adapter/url';
import ja from './locales/ja.json';
import en from './locales/en.json';
import zhTW from './locales/zh-TW.json';

export type UiLocale = 'ja' | 'en' | 'zh-TW';
export const UI_LOCALES: UiLocale[] = ['ja', 'en', 'zh-TW'];

/** 依設定與網站語系決定介面語系 */
export function resolveUiLocale(mode: LocaleMode, siteLocale: SiteLocale): UiLocale {
  return mode === 'follow-site' ? siteLocale : mode;
}

/** 建立獨立的 i18next 實例（不污染全域實例，每個 UI 元件各自使用） */
export async function createI18n(locale: UiLocale): Promise<i18n> {
  const instance = i18next.createInstance();
  await instance.init({
    lng: locale,
    fallbackLng: 'ja',
    resources: {
      ja: { translation: ja },
      en: { translation: en },
      'zh-TW': { translation: zhTW },
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}

export type { TFunction };
