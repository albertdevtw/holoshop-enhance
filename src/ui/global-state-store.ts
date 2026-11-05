// UI 用的全域狀態 store（唯讀；寫入一律透過 Service Worker）
import { readable, type Readable } from 'svelte/store';
import { getGlobalState, watchGlobalState, type GlobalState } from '@/src/data/global';

export function createGlobalStateStore(): Readable<GlobalState | null> {
  return readable<GlobalState | null>(null, (set) => {
    void getGlobalState().then(set);
    return watchGlobalState(set);
  });
}
