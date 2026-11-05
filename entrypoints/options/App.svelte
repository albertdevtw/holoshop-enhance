<script lang="ts">
  import type { LocaleMode, Settings } from '@/src/data/global';
  import { sendMessage } from '@/src/messaging';
  import AccountLine from '@/src/ui/AccountLine.svelte';
  import SyncStatus from '@/src/ui/SyncStatus.svelte';
  import AccountsSection from './AccountsSection.svelte';
  import DataSection from './DataSection.svelte';
  import { createGlobalStateStore } from '@/src/ui/global-state-store';
  import { createI18nStore } from '@/src/ui/i18n-store';

  const i18n = createI18nStore();
  const globalState = createGlobalStateStore();
  const modes: LocaleMode[] = ['follow-site', 'ja', 'en', 'zh-TW'];

  function changeShowOnIcon(event: Event) {
    const showOnIcon = (event.currentTarget as HTMLInputElement).checked;
    void sendMessage({ type: 'updateSettings', patch: { sync: { showOnIcon } } });
  }

  function updateReminder(patch: Partial<Settings['reminder']>) {
    if (!$globalState) return;
    void sendMessage({ type: 'updateSettings', patch: { reminder: { ...$globalState.settings.reminder, ...patch } } });
  }

  function changeDays(event: Event) {
    const value = Math.round(Number((event.currentTarget as HTMLInputElement).value));
    if (Number.isFinite(value)) updateReminder({ daysBefore: Math.min(30, Math.max(1, value)) });
  }

  function changeLocale(event: Event) {
    const localeMode = (event.currentTarget as HTMLSelectElement).value as LocaleMode;
    void sendMessage({ type: 'updateSettings', patch: { localeMode } });
  }
</script>

{#if $i18n && $globalState}
  <main>
    <h1>{$i18n.t('options.title')}</h1>
    <AccountLine state={$globalState} t={$i18n.t} />
    <label>
      {$i18n.t('options.language')}
      <select value={$globalState.settings.localeMode} onchange={changeLocale}>
        {#each modes as mode (mode)}
          <option value={mode}>{$i18n.t(`options.localeMode.${mode}`)}</option>
        {/each}
      </select>
    </label>

    <h2>{$i18n.t('options.reminderSection')}</h2>
    <label>
      {$i18n.t('options.daysBefore')}
      <input type="number" min="1" max="30" value={$globalState.settings.reminder.daysBefore} onchange={changeDays} />
    </label>

    <h2>{$i18n.t('sync.section')}</h2>
    <SyncStatus t={$i18n.t} showFull />
    <label>
      <input type="checkbox" checked={$globalState.settings.sync.showOnIcon} onchange={changeShowOnIcon} />
      {$i18n.t('sync.showOnIcon')}
    </label>

    <h2>{$i18n.t('options.collectionSection')}</h2>
    <label>
      <input
        type="checkbox"
        checked={$globalState.settings.collection.autoLoadMore}
        onchange={(e) =>
          sendMessage({
            type: 'updateSettings',
            patch: { collection: { autoLoadMore: (e.currentTarget as HTMLInputElement).checked } },
          })}
      />
      {$i18n.t('options.autoLoadMore')}
    </label>

    <h2>{$i18n.t('data.section')}</h2>
    <DataSection t={$i18n.t} globalState={$globalState} />

    <h2>{$i18n.t('accounts.section')}</h2>
    <AccountsSection t={$i18n.t} globalState={$globalState} />

    <footer class="disclaimer">{$i18n.t('options.disclaimer')}</footer>
  </main>
{/if}

<style>
  .disclaimer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid var(--hs-border);
    font-size: 12px;
    color: var(--hs-muted);
    text-align: center;
  }
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: 24px 16px;
  }
  h1 {
    font-size: 20px;
    margin: 0 0 12px;
  }
  h2 {
    font-size: 16px;
    margin: 24px 0 8px;
  }
  label {
    margin: 0 0 8px;
    display: flex;
    gap: 12px;
    align-items: center;
  }
</style>
