// 訂單詳細頁（/account/orders/<token>）解析：取得各品項的 variant ID（D-007 備援）
import { handleFromHref } from './orders-page';

export interface ParsedDetailItem {
  handle: string;
  variantId: number | null;
  variantTitle: string | null;
  quantity: number;
}

export function parseOrderDetail(doc: Document): ParsedDetailItem[] {
  const items: ParsedDetailItem[] = [];
  for (const row of doc.querySelectorAll('tr.CartItem')) {
    const link = row.querySelector('.CartItem__Title a[href*="/products/"]');
    const href = link?.getAttribute('href') ?? null;
    const handle = handleFromHref(href);
    if (!handle) continue;
    const variant = Number(new URL(href ?? '', 'https://shop.hololivepro.com').searchParams.get('variant'));
    const qtyCell = row.querySelectorAll(':scope > td')[1];
    const qty = qtyCell?.textContent?.match(/\d+/)?.[0];
    items.push({
      handle,
      variantId: Number.isSafeInteger(variant) && variant > 0 ? variant : null,
      variantTitle: row.querySelector('.CartItem__Variant')?.textContent?.trim() || null,
      quantity: qty ? Number(qty) : 1,
    });
  }
  return items;
}
