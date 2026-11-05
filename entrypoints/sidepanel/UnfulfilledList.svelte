<script lang="ts">
  import type { Order } from '@/src/data/db';
  import type { TFunction, UiLocale } from '@/src/i18n';
  import {
    formatMoney,
    formatOrderDate,
    itemProductUrl,
    orderDetailUrl,
    shipState,
    sortUnfulfilled,
  } from '@/src/ui/orders-view';

  let { t, locale, orders, loaded }: { t: TFunction; locale: UiLocale; orders: Order[]; loaded: boolean } = $props();

  const sorted = $derived(sortUnfulfilled(orders));
</script>

{#if loaded && sorted.length === 0}
  <p class="muted">{t('orders.empty')}</p>
{/if}

<ul class="orders">
  {#each sorted as order (order.orderNumber)}
    {@const ship = shipState(order)}
    <li class="order">
      <div class="head">
        <div class="ship">
          <span class="label">{t('orders.shipBy')}</span>
          <span class="ship-text">{order.shipBy?.text || t('orders.noShipBy')}</span>
        </div>
        <div class="badges">
          {#if ship.kind !== 'none'}
            <span class="badge" class:overdue={ship.kind === 'overdue'} class:soon={ship.kind === 'today'}>
              {#if ship.kind === 'today'}{t('orders.dueToday')}
              {:else if ship.kind === 'overdue'}{t('orders.overdue', { count: ship.days })}
              {:else}{t('orders.daysLeft', { count: ship.days })}{/if}
            </span>
          {/if}
          <span class="badge status">{order.statusText || t('orders.status')}</span>
        </div>
      </div>

      <dl class="meta">
        <div><dt>{t('orders.orderDate')}</dt><dd>{formatOrderDate(order.date)}</dd></div>
        <div><dt>{t('orders.orderNumber')}</dt><dd>{order.orderNumber}</dd></div>
      </dl>

      <ul class="items">
        {#each order.items as item, i (i)}
          <li class="item">
            <a class="thumb" href={itemProductUrl(item.handle, locale)} target="_blank" rel="noopener" title={t('list.openProduct')}>
              {#if item.imageUrl}<img src={item.imageUrl} alt="" loading="lazy" />{/if}
            </a>
            <div class="item-body">
              <a class="name" href={itemProductUrl(item.handle, locale)} target="_blank" rel="noopener">
                {item.productTitle || item.handle}
              </a>
              {#if item.variantTitleRaw}<span class="variant">{item.variantTitleRaw}</span>{/if}
            </div>
            <span class="qty">{t('orders.quantity', { count: item.quantity })}</span>
          </li>
        {/each}
      </ul>

      <div class="foot">
        <a class="detail" href={orderDetailUrl(order, locale)} target="_blank" rel="noopener">{t('orders.detail')}</a>
        {#if order.total}
          <span class="total">{t('orders.total')} <strong>{formatMoney(order.total, locale)}</strong></span>
        {/if}
      </div>
    </li>
  {/each}
</ul>

<style>
  .muted {
    color: var(--hs-muted);
  }
  .orders {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }
  .order {
    border: 1px solid var(--hs-border);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 10px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6px;
  }
  .ship {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .label {
    font-size: 11px;
    color: var(--hs-muted);
  }
  .ship-text {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    font-size: 12px;
  }
  .badge {
    padding: 0 6px;
    border-radius: 999px;
    border: 1px solid var(--hs-border);
    color: var(--hs-muted);
    white-space: nowrap;
  }
  .badge.soon {
    color: var(--hs-accent);
    border-color: var(--hs-accent);
  }
  .badge.overdue {
    color: #d1242f;
    border-color: #d1242f;
    font-weight: 600;
  }
  .badge.status {
    color: #9a6700;
    border-color: #d4a72c;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
    margin: 6px 0;
    font-size: 12px;
    color: var(--hs-muted);
  }
  .meta div {
    display: flex;
    gap: 4px;
  }
  .meta dt::after {
    content: '：';
  }
  .meta dd {
    margin: 0;
    color: var(--hs-fg);
  }
  .items {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .item {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 6px 0;
    border-top: 1px dashed var(--hs-border);
  }
  .thumb {
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--hs-border);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .item-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    color: inherit;
    text-decoration: none;
    font-size: 13px;
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
  .qty {
    flex: none;
    font-size: 13px;
    font-weight: 600;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding-top: 6px;
    border-top: 1px solid var(--hs-border);
    font-size: 12px;
  }
  .detail {
    color: var(--hs-accent);
  }
  .total strong {
    font-size: 14px;
  }
</style>
