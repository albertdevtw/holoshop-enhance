<script lang="ts">
  import type { Order, ProductInfo } from '@/src/data/db';
  import type { TFunction, UiLocale } from '@/src/i18n';
  import { talentDetail, type TalentCategory } from '@/src/stats/talent';
  import { formatMoney, itemProductUrl } from '@/src/ui/orders-view';

  let {
    t,
    locale,
    orders,
    products,
    year,
    base,
    rates,
    category,
    name,
    title,
    incompleteOrders,
    pendingOrders,
    onback,
  }: {
    t: TFunction;
    locale: UiLocale;
    orders: Order[];
    products: Map<number, ProductInfo>;
    year: string | null;
    base: string;
    rates: Record<string, number>;
    category: TalentCategory;
    name: string;
    /** 顯示用的列名（固定列已翻譯） */
    title: string;
    incompleteOrders: number;
    pendingOrders: number;
    onback: () => void;
  } = $props();

  const detail = $derived(talentDetail(orders, products, year, base, rates, { category, name }));

  function money(amount: number): string {
    return formatMoney({ amount, currency: base }, locale);
  }
</script>

<div class="head">
  <button class="back" onclick={onback}>← {t('stats.talent.back')}</button>
  <h2>
    {title}
    <span class="category">（{t(`stats.talent.filter.${category}`)}）</span>
  </h2>
  <span class="muted">{t('stats.talent.period')}：{year ?? t('stats.talent.allPeriods')}</span>
</div>

{#if detail.rows.length === 0}
  <p class="muted">{t('stats.talent.empty')}</p>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>{t('stats.talent.detail.product')}</th>
          <th class="num">{t('stats.talent.detail.unitPrice')}</th>
          <th class="num">{t('stats.talent.detail.quantity')}</th>
          <th class="num">{t('stats.talent.detail.total')}</th>
        </tr>
      </thead>
      <tbody>
        {#each detail.rows as row (row.key)}
          <tr>
            <td>
              <div class="product">
                <a class="thumb" href={itemProductUrl(row.handle, locale)} target="_blank" rel="noopener" tabindex="-1">
                  {#if row.imageUrl}<img src={row.imageUrl} alt="" loading="lazy" />{/if}
                </a>
                <div class="names">
                  <a class="name" href={itemProductUrl(row.handle, locale)} target="_blank" rel="noopener">{row.productTitle}</a>
                  {#if row.variantTitle}<span class="variant">{row.variantTitle}</span>{/if}
                </div>
              </div>
            </td>
            <td class="num">{money(row.unitPrice)}</td>
            <td class="num">{row.quantity}</td>
            <td class="num">{money(row.total)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <th>{t('stats.total')}</th>
          <th></th>
          <th class="num">{detail.quantity}</th>
          <th class="num">{money(detail.total)}</th>
        </tr>
      </tfoot>
    </table>
  </div>
{/if}
{#if pendingOrders > 0}<p class="note">{t('stats.talent.pending', { count: pendingOrders })}</p>{/if}
{#if incompleteOrders > 0}<p class="note">{t('stats.talent.incomplete', { count: incompleteOrders })}</p>{/if}

<style>
  .note {
    margin: 8px 0 0;
    font-size: 12px;
    color: #9a6700;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    margin-bottom: 12px;
  }
  .back {
    border: 1px solid var(--hs-border);
    background: none;
    color: inherit;
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
  }
  .back:hover {
    border-color: var(--hs-accent);
  }
  h2 {
    font-size: 17px;
    margin: 0;
  }
  .category {
    font-size: 13px;
    font-weight: normal;
    color: var(--hs-muted);
  }
  .muted {
    color: var(--hs-muted);
    font-size: 13px;
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
    vertical-align: middle;
  }
  thead th {
    font-size: 12px;
    color: var(--hs-muted);
    white-space: nowrap;
  }
  tfoot th {
    border-top: 2px solid var(--hs-border);
    border-bottom: none;
  }
  .num {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .product {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .thumb {
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--hs-border);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .names {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    color: inherit;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .name:hover {
    text-decoration: underline;
  }
  .variant {
    font-size: 12px;
    color: var(--hs-muted);
    overflow-wrap: anywhere;
  }
</style>
