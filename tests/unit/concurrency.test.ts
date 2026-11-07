import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getGlobalState, updateGlobalState } from '@/src/data/global';
import { acquireLock, getLock, releaseLock } from '@/src/sync/lock';

describe('同步鎖（code-review CR-002）', () => {
  beforeEach(() => fakeBrowser.reset());

  it('兩個分頁同時領取時只有一個成功', async () => {
    const results = await Promise.all([acquireLock(1, 'c1'), acquireLock(2, 'c1')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = results[0] ? 1 : 2;
    expect((await getLock())?.tabId).toBe(winner);
  });

  it('釋放與另一分頁領取交錯時，鎖狀態一致', async () => {
    await acquireLock(1, 'c1');
    const [, acquired] = await Promise.all([releaseLock(1), acquireLock(2, 'c1')]);
    expect(acquired).toBe(true);
    expect((await getLock())?.tabId).toBe(2);
  });

  it('逾時後可由其他分頁接手', async () => {
    await acquireLock(1, 'c1', 0);
    expect(await acquireLock(2, 'c1', 30_000)).toBe(false);
    expect(await acquireLock(2, 'c1', 61_000)).toBe(true);
  });
});

describe('全域狀態更新（code-review CR-005）', () => {
  beforeEach(() => fakeBrowser.reset());

  it('並行更新不同欄位時都會保留', async () => {
    await Promise.all([
      updateGlobalState((s) => {
        s.settings.localeMode = 'en';
      }),
      updateGlobalState((s) => {
        s.settings.reminder.daysBefore = 3;
      }),
    ]);
    const state = await getGlobalState();
    expect(state.settings.localeMode).toBe('en');
    expect(state.settings.reminder.daysBefore).toBe(3);
  });

  it('一次更新失敗不會阻塞後續更新', async () => {
    await expect(
      updateGlobalState(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await updateGlobalState((s) => {
      s.settings.reminder.daysBefore = 5;
    });
    expect((await getGlobalState()).settings.reminder.daysBefore).toBe(5);
  });
});
