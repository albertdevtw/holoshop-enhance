// /products/<handle>.js 解析與規格比對（D-005、D-007）
import type { ProductInfo } from '@/src/data/db';

/** 日文版商品 JSON 的網址（規格名稱以日文比對，所以不加 /en/） */
export function productJsonPath(handle: string): string {
  return `/products/${encodeURIComponent(handle)}.js`;
}

/** 官方商店的品牌名稱（多人商品，不視為組合名；05-features F14） */
export const OFFICIAL_VENDOR = 'hololive production official shop';
/** 視為單一 talent 的品牌（多人但以一個 talent 活動；05-features F14 特例） */
export const TALENT_VENDORS: readonly string[] = ['FUWAMOCO'];
/** 地區品牌：多人商品歸到「グループ」並以品牌名稱分列 */
export const REGION_VENDORS: readonly string[] = ['hololive English', 'hololive Indonesia'];

/** 取出指定前綴的標籤並去掉前綴（例如 `Talent_白上フブキ` → `白上フブキ`） */
function tagsWithPrefix(tags: unknown, prefix: string): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t): t is string => typeof t === 'string' && t.startsWith(prefix))
    .map((t) => t.slice(prefix.length).trim())
    .filter((t) => t.length > 0);
}

export function parseProductJson(value: unknown, handle: string, now: string): ProductInfo | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { id?: unknown; variants?: unknown; vendor?: unknown; tags?: unknown };
  const id = Number(v.id);
  if (!Number.isSafeInteger(id) || id <= 0 || !Array.isArray(v.variants)) return null;
  const variants = v.variants
    .map((x: unknown) => {
      const variant = x as { id?: unknown; title?: unknown };
      return { id: Number(variant.id), title: String(variant.title ?? '') };
    })
    .filter((x) => Number.isSafeInteger(x.id) && x.id > 0);
  return {
    productId: id,
    handle,
    variants,
    vendor: typeof v.vendor === 'string' ? v.vendor.trim() : '',
    talents: tagsWithPrefix(v.tags, 'Talent_'),
    groups: tagsWithPrefix(v.tags, 'Group_'),
    generations: tagsWithPrefix(v.tags, 'Generation_'),
    fetchedAt: now,
  };
}

const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();

/** 以規格名稱比對 variant ID；無規格商品（只有一個 variant）直接使用該 variant */
export function matchVariant(variantTitleRaw: string | null, product: ProductInfo): number | null {
  if (product.variants.length === 1) return product.variants[0]?.id ?? null;
  if (!variantTitleRaw) return null;
  const target = normalize(variantTitleRaw);
  return product.variants.find((v) => normalize(v.title) === target)?.id ?? null;
}
