<script lang="ts">
  import type { AccountInfo, GlobalState } from '@/src/data/global';
  import type { TFunction } from '@/src/i18n';
  import { sendMessage } from '@/src/messaging';

  let { t, globalState }: { t: TFunction; globalState: GlobalState } = $props();

  const accounts = $derived(Object.values(globalState.accounts).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)));

  function rename(account: AccountInfo, event: Event) {
    const label = (event.currentTarget as HTMLInputElement).value.trim();
    if (label && label !== account.label) void sendMessage({ type: 'renameAccount', customerId: account.customerId, label });
  }

  function remove(account: AccountInfo) {
    // 刪除後無法復原，需二次確認（05-features F6）
    if (!confirm(t('accounts.deleteConfirm1', { label: account.label }))) return;
    if (!confirm(t('accounts.deleteConfirm2'))) return;
    void sendMessage({ type: 'deleteAccount', customerId: account.customerId });
  }
</script>

<section>
  {#if accounts.length === 0}
    <p class="muted">{t('accounts.empty')}</p>
  {/if}
  <ul>
    {#each accounts as account (account.customerId)}
      <li>
        <input
          aria-label={t('accounts.label')}
          value={account.label}
          maxlength="40"
          onchange={(e) => rename(account, e)}
        />
        {#if account.customerId === globalState.activeAccountId}<span class="current">{t('accounts.current')}</span>{/if}
        <button class="danger" onclick={() => remove(account)}>{t('accounts.delete')}</button>
      </li>
    {/each}
  </ul>
</section>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
  }
  .current {
    font-size: 12px;
    color: var(--hs-accent);
    border: 1px solid var(--hs-accent);
    border-radius: 999px;
    padding: 0 6px;
  }
  .danger {
    margin-left: auto;
    color: #d1242f;
  }
  .muted {
    color: var(--hs-muted);
  }
</style>
