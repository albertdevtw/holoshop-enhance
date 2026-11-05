// 最愛清單的排序與顯示用計算（純函式，便於測試）
import type { Favorite } from '@/src/data/db';
import { daysUntil, msUntil } from '@/src/shared/jst';
import type { UiLocale } from '@/src/i18n';

export type DeadlineState =
  | { kind: 'none' }
  | { kind: 'ended' }
  | { kind: 'today' }
  | { kind: 'days'; days: number };

export function deadlineState(favorite: Favorite, now: Date = new Date()): DeadlineState {
  const end = favorite.salePeriod?.end;
  if (!end) return { kind: 'none' };
  if (msUntil(end, now) <= 0) return { kind: 'ended' };
  const days = daysUntil(end, now);
  return days <= 1 ? { kind: 'today' } : { kind: 'days', days };
}

/** 排序：未截止依截止時間由近到遠 → 無販售期間 → 已截止 */
export function sortFavorites<T extends Favorite>(list: T[], now: Date = new Date()): T[] {
  const rank = (f: T) => {
    const s = deadlineState(f, now);
    return s.kind === 'ended' ? 2 : s.kind === 'none' ? 1 : 0;
  };
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const ea = a.salePeriod?.end ?? '';
    const eb = b.salePeriod?.end ?? '';
    return ea === eb ? b.addedAt.localeCompare(a.addedAt) : new Date(ea).getTime() - new Date(eb).getTime();
  });
}

/** 依介面語系選擇商品名稱；沒有該語系時使用另一個 */
export function favoriteTitle(favorite: Favorite, locale: UiLocale): string {
  const preferred = locale === 'en' ? favorite.title.en : favorite.title.ja;
  return preferred ?? favorite.title.ja ?? favorite.title.en ?? favorite.handle;
}

/** 商品頁網址；英文介面時使用 /en/ 前綴 */
export function productUrl(favorite: Favorite, locale: UiLocale): string {
  const prefix = locale === 'en' ? '/en' : '';
  return `https://shop.hololivepro.com${prefix}/products/${encodeURIComponent(favorite.handle)}`;
}

export type FavoriteFilter = 'unpurchased' | 'purchased' | 'all';

/** 已截止且未購買 → 反灰，且「顯示已截止」關閉時隱藏（F5） */
export function isExpiredUnpurchased(favorite: Favorite & { purchased: number }, now: Date = new Date()): boolean {
  return favorite.purchased === 0 && deadlineState(favorite, now).kind === 'ended';
}

export function filterFavorites<T extends Favorite & { purchased: number }>(
  list: T[],
  filter: FavoriteFilter,
  showExpired: boolean,
  now: Date = new Date(),
): T[] {
  return list.filter((f) => {
    if (filter === 'unpurchased' && f.purchased > 0) return false;
    if (filter === 'purchased' && f.purchased === 0) return false;
    if (!showExpired && isExpiredUnpurchased(f, now)) return false;
    return true;
  });
}
