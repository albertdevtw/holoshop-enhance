// 帳號識別：從 script#__st 解析 Shopify customerId（D-006）

export type Identity =
  | { status: 'confirmed'; customerId: string }
  | { status: 'logged-out' }
  | { status: 'unknown'; reason: string };

/** 解析 `var __st={...};` 內文為物件；格式不符時回傳 null */
export function parseStScript(text: string): Record<string, unknown> | null {
  const m = text.match(/__st\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!m?.[1]) return null;
  try {
    const value: unknown = JSON.parse(m[1]);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 從 Document（目前頁面或 DOMParser 解析的 HTML）判斷登入身分 */
export function identityFromDocument(doc: Document): Identity {
  const script = doc.getElementById('__st');
  if (!script?.textContent) return { status: 'unknown', reason: 'script#__st not found' };

  const st = parseStScript(script.textContent);
  if (!st) return { status: 'unknown', reason: 'script#__st parse failed' };

  const cid = st.cid;
  if (cid === undefined || cid === null || cid === '') return { status: 'logged-out' };
  const customerId = String(cid);
  if (!/^\d+$/.test(customerId)) return { status: 'unknown', reason: 'invalid cid' };
  return { status: 'confirmed', customerId };
}
