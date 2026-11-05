// 最愛清單的資料存取（只在 Service Worker 中使用）
import type { SiteLocale } from '@/src/site-adapter/url';
import type { Favorite, SalePeriod, UserDb } from './db';

/** 商品頁送來的商品資訊 */
export interface ProductSnapshot {
  productId: number;
  handle: string;
  locale: SiteLocale;
  title: string | null;
  imageUrl: string | null;
  salePeriod: SalePeriod | null;
}

export async function getFavorite(db: UserDb, productId: number): Promise<Favorite | null> {
  return (await db.favorites.get(productId)) ?? null;
}

/** 切換最愛；回傳切換後的最愛（移除時為 null） */
export async function toggleFavorite(db: UserDb, product: ProductSnapshot): Promise<Favorite | null> {
  return db.transaction('rw', db.favorites, async () => {
    const existing = await db.favorites.get(product.productId);
    if (existing) {
      await db.favorites.delete(product.productId);
      return null;
    }
    const now = new Date().toISOString();
    const favorite: Favorite = {
      productId: product.productId,
      handle: product.handle,
      title: product.title ? { [product.locale]: product.title } : {},
      imageUrl: product.imageUrl,
      salePeriod: product.salePeriod,
      addedAt: now,
      updatedAt: now,
      muted: false,
    };
    await db.favorites.put(favorite);
    return favorite;
  });
}

/** 已是最愛時，以商品頁最新資訊更新名稱、handle、圖片與販售期間 */
export async function refreshFavorite(db: UserDb, product: ProductSnapshot): Promise<Favorite | null> {
  return db.transaction('rw', db.favorites, async () => {
    const existing = await db.favorites.get(product.productId);
    if (!existing) return null;
    const next: Favorite = {
      ...existing,
      handle: product.handle,
      title: product.title ? { ...existing.title, [product.locale]: product.title } : existing.title,
      imageUrl: product.imageUrl ?? existing.imageUrl,
      salePeriod: product.salePeriod,
    };
    if (JSON.stringify(next) === JSON.stringify(existing)) return existing;
    next.updatedAt = new Date().toISOString();
    await db.favorites.put(next);
    return next;
  });
}

export async function removeFavorite(db: UserDb, productId: number): Promise<void> {
  await db.favorites.delete(productId);
}

export async function setFavoriteMuted(db: UserDb, productId: number, muted: boolean): Promise<Favorite | null> {
  const existing = await db.favorites.get(productId);
  if (!existing) return null;
  const next = { ...existing, muted, updatedAt: new Date().toISOString() };
  await db.favorites.put(next);
  return next;
}

export async function listFavorites(db: UserDb): Promise<Favorite[]> {
  return db.favorites.toArray();
}
