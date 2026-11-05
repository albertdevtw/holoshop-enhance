// /products/<handle>.js 解析與規格比對（D-005、D-007）
import type { ProductInfo } from '@/src/data/db';

/** 日文版商品 JSON 的網址（規格名稱以日文比對，所以不加 /en/） */
export function productJsonPath(handle: string): string {
  return `/products/${encodeURIComponent(handle)}.js`;
}

export function parseProductJson(value: unknown, handle: string, now: string): ProductInfo | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { id?: unknown; variants?: unknown };
  const id = Number(v.id);
  if (!Number.isSafeInteger(id) || id <= 0 || !Array.isArray(v.variants)) return null;
  const variants = v.variants
    .map((x: unknown) => {
      const variant = x as { id?: unknown; title?: unknown };
      return { id: Number(variant.id), title: String(variant.title ?? '') };
    })
    .filter((x) => Number.isSafeInteger(x.id) && x.id > 0);
  return { productId: id, handle, variants, fetchedAt: now };
}

const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();

/** 以規格名稱比對 variant ID；無規格商品（只有一個 variant）直接使用該 variant */
export function matchVariant(variantTitleRaw: string | null, product: ProductInfo): number | null {
  if (product.variants.length === 1) return product.variants[0]?.id ?? null;
  if (!variantTitleRaw) return null;
  const target = normalize(variantTitleRaw);
  return product.variants.find((v) => normalize(v.title) === target)?.id ?? null;
}
