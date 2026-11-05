<script lang="ts">
  import { onMount } from 'svelte';
  import type { Order } from '@/src/data/db';
  import { isBroadcastEvent, sendMessage, type FavoriteView } from '@/src/messaging';
  import AccountLine from '@/src/ui/AccountLine.svelte';
  import SyncStatus from '@/src/ui/SyncStatus.svelte';
  import { filterFavorites, type FavoriteFilter } from '@/src/ui/favorites-view';
  import { createGlobalStateStore } from '@/src/ui/global-state-store';
  import { createI18nStore } from '@/src/ui/i18n-store';
  import FavoritesList from './FavoritesList.svelte';
  import UnfulfilledList from './UnfulfilledList.svelte';

  type Tab = 'favorites' | 'unfulfilled';
  const TAB_KEY = 'holoshop.sidepanel.tab';

  const i18n = createI18nStore();
  const globalState = createGlobalStateStore();

  let customerId = $state<string | null>(null);
  let favorites = $state<FavoriteView[]>([]);
  let orders = $state<Order[]>([]);
  let loaded = $state(false);
  let tab = $state<Tab>(readTab());
  let filter = $state<FavoriteFilter>('unpurchased');

  // 「お気に入り」分頁的數量：目前篩選條件下顯示的件數
  const favoriteCount = $derived(
    filterFavorites(favorites, filter, $globalState?.settings.list.showExpired ?? false).length,
  );

  /** 上次停留的分頁（只是個人便利，讀寫失敗時忽略） */
  function readTab(): Tab {
    try {
      return localStorage.getItem(TAB_KEY) === 'unfulfilled' ? 'unfulfilled' : 'favorites';
    } catch {
      return 'favorites';
    }
  }

  function selectTab(next: Tab) {
    tab = next;
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // 忽略
    }
  }

  async function load() {
    const [fav, unf] = await Promise.all([
      sendMessage({ type: 'listFavorites' }),
      sendMessage({ type: 'listUnfulfilledOrders' }),
    ]);
    customerId = fav?.customerId ?? null;
    favorites = fav?.favorites ?? [];
    orders = unf?.orders ?? [];
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
    if ($globalState && $globalState.activeAccountId !== customerId && loaded) void load();
  });
</script>

{#if $i18n}
  {@const t = $i18n.t}
  <main>
    <div class="header">
      <AccountLine state={$globalState} {t} />
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
    <SyncStatus {t} />

    <div class="top-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'favorites'} class:active={tab === 'favorites'} onclick={() => selectTab('favorites')}>
        {t('sidepanel.tabFavorites', { count: favoriteCount })}
      </button>
      <button role="tab" aria-selected={tab === 'unfulfilled'} class:active={tab === 'unfulfilled'} onclick={() => selectTab('unfulfilled')}>
        {t('sidepanel.tabUnfulfilled', { count: orders.length })}
      </button>
    </div>

    {#if tab === 'favorites'}
      <FavoritesList {t} locale={$i18n.locale} globalState={$globalState} {customerId} {favorites} {loaded} bind:filter />
    {:else}
      <UnfulfilledList {t} locale={$i18n.locale} {orders} {loaded} />
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
