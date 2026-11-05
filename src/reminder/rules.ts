// 截止前提醒的條件計算（純函式；05-features F3）
import type { Favorite } from '@/src/data/db';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 符合提醒條件的最愛：未靜音、未購買、有截止時間、尚未截止、距截止 ≤ N 天；依截止時間排序 */
export function dueFavorites(
  favorites: Favorite[],
  purchased: Map<number, number>,
  daysBefore: number,
  now: Date,
): Favorite[] {
  const limit = daysBefore * DAY_MS;
  return favorites
    .filter((f) => {
      const end = f.salePeriod?.end;
      if (f.muted || !end || (purchased.get(f.productId) ?? 0) > 0) return false;
      const left = new Date(end).getTime() - now.getTime();
      return left > 0 && left <= limit;
    })
    .sort((a, b) => new Date(a.salePeriod!.end!).getTime() - new Date(b.salePeriod!.end!).getTime());
}
