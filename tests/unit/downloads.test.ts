import { describe, expect, it } from 'vitest';
import { findFilesList, listItems, nextPageUrl } from '@/src/site-adapter/downloads-page';
import { matchesAll, parseKeywords } from '@/src/shared/search';

const BASE = 'https://shop.hololivepro.com/apps/downloads/orders/1';

function page(items: string[], next: number | null): Document {
  const list = items.map((t) => `<a class="sky-pilot-list-item" href="/x"><div class="sky-pilot-file-heading">${t}</div></a>`).join('');
  const pag = next ? `<div class="sky-pilot-pagination"><span class="next"><a href="/apps/downloads/orders/1?line_items_page=${next}">次のページへ »</a></span></div>` : '<div class="sky-pilot-pagination"></div>';
  return new DOMParser().parseFromString(`<div class="sky-pilot rte"><div class="sky-pilot-files-list">${list}</div>${pag}</div>`, 'text/html');
}

describe('downloads-page', () => {
  it('列表項目與下一頁網址', () => {
    const doc = page(['ボイス A', 'ボイス B'], 2);
    expect(listItems(findFilesList(doc)!).length).toBe(2);
    expect(nextPageUrl(doc, BASE)).toBe('https://shop.hololivepro.com/apps/downloads/orders/1?line_items_page=2');
    expect(nextPageUrl(page([], null), BASE)).toBeNull();
  });
});

describe('search', () => {
  it('多關鍵字 AND，忽略全半形與大小寫', () => {
    const text = 'スターティングボイス Ｖｏｌ．２ ASMR';
    expect(matchesAll(text, parseKeywords('ボイス vol.2'))).toBe(true);
    expect(matchesAll(text, parseKeywords('ｂｏｉｓｕ'))).toBe(false);
    expect(matchesAll(text, parseKeywords('asmr　スターティング'))).toBe(true);
    expect(matchesAll(text, parseKeywords('ボイス 3D'))).toBe(false);
    expect(matchesAll(text, parseKeywords('   '))).toBe(true);
  });
});
