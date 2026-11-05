<script lang="ts">
  import type { GlobalState } from '@/src/data/global';
  import type { TFunction } from '@/src/i18n';

  let { state, t }: { state: GlobalState | null; t: TFunction } = $props();

  const account = $derived(state?.activeAccountId ? state.accounts[state.activeAccountId] : undefined);
</script>

<p class="account">
  {t('common.account')}：
  {#if account}
    <strong>{account.label}</strong>
  {:else}
    <span class="muted">{t('common.noAccountYet')}</span>
  {/if}
</p>

<style>
  .account {
    margin: 0 0 12px;
  }
  .muted {
    color: var(--hs-muted);
  }
</style>
