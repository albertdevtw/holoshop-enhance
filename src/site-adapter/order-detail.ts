// 訂單詳細頁（/account/orders/<token>）解析：取得各品項的 variant ID 與品項小計（D-007、D-022）
import { handleFromHref } from './orders-page';

export interface ParsedDetailItem {
  handle: string;
  variantId: number | null;
  variantTitle: string | null;
  quantity: number;
  /** 品項小計（訂單幣別，不含運費與稅金）；解析不到時為 null */
  lineTotal: number | null;
}

/** 金額文字（例如 `$1,234.00 TWD`、`¥1,234`、`NT$1,234.00`）轉為數值 */
export function parsePriceText(text: string | null | undefined): number | null {
  const digits = (text ?? '').replace(/[^\d.]/g, '');
  if (!/\d/.test(digits)) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

export function parseOrderDetail(doc: Document): ParsedDetailItem[] {
  const items: ParsedDetailItem[] = [];
  for (const row of doc.querySelectorAll('tr.CartItem')) {
    const link = row.querySelector('.CartItem__Title a[href*="/products/"]');
    const href = link?.getAttribute('href') ?? null;
    const handle = handleFromHref(href);
    if (!handle) continue;
    const variant = Number(new URL(href ?? '', 'https://shop.hololivepro.com').searchParams.get('variant'));
    const cells = row.querySelectorAll(':scope > td');
    const qtyCell = cells[1];
    // 第一欄也有單價（.CartItem__PriceList），品項小計在最後一欄
    const totalCell = cells[cells.length - 1];
    const qty = qtyCell?.textContent?.match(/\d+/)?.[0];
    items.push({
      handle,
      variantId: Number.isSafeInteger(variant) && variant > 0 ? variant : null,
      variantTitle: row.querySelector('.CartItem__Variant')?.textContent?.trim() || null,
      quantity: qty ? Number(qty) : 1,
      lineTotal: cells.length >= 3 ? parsePriceText(totalCell?.querySelector('.CartItem__Price')?.textContent) : null,
    });
  }
  return items;
}
