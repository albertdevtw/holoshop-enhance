import { describe, expect, it } from 'vitest';
import { createI18n, resolveUiLocale } from '@/src/i18n';
import ja from '@/src/i18n/locales/ja.json';
import en from '@/src/i18n/locales/en.json';
import zhTW from '@/src/i18n/locales/zh-TW.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('resolveUiLocale', () => {
  it('跟隨網站時使用網站語系', () => {
    expect(resolveUiLocale('follow-site', 'en')).toBe('en');
    expect(resolveUiLocale('follow-site', 'ja')).toBe('ja');
  });

  it('固定語系時忽略網站語系', () => {
    expect(resolveUiLocale('zh-TW', 'en')).toBe('zh-TW');
  });
});

describe('語言檔', () => {
  it('三個語言檔的鍵完全一致', () => {
    const base = keys(ja).sort();
    expect(keys(en).sort()).toEqual(base);
    expect(keys(zhTW).sort()).toEqual(base);
  });

  it('可依語系翻譯', async () => {
    const i18n = await createI18n('zh-TW');
    expect(i18n.t('sidepanel.title')).toBe('最愛');
  });
});
