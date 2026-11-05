<script lang="ts">
  import { onMount } from 'svelte';
  import { getGlobalState, watchGlobalState, type GlobalState } from '@/src/data/global';
  import { createI18n, resolveUiLocale, type TFunction } from '@/src/i18n';
  import { matchesAll, parseKeywords } from '@/src/shared/search';
  import { findPagination, listItems, nextPageUrl, findFilesList } from '@/src/site-adapter/downloads-page';
  import type { SiteLocale } from '@/src/site-adapter/url';

  let { list, locale }: { list: HTMLElement; locale: SiteLocale } = $props();

  const INTERVAL_MS = 1000; // D-017：前景操作，間隔 1 秒
  const RETRY_MS = 3000;

  let t = $state<TFunction | null>(null);
  let query = $state('');
  let total = $state(0);
  let matched = $state(0);
  let pages = $state(1);
  let loading = $state(true);
  let failed = $state(false);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function applyLocale(state: GlobalState) {
    const i18n = await createI18n(resolveUiLocale(state.settings.localeMode, locale));
    t = i18n.t.bind(i18n) as TFunction;
  }

  /** 依目前關鍵字切換各項目的顯示 */
  function applyFilter() {
    const keywords = parseKeywords(query);
    let count = 0;
    const items = listItems(list);
    for (const item of items) {
      const show = matchesAll(item.textContent ?? '', keywords);
      item.style.display = show ? '' : 'none';
      if (show) count++;
    }
    total = items.length;
    matched = count;
  }

  async function fetchDocument(url: string): Promise<Document | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(RETRY_MS);
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (res.ok) return new DOMParser().parseFromString(await res.text(), 'text/html');
      } catch {
        // 重試一次
      }
    }
    return null;
  }

  /** 從目前頁的下一頁開始逐頁載入，項目附加到原列表 */
  async function loadAll() {
    const seen = new Set<string>([location.href]);
    let next = nextPageUrl(document, location.href);
    while (next && !seen.has(next)) {
      seen.add(next);
      await sleep(INTERVAL_MS);
      const doc = await fetchDocument(next);
      const nextList = doc && findFilesList(doc);
      if (!doc || !nextList) {
        failed = true;
        break;
      }
      for (const item of listItems(nextList)) list.appendChild(document.importNode(item, true));
      pages += 1;
      applyFilter();
      next = nextPageUrl(doc, next);
    }
    loading = false;
    // 全部載入完成後隱藏網站原本的分頁連結；失敗時保留
    if (!failed) {
      const pagination = findPagination(document);
      if (pagination) pagination.style.display = 'none';
    }
  }

  onMount(() => {
    void getGlobalState().then(applyLocale);
    const unwatch = watchGlobalState((state) => void applyLocale(state));
    applyFilter();
    void loadAll();
    return unwatch;
  });
</script>

{#if t}
  <div class="search">
    <input
      type="search"
      placeholder={t('downloads.placeholder')}
      bind:value={query}
      oninput={applyFilter}
      aria-label={t('downloads.placeholder')}
    />
    <p class="status">
      {#if loading}
        {t('downloads.loading', { pages, count: total })}
      {:else if query.trim()}
        {t('downloads.matched', { matched, total })}
      {:else}
        {t('downloads.total', { total })}
      {/if}
      {#if failed}<span class="failed">{t('downloads.failed')}</span>{/if}
    </p>
  </div>
{/if}

<style>
  .search {
    margin: 0 0 20px;
    font-family: system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  }
  input {
    box-sizing: border-box;
    width: 100%;
    padding: 10px 14px;
    font-size: 15px;
    border: 1px solid #c8d1dc;
    border-radius: 999px;
    outline: none;
    background: #fff;
    color: #1f2328;
  }
  input:focus {
    border-color: #2f6fde;
    box-shadow: 0 0 0 3px rgb(47 111 222 / 15%);
  }
  .status {
    margin: 6px 4px 0;
    font-size: 12px;
    color: #656d76;
  }
  .failed {
    margin-left: 8px;
    color: #d1242f;
  }
</style>
