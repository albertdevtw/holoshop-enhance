<script lang="ts">
  import { backupFileName, parseBackup, summarizeBackup, type BackupFile, type ImportSummary } from '@/src/data/backup';
  import type { GlobalState } from '@/src/data/global';
  import type { TFunction } from '@/src/i18n';
  import { sendMessage } from '@/src/messaging';

  let { t, globalState }: { t: TFunction; globalState: GlobalState } = $props();

  let pending = $state<{ backup: BackupFile; summary: ImportSummary[] } | null>(null);
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);
  let busy = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  async function exportData(scope: 'active' | 'all') {
    message = null;
    const backup = await sendMessage({ type: 'exportData', scope });
    if (!backup) {
      message = { kind: 'error', text: t('data.nothingToExport') };
      return;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName(new Date());
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function chooseFile(event: Event) {
    message = null;
    pending = null;
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      message = { kind: 'error', text: t(`data.error.${parsed.error}`) };
      return;
    }
    pending = { backup: parsed.backup, summary: summarizeBackup(parsed.backup) };
  }

  async function confirmImport() {
    if (!pending) return;
    busy = true;
    const results = await sendMessage({ type: 'importData', backup: pending.backup });
    busy = false;
    pending = null;
    const total = (results ?? []).reduce((acc, r) => ({ favorites: acc.favorites + r.favorites, orders: acc.orders + r.orders }), {
      favorites: 0,
      orders: 0,
    });
    message = { kind: 'ok', text: t('data.importDone', total) };
  }
</script>

<section>
  <div class="row">
    <button onclick={() => exportData('active')} disabled={!globalState.activeAccountId}>{t('data.exportActive')}</button>
    <button onclick={() => exportData('all')} disabled={Object.keys(globalState.accounts).length === 0}>{t('data.exportAll')}</button>
  </div>
  <div class="row">
    <button onclick={() => fileInput?.click()}>{t('data.import')}</button>
    <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={chooseFile} />
  </div>

  {#if pending}
    <div class="preview">
      <p>{t('data.importPreview')}</p>
      <ul>
        {#each pending.summary as row (row.customerId)}
          <li>
            {t('data.importRow', { label: globalState.accounts[row.customerId]?.label ?? row.label, favorites: row.favorites, orders: row.orders })}
            {#if row.customerId !== globalState.activeAccountId}<span class="warn">{t('data.otherAccount')}</span>{/if}
          </li>
        {/each}
      </ul>
      <div class="row">
        <button onclick={confirmImport} disabled={busy}>{t('data.importConfirm')}</button>
        <button onclick={() => (pending = null)} disabled={busy}>{t('data.cancel')}</button>
      </div>
    </div>
  {/if}

  {#if message}
    <p class={message.kind}>{message.text}</p>
  {/if}
</section>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 8px;
  }
  .preview {
    border: 1px solid var(--hs-border);
    border-radius: 6px;
    padding: 8px 12px;
    margin: 8px 0;
  }
  .preview ul {
    margin: 4px 0 8px;
    padding-left: 20px;
  }
  .warn {
    color: #bf8700;
    margin-left: 4px;
  }
  .ok {
    color: #1a7f37;
  }
  .error {
    color: #d1242f;
  }
</style>
