// 商品列表頁（/collections/<handle>）：「もっと見る」按鈕與商品計數（05-features F10）

export const LOAD_MORE_SELECTOR = '#load-more';

export function findLoadMoreButton(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(LOAD_MORE_SELECTOR);
}

/** 按鈕內的圖示（載入中旋轉） */
export function loadMoreIcon(button: Element): Element | null {
  return button.querySelector('svg');
}

/** 目前列表上的商品數（以不重複的商品連結計算） */
export function countProducts(doc: Document): number {
  const hrefs = new Set<string>();
  for (const a of doc.querySelectorAll('a[href*="/products/"]')) {
    const href = a.getAttribute('href');
    if (href) hrefs.add(href.split(/[?#]/)[0] ?? href);
  }
  return hrefs.size;
}
