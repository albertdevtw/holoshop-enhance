<script lang="ts">
  import { onMount } from 'svelte';
  import type { Order, ProductInfo } from '@/src/data/db';
  import TalentView from './TalentView.svelte';
  import { isBroadcastEvent, sendMessage } from '@/src/messaging';
  import { convert, DEFAULT_RATES, rateToJpy, RATE_BASE, toJpyRate } from '@/src/stats/currency';
  import { currenciesInOrders, summarizeByPeriod, type Granularity } from '@/src/stats/period';
  import { createGlobalStateStore } from '@/src/ui/global-state-store';
  import { createI18nStore } from '@/src/ui/i18n-store';
  import { formatMoney } from '@/src/ui/orders-view';

  const i18n = createI18nStore();
  const globalState = createGlobalStateStore();

  let customerId = $state<string | null>(null);
  let orders = $state<Order[]>([]);
  let products = $state<Map<number, ProductInfo>>(new Map());
  type View = 'period' | 'talent';
  const VIEW_KEY = 'holoshop.stats.view';
  let view = $state<View>(readView());

  /** 上次停留的統計分頁（只是個人便利，讀寫失敗時忽略） */
  function readView(): View {
    try {
      return localStorage.getItem(VIEW_KEY) === 'talent' ? 'talent' : 'period';
    } catch {
      return 'period';
    }
  }

  function selectView(next: View) {
    view = next;
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // 忽略
    }
  }
  let loaded = $state(false);
  let granularity = $state<Granularity>('year');
  let year = $state<string | null>(null);

  const base = $derived($globalState?.settings.stats.baseCurrency ?? RATE_BASE);
  const rates = $derived($globalState?.settings.stats.rates ?? {});
  const orderCurrencies = $derived(currenciesInOrders(orders));
  const baseOptions = $derived([...new Set([RATE_BASE, ...orderCurrencies, base])].sort());
  const summary = $derived(summarizeByPeriod(orders, granularity, year, base, rates));
  const rateCurrencies = $derived(orderCurrencies.filter((c) => c !== base));

  // 年份選單：預設最新的年份
  $effect(() => {
    if (summary.years.length && (!year || !summary.years.includes(year))) year = summary.years[0] ?? null;
  });

  // 只套用最新一次讀取的結果，避免切換帳號時較晚返回的舊回應覆蓋畫面（code-review CR-011）
  let latestRequest = 0;

  async function load() {
    const request = ++latestRequest;
    const res = await sendMessage({ type: 'listOrders', withProducts: true });
    if (request !== latestRequest) return;
    customerId = res?.customerId ?? null;
    orders = res?.orders ?? [];
    products = new Map((res?.products ?? []).map((p) => [p.productId, p]));
    loaded = true;
  }

  function money(amount: number, currency: string, locale: Parameters<typeof formatMoney>[1]): string {
    return formatMoney({ amount, currency }, locale);
  }

  function periodLabel(key: string): string {
    return key.replace('-', '/');
  }

  /** 顯示用匯率：1 currency = N base，取 4 位有效數字 */
  function displayRate(currency: string, custom: Record<string, number>): string {
    const value = convert(1, currency, base, custom);
    return value === null ? '' : String(Number(value.toPrecision(4)));
  }

  function isCustom(currency: string): boolean {
    return rates[currency] !== undefined;
  }

  function updateStats(patch: Partial<{ baseCurrency: string; rates: Record<string, number> }>) {
    if (!$globalState) return;
    void sendMessage({ type: 'updateSettings', patch: { stats: { ...$globalState.settings.stats, ...patch } } });
  }

  function changeRate(currency: string, event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(value) || value <= 0) return;
    const jpy = toJpyRate(value, base, rates);
    if (jpy === null) return;
    updateStats({ rates: { ...rates, [currency]: jpy } });
  }

  onMount(() => {
    void load();
    const onMessage = (message: unknown) => {
      if (isBroadcastEvent(message) && message.type === 'purchasesChanged') void load();
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  });

  // 切換帳號時重新載入
  $effect(() => {
    if ($globalState && loaded && $globalState.activeAccountId !== customerId) {
      // 先清除舊帳號的統計，避免新資料載入前被誤認
      orders = [];
      products = new Map();
      void load();
    }
  });
</script>

{#if $i18n}
  {@const t = $i18n.t}
  {@const locale = $i18n.locale}
  <main>
    <h1>{t('stats.title')}</h1>

    {#if loaded && !customerId}
      <p class="muted">{t('common.noAccountYet')}</p>
    {:else if loaded && summary.total.orderCount === 0 && summary.years.length === 0}
      <p class="muted">{t('stats.empty')}</p>
    {:else}
      <div class="topbar">
        <div class="view-tabs" role="tablist">
          <button role="tab" aria-selected={view === 'period'} class:active={view === 'period'} onclick={() => selectView('period')}>
            {t('stats.viewPeriod')}
          </button>
          <button role="tab" aria-selected={view === 'talent'} class:active={view === 'talent'} onclick={() => selectView('talent')}>
            {t('stats.viewTalent')}
          </button>
        </div>
        <label>
          {t('stats.baseCurrency')}
          <select value={base} onchange={(e) => updateStats({ baseCurrency: (e.currentTarget as HTMLSelectElement).value })}>
            {#each baseOptions as c (c)}<option value={c}>{c}</option>{/each}
          </select>
        </label>
      </div>

      {#if view === 'talent'}
        <TalentView {t} {locale} {orders} {products} {base} {rates} />
      {:else}
      <div class="controls">
        <div class="segmented" role="tablist">
          <button role="tab" aria-selected={granularity === 'year'} class:active={granularity === 'year'} onclick={() => (granularity = 'year')}>
            {t('stats.byYear')}
          </button>
          <button role="tab" aria-selected={granularity === 'month'} class:active={granularity === 'month'} onclick={() => (granularity = 'month')}>
            {t('stats.byMonth')}
          </button>
        </div>
        {#if granularity === 'month'}
          <label>
            {t('stats.year')}
            <select bind:value={year}>
              {#each summary.years as y (y)}<option value={y}>{y}</option>{/each}
            </select>
          </label>
        {/if}
      </div>

      <div class="cards">
        <div class="card">
          <span class="card-label">{t('stats.totalCard', { currency: base })}</span>
          <strong>
            {summary.total.converted === null ? '—' : money(summary.total.converted, base, locale)}
          </strong>
          {#if summary.total.partial}<span class="partial">{t('stats.partial')}</span>{/if}
        </div>
        <div class="card">
          <span class="card-label">{t('stats.ordersCard')}</span>
          <strong>{t('stats.orderCount', { count: summary.total.orderCount })}</strong>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('stats.period')}</th>
              <th class="num">{t('stats.ordersCard')}</th>
              {#each summary.currencies as c (c)}<th class="num">{c}</th>{/each}
              <th class="num">{t('stats.totalConverted', { currency: base })}</th>
            </tr>
          </thead>
          <tbody>
            {#each summary.rows as row (row.key)}
              <tr>
                <td>{periodLabel(row.key)}</td>
                <td class="num">{row.orderCount}</td>
                {#each summary.currencies as c (c)}
                  <td class="num">{row.amounts[c] === undefined ? '—' : money(row.amounts[c], c, locale)}</td>
                {/each}
                <td class="num">
                  {row.converted === null ? '—' : money(row.converted, base, locale)}
                  {#if row.partial}<span class="partial">*</span>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <th>{t('stats.total')}</th>
              <th class="num">{summary.total.orderCount}</th>
              {#each summary.currencies as c (c)}
                <th class="num">{money(summary.total.amounts[c] ?? 0, c, locale)}</th>
              {/each}
              <th class="num">
                {summary.total.converted === null ? '—' : money(summary.total.converted, base, locale)}
                {#if summary.total.partial}<span class="partial">*</span>{/if}
              </th>
            </tr>
          </tfoot>
        </table>
      </div>

      <p class="note">{t('stats.note')}</p>
      {#if summary.total.partial}<p class="note">* {t('stats.partialNote')}</p>{/if}
      {#if summary.unknownAmount > 0}<p class="note">{t('stats.unknownAmount', { count: summary.unknownAmount })}</p>{/if}

      {/if}

      <details class="rates">
        <summary>{t('stats.rates', { currency: base })}</summary>
        {#if rateToJpy(base, rates) === null}
          <p class="note">{t('stats.baseUnset', { currency: base })}</p>
        {:else if rateCurrencies.length === 0}
          <p class="note">{t('stats.noOtherCurrency')}</p>
        {:else}
          <ul>
            {#each rateCurrencies as c (c)}
              {@const defaultValue = DEFAULT_RATES[c] === undefined ? '' : displayRate(c, {})}
              <li>
                <label>
                  1 {c} =
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={displayRate(c, rates)}
                    placeholder={t('stats.rateUnset')}
                    onchange={(e) => changeRate(c, e)}
                    class:custom={isCustom(c)}
                  />
                  {base}
                </label>
                <span class="muted">
                  {defaultValue ? t('stats.rateDefault', { value: defaultValue }) : t('stats.rateNoDefault')}
                </span>
              </li>
            {/each}
          </ul>
          <button onclick={() => updateStats({ rates: {} })} disabled={Object.keys(rates).length === 0}>
            {t('stats.resetRates')}
          </button>
        {/if}
      </details>
    {/if}
  </main>
{/if}

<style>
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 24px 16px 48px;
  }
  h1 {
    font-size: 22px;
    margin: 0 0 16px;
  }
  .muted {
    color: var(--hs-muted);
  }
  .topbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--hs-border);
  }
  .topbar label {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 6px;
  }
  .view-tabs {
    display: flex;
  }
  .view-tabs button {
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--hs-muted);
    padding: 8px 16px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  .view-tabs button.active {
    color: var(--hs-fg);
    border-bottom-color: var(--hs-accent);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
    margin-bottom: 16px;
  }
  .controls label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .segmented {
    display: flex;
    border: 1px solid var(--hs-border);
    border-radius: 6px;
    overflow: hidden;
  }
  .segmented button {
    border: none;
    background: none;
    color: inherit;
    padding: 6px 14px;
    cursor: pointer;
  }
  .segmented button + button {
    border-left: 1px solid var(--hs-border);
  }
  .segmented button.active {
    background: var(--hs-accent);
    color: #fff;
  }
  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 16px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 180px;
    padding: 12px 16px;
    border: 1px solid var(--hs-border);
    border-radius: 8px;
  }
  .card-label {
    font-size: 12px;
    color: var(--hs-muted);
  }
  .card strong {
    font-size: 20px;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--hs-border);
    text-align: left;
    white-space: nowrap;
  }
  thead th {
    font-size: 12px;
    color: var(--hs-muted);
  }
  tfoot th {
    border-top: 2px solid var(--hs-border);
    border-bottom: none;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .partial {
    margin-left: 4px;
    font-size: 12px;
    color: #9a6700;
  }
  .note {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--hs-muted);
  }
  .rates {
    margin-top: 24px;
  }
  .rates summary {
    cursor: pointer;
    font-weight: 600;
  }
  .rates ul {
    list-style: none;
    padding: 0;
    margin: 12px 0;
  }
  .rates li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    padding: 4px 0;
  }
  .rates label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .rates input {
    width: 110px;
  }
  .rates input.custom {
    border-color: var(--hs-accent);
  }
</style>
