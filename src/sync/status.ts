// 同步狀態的顯示計算（徽章、滑鼠提示、Popup／Side Panel 共用；05-features F9）
import type { TFunction } from '@/src/i18n';
import type { SyncMeta } from './types';

export type SyncDisplayKind = 'running' | 'error' | 'done' | 'idle';

export interface SyncDisplay {
  kind: SyncDisplayKind;
  /** 完整同步時的進度百分比；其他情況為 null */
  percent: number | null;
  /** 徽章文字（空字串代表不顯示） */
  badge: string;
  color: string;
  message: string;
}

export const DONE_FLASH_MS = 3000;

/** 完成後 3 秒內顯示「✓」 */
export function isDoneFlash(meta: SyncMeta, now: number): boolean {
  if (meta.state !== 'idle' || !meta.finishedAt || meta.finishedAt !== meta.lastSuccessAt) return false;
  return now - new Date(meta.finishedAt).getTime() < DONE_FLASH_MS;
}

export function syncDisplay(meta: SyncMeta | null, t: TFunction, now: number, active: boolean): SyncDisplay {
  if (meta && meta.state === 'running' && active) {
    if (meta.mode === 'full' && meta.phase === 'pages' && meta.lastPage) {
      const percent = Math.min(99, Math.floor((meta.pagesDone / meta.lastPage) * 100));
      return {
        kind: 'running',
        percent,
        badge: `${percent}%`,
        color: '#2f6fde',
        message: t('sync.runningPages', { done: meta.pagesDone, total: meta.lastPage }),
      };
    }
    return { kind: 'running', percent: null, badge: '…', color: '#2f6fde', message: t('sync.running') };
  }
  if (meta && (meta.state === 'needs-login' || meta.state === 'error')) {
    return {
      kind: 'error',
      percent: null,
      badge: '!',
      color: '#d1242f',
      message: meta.state === 'needs-login' ? t('sync.needsLogin') : t('sync.error'),
    };
  }
  if (meta && isDoneFlash(meta, now)) {
    return {
      kind: 'done',
      percent: null,
      badge: '✓',
      color: '#1a7f37',
      message: t('sync.done', { count: meta.newOrderCount }),
    };
  }
  return { kind: 'idle', percent: null, badge: '', color: '#e5487a', message: '' };
}
