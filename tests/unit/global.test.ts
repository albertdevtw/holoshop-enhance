import { describe, expect, it } from 'vitest';
import { defaultGlobalState, GLOBAL_SCHEMA_VERSION, migrateGlobalState } from '@/src/data/global';

describe('migrateGlobalState', () => {
  it('沒有資料時回傳預設值', () => {
    expect(migrateGlobalState(undefined)).toEqual(defaultGlobalState());
  });

  it('補齊缺少的巢狀設定並保留既有值', () => {
    const state = migrateGlobalState({ settings: { localeMode: 'en', reminder: { daysBefore: 3 } } });
    expect(state.settings.localeMode).toBe('en');
    expect(state.settings.reminder).toEqual({ daysBefore: 3 });
    expect(state.settings.sync.showOnIcon).toBe(true);
    expect(state.schemaVersion).toBe(GLOBAL_SCHEMA_VERSION);
  });

  it('移除舊版的提醒欄位', () => {
    const state = migrateGlobalState({ settings: { reminder: { enabled: false, daysBefore: 5, timeOfDay: '09:00' } } });
    expect(state.settings.reminder).toEqual({ daysBefore: 5 });
  });

  it('可重複執行', () => {
    const once = migrateGlobalState({ activeAccountId: '1' });
    expect(migrateGlobalState(once)).toEqual(once);
  });
});
