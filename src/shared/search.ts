// 關鍵字比對：空白分隔多個關鍵字（AND），忽略全形／半形與大小寫（05-features F11）

export function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function parseKeywords(query: string): string[] {
  return normalizeText(query).split(' ').filter(Boolean);
}

/** 所有關鍵字都包含在文字中；沒有關鍵字時視為符合 */
export function matchesAll(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const target = normalizeText(text);
  return keywords.every((k) => target.includes(k));
}
