<script lang="ts">
  import type { Order, ProductInfo } from '@/src/data/db';
  import type { TFunction, UiLocale } from '@/src/i18n';
  import { summarizeByTalent, TALENT_CATEGORIES, type TalentCategory, type TalentRow } from '@/src/stats/talent';
  import { formatMoney } from '@/src/ui/orders-view';
  import { onMount } from 'svelte';
  import TalentDetail from './TalentDetail.svelte';

  let {
    t,
    locale,
    orders,
    products,
    base,
    rates,
  }: {
    t: TFunction;
    locale: UiLocale;
    orders: Order[];
    products: Map<number, ProductInfo>;
    base: string;
    rates: Record<string, number>;
  } = $props();

  type Filter = TalentCategory | 'all';
  const FILTERS: Filter[] = ['talent', 'unit', 'group', 'other', 'all'];
  const FILTER_KEY = 'holoshop.stats.talentFilter';

  let filter = $state<Filter>(readFilter());
  /** 'all' = すべての期間 */
  let year = $state<string>('all');

  const summary = $derived(summarizeByTalent(orders, products, year === 'all' ? null : year, base, rates));
  const shown = $derived(filter === 'all' ? TALENT_CATEGORIES : [filter]);
  const maxAmount = $derived(Math.max(0, ...shown.flatMap((c) => summary.rows[c].map((r) => r.amount))));
  const shownTotal = $derived(filter === 'all' ? summary.total : summary.subtotals[filter]);

  // 商品明細：以網址 hash 記錄，瀏覽器上一頁可返回
  const HASH_PREFIX = '#detail=';
  let selected = $state<{ category: TalentCategory; name: string } | null>(parseHash());
  let pushed = false;

  function parseHash(): { category: TalentCategory; name: string } | null {
    if (!location.hash.startsWith(HASH_PREFIX)) return null;
    const raw = location.hash.slice(HASH_PREFIX.length);
    const sep = raw.indexOf('/');
    if (sep < 0) return null;
    const category = raw.slice(0, sep) as TalentCategory;
    if (!TALENT_CATEGORIES.includes(category)) return null;
    try {
      return { category, name: decodeURIComponent(raw.slice(sep + 1)) };
    } catch {
      return null;
    }
  }

  function openDetail(row: TalentRow) {
    selected = { category: row.category, name: row.name };
    history.pushState(null, '', `${HASH_PREFIX}${row.category}/${encodeURIComponent(row.name)}`);
    pushed = true;
    window.scrollTo(0, 0);
  }

  function closeDetail() {
    if (pushed) {
      history.back();
      return;
    }
    history.replaceState(null, '', location.pathname + location.search);
    selected = null;
  }

  onMount(() => {
    const onPop = () => {
      selected = parseHash();
      if (!selected) pushed = false;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

  /** 明細標題：固定列翻譯，其餘用原文 */
  function titleOf(target: { category: TalentCategory; name: string }): string {
    const row = summary.rows[target.category].find((r) => r.name === target.name);
    return row ? rowName(row) : target.name;
  }

  /** 上次的分類選擇（只是個人便利，讀寫失敗時忽略） */
  function readFilter(): Filter {
    try {
      const value = localStorage.getItem(FILTER_KEY);
      return FILTERS.includes(value as Filter) ? (value as Filter) : 'talent';
    } catch {
      return 'talent';
    }
  }

  function selectFilter(next: Filter) {
    filter = next;
    try {
      localStorage.setItem(FILTER_KEY, next);
    } catch {
      // 忽略
    }
  }

  function rowName(row: TalentRow): string {
    return row.fixed ? t(`stats.talent.row.${row.fixed}`) : row.name;
  }

  function money(amount: number): string {
    return formatMoney({ amount, currency: base }, locale);
  }

  function barWidth(amount: number): string {
    return maxAmount > 0 ? `${Math.max(1, (amount / maxAmount) * 100)}%` : '0%';
  }
</script>

{#if selected}
  <TalentDetail
    {t}
    {locale}
    {orders}
    {products}
    year={year === 'all' ? null : year}
    {base}
    {rates}
    category={selected.category}
    name={selected.name}
    title={titleOf(selected)}
    onback={closeDetail}
  />
{:else}
<div class="controls">
  <div class="segmented" role="tablist">
    {#each FILTERS as f (f)}
      <button role="tab" aria-selected={filter === f} class:active={filter === f} onclick={() => selectFilter(f)}>
        {t(`stats.talent.filter.${f}`)}
      </button>
    {/each}
  </div>
  <label>
    {t('stats.talent.period')}
    <select bind:value={year}>
      <option value="all">{t('stats.talent.allPeriods')}</option>
      {#each summary.years as y (y)}<option value={y}>{y}</option>{/each}
    </select>
  </label>
</div>

{#each shown as category (category)}
  {#if filter === 'all'}
    <h2 class="category">
      <span>{t(`stats.talent.filter.${category}`)}</span>
      <span class="num">{money(summary.subtotals[category])}</span>
    </h2>
  {/if}
  {#if summary.rows[category].length === 0}
    <p class="muted empty">{t('stats.talent.empty')}</p>
  {:else}
    <ul class="rows">
      {#each summary.rows[category] as row (row.category + row.name)}
        <li class:fixed={row.fixed !== null}>
          <button class="row" onclick={() => openDetail(row)} title={t('stats.talent.openDetail')}>
            <span class="name">{rowName(row)}</span>
            <span class="amount num">{money(row.amount)}</span>
            <span class="bar"><span class="fill" style:width={barWidth(row.amount)}></span></span>
            <span class="qty num">{t('stats.talent.quantity', { count: row.quantity })}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/each}

<p class="total">
  <span>{filter === 'all' ? t('stats.total') : t('stats.talent.subtotal', { category: t(`stats.talent.filter.${filter}`) })}</span>
  <strong class="num">{money(shownTotal)}</strong>
</p>

<p class="note">{t('stats.talent.note')}</p>
{#if summary.partial}<p class="note">{t('stats.partialNote')}</p>{/if}
{#if summary.pendingOrders > 0}<p class="note pending">{t('stats.talent.pending', { count: summary.pendingOrders })}</p>{/if}
{/if}

<style>
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
    flex-wrap: wrap;
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
  .category {
    display: flex;
    justify-content: space-between;
    font-size: 15px;
    margin: 20px 0 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--hs-border);
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .rows .row {
    width: 100%;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    border-radius: 6px;
    display: grid;
    grid-template-columns: minmax(120px, 2fr) 110px minmax(80px, 3fr) 60px;
    align-items: center;
    gap: 12px;
    padding: 5px 6px;
  }
  .rows .row:hover {
    background: color-mix(in srgb, var(--hs-border) 35%, transparent);
  }
  .rows li.fixed .name {
    color: var(--hs-muted);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 10px;
    background: color-mix(in srgb, var(--hs-border) 40%, transparent);
    border-radius: 999px;
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--hs-accent);
    border-radius: 999px;
  }
  .qty {
    font-size: 12px;
    color: var(--hs-muted);
  }
  .total {
    display: flex;
    justify-content: space-between;
    margin: 16px 0 0;
    padding-top: 8px;
    border-top: 2px solid var(--hs-border);
  }
  .total strong {
    font-size: 18px;
  }
  .muted {
    color: var(--hs-muted);
  }
  .empty {
    font-size: 13px;
    margin: 6px 0;
  }
  .note {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--hs-muted);
  }
  .note.pending {
    color: #9a6700;
  }
</style>
