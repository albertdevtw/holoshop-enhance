import { describe, expect, it, vi } from 'vitest';
import { waitForMore } from '@/src/collection/auto-load';
import { countProducts, findLoadMoreButton } from '@/src/site-adapter/collection-page';

function listDoc(n: number): Document {
  const items = Array.from({ length: n }, (_, i) => `<a href="/collections/all/products/item_${i}?v=1">x</a><a href="/collections/all/products/item_${i}">img</a>`).join('');
  return new DOMParser().parseFromString(`<div>${items}</div><button id="load-more" class="more_view"><svg></svg>もっと見る</button>`, 'text/html');
}

describe('collection-page', () => {
  it('以不重複的商品連結計數', () => {
    expect(countProducts(listDoc(3))).toBe(3);
  });

  it('找到「もっと見る」按鈕', () => {
    expect(findLoadMoreButton(listDoc(1))?.textContent).toContain('もっと見る');
  });
});

describe('waitForMore', () => {
  it('商品數增加時回傳 true', async () => {
    vi.useFakeTimers();
    let n = 30;
    const p = waitForMore(() => n, 30, { pollMs: 100, timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(250);
    n = 60;
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe(true);
    vi.useRealTimers();
  });

  it('逾時回傳 false', async () => {
    vi.useFakeTimers();
    const p = waitForMore(() => 30, 30, { pollMs: 100, timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(600);
    await expect(p).resolves.toBe(false);
    vi.useRealTimers();
  });
});
