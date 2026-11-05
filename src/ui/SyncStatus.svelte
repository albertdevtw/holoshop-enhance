<script lang="ts">
  import { onMount } from 'svelte';
  import type { TFunction } from '@/src/i18n';
  import { isBroadcastEvent, sendMessage } from '@/src/messaging';
  import { formatJst } from '@/src/shared/jst';
  import { syncDisplay } from '@/src/sync/status';
  import type { SyncMeta } from '@/src/sync/types';

  let { t, showFull = false }: { t: TFunction; showFull?: boolean } = $props();

  let meta = $state<SyncMeta | null>(null);
  let active = $state(false);
  let customerId = $state<string | null>(null);
  let noTab = $state(false);
  let now = $state(Date.now());

  const display = $derived(syncDisplay(meta, t, now, active));

  async function load() {
    const res = await sendMessage({ type: 'getSyncStatus' });
    meta = res?.meta ?? null;
    active = res?.active ?? false;
    customerId = res?.customerId ?? null;
    now = Date.now();
  }

  async function request(mode: 'full' | 'incremental') {
    const res = await sendMessage({ type: 'requestSync', mode });
    noTab = !res?.hasTab;
    await load();
  }

  onMount(() => {
    void load();
    const onMessage = (message: unknown) => {
      if (isBroadcastEvent(message) && message.type === 'syncStatusChanged') void load();
    };
    browser.runtime.onMessage.addListener(onMessage);
    // 「✓」顯示 3 秒後恢復
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => {
      browser.runtime.onMessage.removeListener(onMessage);
      clearInterval(timer);
    };
  });
</script>

{#if customerId}
  <section class="sync">
    {#if display.kind === 'running'}
      <p class="msg">{display.message}</p>
      <div class="bar" class:indeterminate={display.percent === null}>
        <div class="fill" style:width={display.percent === null ? '30%' : `${display.percent}%`}></div>
      </div>
    {:else if display.kind === 'error'}
      <p class="msg error">{display.message}</p>
      {#if meta?.state === 'needs-login'}
        <a href="https://shop.hololivepro.com/account/login" target="_blank" rel="noopener">{t('sync.goLogin')}</a>
      {/if}
    {:else if display.kind === 'done'}
      <p class="msg done">{display.message}</p>
    {/if}

    <p class="muted">
      {meta?.lastSuccessAt ? t('sync.lastSync', { time: formatJst(meta.lastSuccessAt) }) : t('sync.never')}
    </p>

    <div class="actions">
      <button disabled={display.kind === 'running'} onclick={() => request('incremental')}>{t('sync.now')}</button>
      {#if showFull}
        <button disabled={display.kind === 'running'} onclick={() => request('full')}>{t('sync.full')}</button>
      {/if}
    </div>
    {#if noTab}
      <p class="muted">{t('sync.noTab')}</p>
    {/if}
  </section>
{/if}

<style>
  .sync {
    margin: 0 0 12px;
    font-size: 13px;
  }
  .msg {
    margin: 0 0 4px;
  }
  .error {
    color: #d1242f;
  }
  .done {
    color: #1a7f37;
  }
  .muted {
    margin: 4px 0;
    color: var(--hs-muted);
    font-size: 12px;
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--hs-border);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: #2f6fde;
    transition: width 0.3s ease;
  }
  .indeterminate .fill {
    animation: slide 1.2s ease-in-out infinite;
  }
  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(350%);
    }
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }
</style>
