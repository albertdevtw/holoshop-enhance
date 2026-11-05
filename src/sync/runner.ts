// 同步執行者（在商店分頁的 Content Script 中執行；D-010）
// 向 Service Worker 領取工作 → 以同源 fetch 取得頁面 → 解析 → 回報結果，直到沒有工作
import { sendMessage } from '@/src/messaging';
import { identityFromDocument } from '@/src/site-adapter/identity';
import { parseOrderDetail } from '@/src/site-adapter/order-detail';
import { parseOrdersPage } from '@/src/site-adapter/orders-page';
import { parseProductJson, productJsonPath } from '@/src/site-adapter/product-json';
import { REQUEST_INTERVAL_MS, type SyncResult, type SyncTask } from './types';

const LOG = '[holoshop]';
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running = false;

/** 嘗試領取並執行同步；同一分頁內不會重複執行 */
export async function runSync(customerId: string): Promise<void> {
  if (running) return;
  running = true;
  try {
    const claim = await sendMessage({ type: 'syncClaim', customerId });
    let task = claim?.ok ? claim.value.task : null;
    while (task) {
      const result = await executeTask(task, customerId);
      const report = await sendMessage({ type: 'syncReport', customerId, result });
      task = report?.ok ? report.value.task : null;
      if (task) await sleep(REQUEST_INTERVAL_MS);
    }
  } catch (error) {
    console.warn(LOG, 'sync stopped', error);
  } finally {
    running = false;
  }
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/** 失敗時指數退避重試（3 秒、6 秒） */
async function fetchWithRetry(path: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(REQUEST_INTERVAL_MS * 2 ** (attempt - 1));
    try {
      const res = await fetch(path, { credentials: 'include' });
      if (res.ok || res.status === 404) return res;
      lastError = new HttpError(res.status);
      if (res.status < 500 && res.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function fetchAccountDocument(path: string, customerId: string): Promise<Document | SyncResult> {
  const res = await fetchWithRetry(path);
  if (/\/account\/login/.test(new URL(res.url).pathname)) return { kind: 'error', reason: 'needs-login' };
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const identity = identityFromDocument(doc);
  if (identity.status !== 'confirmed') return { kind: 'error', reason: 'needs-login' };
  if (identity.customerId !== customerId) return { kind: 'error', reason: 'account-mismatch' };
  return doc;
}

async function executeTask(task: SyncTask, customerId: string): Promise<SyncResult> {
  try {
    switch (task.kind) {
      case 'page': {
        const doc = await fetchAccountDocument(`/account?page=${task.page}`, customerId);
        if (!(doc instanceof Document)) return doc;
        const { orders, lastPage } = parseOrdersPage(doc);
        return { kind: 'page', page: task.page, orders, lastPage };
      }
      case 'product': {
        const res = await fetchWithRetry(productJsonPath(task.handle));
        if (res.status === 404) return { kind: 'product', handle: task.handle, product: null };
        // 格式不符時視同無法換算（記為 null，7 天後重試），避免整個同步卡住
        const product = parseProductJson(await res.json().catch(() => null), task.handle, new Date().toISOString());
        return { kind: 'product', handle: task.handle, product };
      }
      case 'detail': {
        const doc = await fetchAccountDocument(task.path, customerId);
        if (!(doc instanceof Document)) return doc;
        return { kind: 'detail', orderNumber: task.orderNumber, items: parseOrderDetail(doc) };
      }
    }
  } catch (error) {
    console.warn(LOG, 'sync task failed', task.kind, error);
    return { kind: 'error', reason: 'network' };
  }
}
