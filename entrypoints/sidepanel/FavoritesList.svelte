<script lang="ts">
  import type { GlobalState } from '@/src/data/global';
  import type { TFunction, UiLocale } from '@/src/i18n';
  import type { FavoriteView } from '@/src/messaging';
  import { sendMessage } from '@/src/messaging';
  import { formatJst } from '@/src/shared/jst';
  import {
    deadlineState,
    favoriteTitle,
    filterFavorites,
    isExpiredUnpurchased,
    productUrl,
    sortFavorites,
    type FavoriteFilter,
  } from '@/src/ui/favorites-view';

  let {
    t,
    locale,
    globalState,
    customerId,
    favorites,
    loaded,
    filter = $bindable('unpurchased'),
  }: {
    t: TFunction;
    locale: UiLocale;
    globalState: GlobalState | null;
    customerId: string | null;
    favorites: FavoriteView[];
    loaded: boolean;
    filter?: FavoriteFilter;
  } = $props();

  const filters: FavoriteFilter[] = ['unpurchased', 'purchased', 'all'];
  const filterLabel: Record<FavoriteFilter, string> = {
    unpurchased: 'list.filterUnpurchased',
    purchased: 'list.filterPurchased',
    all: 'list.filterAll',
  };

  const showExpired = $derived(globalState?.settings.list.showExpired ?? false);
  const visible = $derived(sortFavorites(filterFavorites(favorites, filter, showExpired)));

  async function remove(favorite: FavoriteView) {
    if (!customerId) return;
    await sendMessage({ type: 'removeFavorite', customerId, productId: favorite.productId });
  }

  async function toggleMute(favorite: FavoriteView) {
    if (!customerId) return;
    await sendMessage({ type: 'setFavoriteMuted', customerId, productId: favorite.productId, muted: !favorite.muted });
  }

  function changeShowExpired(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).checked;
    void sendMessage({ type: 'updateSettings', patch: { list: { showExpired: value } } });
  }
</script>

<div class="toolbar">
  <div class="tabs" role="tablist">
    {#each filters as f (f)}
      <button role="tab" aria-selected={filter === f} class:active={filter === f} onclick={() => (filter = f)}>
        {t(filterLabel[f])}
      </button>
    {/each}
  </div>
  <label class="expired">
    <input type="checkbox" checked={showExpired} onchange={changeShowExpired} />
    {t('list.showExpired')}
  </label>
</div>

{#if loaded && visible.length === 0}
  <p class="muted">{t('sidepanel.empty')}</p>
{/if}

<ul class="list">
  {#each visible as fav (fav.productId)}
    {@const dl = deadlineState(fav)}
    <li class="item" class:ended={isExpiredUnpurchased(fav)}>
      <a class="thumb" href={productUrl(fav, locale)} target="_blank" rel="noopener" title={t('list.openProduct')}>
        {#if fav.imageUrl}<img src={fav.imageUrl} alt="" loading="lazy" />{/if}
      </a>
      <div class="body">
        <a class="name" href={productUrl(fav, locale)} target="_blank" rel="noopener">
          {favoriteTitle(fav, locale)}
        </a>
        <div class="deadline">
          {#if fav.salePeriod?.end}
            <span>{t('list.deadline')}：{formatJst(fav.salePeriod.end)}</span>
          {/if}
          <span
            class="badge"
            class:soon={fav.purchased === 0 &&
              (dl.kind === 'today' ||
                (dl.kind === 'days' && dl.days <= (globalState?.settings.reminder.daysBefore ?? 7)))}
          >
            {#if dl.kind === 'none'}{t('list.noPeriod')}
            {:else if dl.kind === 'ended'}{t('list.ended')}
            {:else if dl.kind === 'today'}{t('list.dueToday')}
            {:else}{t('list.daysLeft', { count: dl.days })}{/if}
          </span>
          {#if fav.purchased > 0}
            <span class="badge purchased">{t('list.purchasedCount', { count: fav.purchased })}</span>
          {/if}
        </div>
      </div>
      <div class="ops">
        <button
          class="icon"
          class:muted-on={fav.muted}
          onclick={() => toggleMute(fav)}
          title={fav.muted ? t('list.unmute') : t('list.mute')}
          aria-label={fav.muted ? t('list.unmute') : t('list.mute')}
          aria-pressed={fav.muted}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0" />
            {#if fav.muted}<path d="M4 4l16 16" />{/if}
          </svg>
        </button>
        <button class="icon" onclick={() => remove(fav)} title={t('list.remove')} aria-label={t('list.remove')}>×</button>
      </div>
    </li>
  {/each}
</ul>

<style>
  .muted {
    color: var(--hs-muted);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 8px 0;
  }
  .tabs {
    display: flex;
    border: 1px solid var(--hs-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .tabs button {
    border: none;
    background: none;
    color: inherit;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .tabs button + button {
    border-left: 1px solid var(--hs-border);
  }
  .tabs button.active {
    background: var(--hs-accent);
    color: #fff;
  }
  .expired {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--hs-muted);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .item {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 0;
    border-top: 1px solid var(--hs-border);
  }
  .item.ended {
    opacity: 0.45;
    filter: grayscale(1);
  }
  .thumb {
    flex: none;
    width: 56px;
    height: 56px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--hs-border);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .name {
    color: inherit;
    text-decoration: none;
    font-weight: 600;
    display: block;
    overflow-wrap: anywhere;
  }
  .name:hover {
    text-decoration: underline;
  }
  .deadline {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
    font-size: 12px;
    color: var(--hs-muted);
  }
  .badge {
    padding: 0 6px;
    border-radius: 999px;
    border: 1px solid var(--hs-border);
  }
  .badge.soon {
    color: var(--hs-accent);
    border-color: var(--hs-accent);
  }
  .badge.purchased {
    color: #1a7f37;
    border-color: #a6e3b5;
  }
  .ops {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .icon {
    border: none;
    background: none;
    color: var(--hs-muted);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 4px;
  }
  .icon:hover {
    color: var(--hs-fg);
  }
  .icon svg path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .icon.muted-on {
    color: var(--hs-accent);
  }
</style>
