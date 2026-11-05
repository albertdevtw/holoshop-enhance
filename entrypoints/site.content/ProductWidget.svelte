<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProductSnapshot } from '@/src/data/favorites';
  import { getGlobalState, watchGlobalState, type GlobalState } from '@/src/data/global';
  import type { PurchaseSummary } from '@/src/data/purchases';
  import { createI18n, resolveUiLocale, type TFunction } from '@/src/i18n';
  import { isBroadcastEvent, sendMessage } from '@/src/messaging';
  import HeartButton from './HeartButton.svelte';
  import OptionBadge from './OptionBadge.svelte';
  import type { HeartState } from './types';

  let {
    customerId,
    product,
    onPurchases,
    hasOptionDom,
  }: {
    customerId: string | null;
    product: ProductSnapshot;
    /** 頁面上是否有規格選項（沒有時改在徽章下方列出各規格數量） */
    hasOptionDom: boolean;
    /** 購買資料載入後通知外部（用於各規格選項旁的數量） */
    onPurchases: (summary: PurchaseSummary | null, t: TFunction) => void;
  } = $props();

  let t = $state<TFunction | null>(null);
  let heart = $state<HeartState>('busy');
  let purchases = $state<PurchaseSummary | null>(null);
  let variantTitles = $state<Record<number, string>>({});
  const breakdown = $derived(
    purchases
      ? Object.entries(purchases.byVariant)
          .map(([id, count]) => ({ title: variantTitles[Number(id)] ?? `#${id}`, count }))
          .filter((row) => row.title !== 'Default Title') // 無規格商品不列出
      : [],
  );

  async function applyLocale(state: GlobalState) {
    const i18n = await createI18n(resolveUiLocale(state.settings.localeMode, product.locale));
    t = i18n.t.bind(i18n) as TFunction;
  }

  async function load() {
    if (!customerId) {
      heart = 'logged-out';
      return;
    }
    const res = await sendMessage({ type: 'productViewed', customerId, product });
    if (res?.ok) {
      heart = res.value.favorite ? 'on' : 'off';
      purchases = res.value.purchases;
      variantTitles = res.value.variantTitles;
    } else {
      heart = 'error';
    }
  }

  async function toggle() {
    if (!customerId || heart === 'busy') return;
    heart = 'busy';
    const res = await sendMessage({ type: 'toggleFavorite', customerId, product });
    heart = res?.ok ? (res.value.favorite ? 'on' : 'off') : 'error';
  }

  $effect(() => {
    if (t) onPurchases(purchases, t);
  });

  onMount(() => {
    void getGlobalState().then(applyLocale);
    void load();
    const unwatch = watchGlobalState((state) => void applyLocale(state));
    // 其他分頁或 Side Panel 變更最愛、或同步更新購買資料時重新顯示
    const onMessage = (message: unknown) => {
      if (!isBroadcastEvent(message) || !('customerId' in message) || message.customerId !== customerId) return;
      if (message.type === 'favoritesChanged' && message.productId === product.productId) {
        heart = message.favorite ? 'on' : 'off';
      } else if (message.type === 'purchasesChanged') {
        void load();
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => {
      unwatch();
      browser.runtime.onMessage.removeListener(onMessage);
    };
  });
</script>

{#if t}
  <div class="widget">
    <HeartButton state={heart} {t} onToggle={toggle} />
    {#if purchases && purchases.total > 0}
      <OptionBadge label={t('product.purchased', { count: purchases.total })} />
    {/if}
  </div>
  {#if !hasOptionDom && breakdown.length > 0}
    <ul class="breakdown">
      {#each breakdown as row (row.title)}
        <li>{row.title} ×{row.count}</li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .breakdown {
    margin: 0 0 8px;
    padding: 0 0 0 4px;
    list-style: none;
    font: 12px/1.6 system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif;
    color: #1a7f37;
  }
  .widget {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
    font-family: system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  }
</style>
