// 商品頁解析：商品 ID、標題、圖片、販售期間、注入位置（03-architecture §1、05-features F1）
import type { SalePeriod } from '@/src/data/db';
import { jstIso } from '@/src/shared/jst';
import { parseStScript } from './identity';

export const TITLE_SELECTOR = 'h1.Pdt_title';

const PERIOD_LABELS = ['受注受付期間', '販売期間', 'Order Period', 'Sales Period'];

const DATE_PATTERNS: RegExp[] = [
  // 日文：YYYY年MM月DD日 HH時mm分
  /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2})時\s*(\d{1,2})分/g,
  // 英文：YYYY/MM/DD HH:mm
  /(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})/g,
];

/** 從期間文字取出起訖時間；不依賴分隔符號（〜、～、~ 皆可） */
export function parseSalePeriodText(text: string): SalePeriod | null {
  for (const pattern of DATE_PATTERNS) {
    const found = [...text.matchAll(pattern)]
      .map((m) => jstIso(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])))
      .filter((v): v is string => v !== null);
    if (found.length >= 2) return { start: found[0] ?? null, end: found[1] ?? null };
    if (found.length === 1) return { start: found[0] ?? null, end: null };
  }
  return null;
}

/** 從商品頁找出販售期間段落並解析；沒有期間（一般商品）時回傳 null */
export function parseSalePeriod(doc: Document): SalePeriod | null {
  const paragraphs = doc.querySelectorAll('section.Pdt_shipping p');
  for (const p of paragraphs) {
    const label = p.querySelector('.shipping_ttl')?.textContent?.trim() ?? '';
    if (!PERIOD_LABELS.some((l) => label.includes(l))) continue;
    const period = parseSalePeriodText(p.textContent ?? '');
    if (period) return period;
  }
  return null;
}

/** 商品 ID：script#__st 中 p=product 時的 rid */
export function parseProductId(doc: Document): number | null {
  const text = doc.getElementById('__st')?.textContent;
  if (!text) return null;
  const st = parseStScript(text);
  if (!st || st.p !== 'product') return null;
  const rid = Number(st.rid);
  return Number.isSafeInteger(rid) && rid > 0 ? rid : null;
}

export function parseProductTitle(doc: Document): string | null {
  const h1 = doc.querySelector(TITLE_SELECTOR);
  const title = h1?.getAttribute('data-product-title') ?? h1?.textContent;
  return title?.trim() || null;
}

export function parseProductImage(doc: Document): string | null {
  const content = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (!content) return null;
  return content.startsWith('//') ? `https:${content}` : content;
}

export interface VariantOption {
  variantId: number;
  /** 規格名稱元素，已購數量注入在其後 */
  titleElement: Element;
}

/** 商品頁上的規格選項（`div.Option` 內 `input[name=variation]` 的值即 variant ID） */
export function findVariantOptions(doc: Document): VariantOption[] {
  const options: VariantOption[] = [];
  for (const option of doc.querySelectorAll('section.Pdt_variant .Option')) {
    const variantId = Number(option.querySelector('input[name="variation"]')?.getAttribute('value'));
    const titleElement = option.querySelector('.Option_title');
    if (Number.isSafeInteger(variantId) && variantId > 0 && titleElement) options.push({ variantId, titleElement });
  }
  return options;
}
