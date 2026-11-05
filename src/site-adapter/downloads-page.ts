// 數位內容列表（/apps/downloads/orders/<id>）：列表、項目、分頁（05-features F11）

export function findFilesList(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('.sky-pilot-files-list');
}

export function findPagination(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('.sky-pilot-pagination');
}

/** 列表項目（列表的直接子元素） */
export function listItems(list: Element): HTMLElement[] {
  return [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement);
}

/** 下一頁的絕對網址；最後一頁回傳 null */
export function nextPageUrl(doc: Document, base: string): string | null {
  const href = doc.querySelector('.sky-pilot-pagination .next a')?.getAttribute('href');
  return href ? new URL(href, base).href : null;
}
