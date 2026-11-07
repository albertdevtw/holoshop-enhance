<script lang="ts">
  import { onMount } from 'svelte';
  import type { Order } from '@/src/data/db';
  import { isBroadcastEvent, sendMessage, type FavoriteView } from '@/src/messaging';
  import AccountLine from '@/src/ui/AccountLine.svelte';
  import SyncStatus from '@/src/ui/SyncStatus.svelte';
  import { filterFavorites, type FavoriteFilter } from '@/src/ui/favorites-view';
  import { filterOrders, ORDER_FILTERS, orderYears, type OrderFilter } from '@/src/ui/orders-view';
  import { createGlobalStateStore } from '@/src/ui/global-state-store';
  import { createI18nStore } from '@/src/ui/i18n-store';
  import FavoritesList from './FavoritesList.svelte';
  import OrdersList from './OrdersList.svelte';

  type Tab = 'favorites' | 'orders';
  const TAB_KEY = 'holoshop.sidepanel.tab';
  const ORDER_FILTER_KEY = 'holoshop.sidepanel.orderFilter';
  const ORDER_YEAR_KEY = 'holoshop.sidepanel.orderYear';

  const i18n = createI18nStore();
  const globalState = createGlobalStateStore();

  let customerId = $state<string | null>(null);
  let favorites = $state<FavoriteView[]>([]);
  let orders = $state<Order[]>([]);
  let loaded = $state(false);
  let tab = $state<Tab>(readTab());
  let filter = $state<FavoriteFilter>('unpurchased');
  let orderFilter = $state<OrderFilter>(readStored(ORDER_FILTER_KEY, ORDER_FILTERS, 'unfulfilled'));
  /** 'all' = すべての年；null = 尚未決定（載入後預設最新一年） */
  let orderYear = $state<string | null>(readStored<string | null>(ORDER_YEAR_KEY, null, null));

  const years = $derived(orderYears(orders));
  const visibleOrders = $derived(filterOrders(orders, orderFilter, orderYear === 'all' ? null : orderYear));
  // 「お気に入り」分頁的數量：目前篩選條件下顯示的件數
  const favoriteCount = $derived(
    filterFavorites(favorites, filter, $globalState?.settings.list.showExpired ?? false).length,
  );

  /** 上次停留的分頁（只是個人便利，讀寫失敗時忽略）；舊版的 'unfulfilled' 視為訂單分頁 */
  function readTab(): Tab {
    const value = readStored<string | null>(TAB_KEY, null, null);
    return value === 'orders' || value === 'unfulfilled' ? 'orders' : 'favorites';
  }

  /** 讀取 localStorage；allowed 為 null 時接受任何字串 */
  function readStored<T extends string | null>(key: string, allowed: readonly string[] | null, fallback: T): T {
    try {
      const value = localStorage.getItem(key);
      return value !== null && (allowed === null || allowed.includes(value)) ? (value as T) : fallback;
    } catch {
      return fallback;
    }
  }

  function store(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 忽略
    }
  }

  function selectTab(next: Tab) {
    tab = next;
    store(TAB_KEY, next);
  }

  // 篩選與年份：記住選擇；年份預設最新一年，記住的年份已不存在時改回最新一年
  $effect(() => {
    store(ORDER_FILTER_KEY, orderFilter);
  });
  $effect(() => {
    if (!loaded) return;
    if (orderYear === null || (orderYear !== 'all' && !years.includes(orderYear))) {
      orderYear = years[0] ?? 'all';
      return;
    }
    store(ORDER_YEAR_KEY, orderYear);
  });

  /** 開啟統計頁；已開啟時切換到該分頁 */
  async function openStats() {
    const url = browser.runtime.getURL('/stats.html');
    const contexts = await browser.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] }).catch(() => []);
    const existing = contexts.find((c) => c.tabId !== undefined && c.tabId >= 0);
    if (existing?.tabId !== undefined) {
      await browser.tabs.update(existing.tabId, { active: true });
      if (existing.windowId !== undefined) await browser.windows.update(existing.windowId, { focused: true });
      return;
    }
    await browser.tabs.create({ url });
  }

  // 只套用最新一次讀取的結果，避免切換帳號時較晚返回的舊回應覆蓋畫面（code-review CR-011）
  let latestRequest = 0;

  async function load() {
    const request = ++latestRequest;
    const [fav, list] = await Promise.all([sendMessage({ type: 'listFavorites' }), sendMessage({ type: 'listOrders' })]);
    if (request !== latestRequest) return;
    customerId = fav?.customerId ?? null;
    favorites = fav?.favorites ?? [];
    orders = list?.orders ?? [];
    loaded = true;
  }

  onMount(() => {
    void load();
    const onMessage = (message: unknown) => {
      if (isBroadcastEvent(message) && (message.type === 'favoritesChanged' || message.type === 'purchasesChanged')) {
        void load();
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  });

  // 切換帳號時重新載入
  $effect(() => {
    if ($globalState && $globalState.activeAccountId !== customerId && loaded) {
      // 先清除舊帳號的清單，避免新資料載入前被誤認
      favorites = [];
      orders = [];
      void load();
    }
  });
</script>

{#if $i18n}
  {@const t = $i18n.t}
  <main>
    <div class="header">
      <AccountLine state={$globalState} {t} />
      <div class="header-actions">
      <button class="settings" onclick={() => void openStats()} title={t('sidepanel.openStats')} aria-label={t('sidepanel.openStats')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" />
        </svg>
      </button>
      <button
        class="settings"
        onclick={() => void browser.runtime.openOptionsPage()}
        title={t('sidepanel.openSettings')}
        aria-label={t('sidepanel.openSettings')}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
          />
        </svg>
      </button>
      </div>
    </div>
    <SyncStatus {t} />

    <div class="top-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'favorites'} class:active={tab === 'favorites'} onclick={() => selectTab('favorites')}>
        {t('sidepanel.tabFavorites', { count: favoriteCount })}
      </button>
      <button role="tab" aria-selected={tab === 'orders'} class:active={tab === 'orders'} onclick={() => selectTab('orders')}>
        {t('sidepanel.tabOrders', { count: visibleOrders.length })}
      </button>
    </div>

    {#if tab === 'favorites'}
      <FavoritesList {t} locale={$i18n.locale} globalState={$globalState} {customerId} {favorites} {loaded} bind:filter />
    {:else}
      <OrdersList
        {t}
        locale={$i18n.locale}
        visible={visibleOrders}
        {years}
        {loaded}
        bind:filter={orderFilter}
        bind:year={() => orderYear ?? 'all', (v) => (orderYear = v)}
      />
    {/if}
  </main>
{/if}

<style>
  main {
    padding: 12px 16px;
  }
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }
  .header-actions {
    flex: none;
    display: flex;
    gap: 2px;
  }
  .settings {
    flex: none;
    border: none;
    background: none;
    color: var(--hs-muted);
    padding: 4px;
    border-radius: 6px;
    cursor: pointer;
    margin-top: -4px;
    line-height: 0;
  }
  .settings:hover {
    color: var(--hs-fg);
    background: var(--hs-border);
  }
  .settings svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .top-tabs {
    display: flex;
    margin: 10px 0 4px;
    border-bottom: 1px solid var(--hs-border);
  }
  .top-tabs button {
    flex: 1;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--hs-muted);
    padding: 8px 4px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .top-tabs button.active {
    color: var(--hs-fg);
    border-bottom-color: var(--hs-accent);
  }
</style>
