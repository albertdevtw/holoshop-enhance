// 商品列表自動載入更多（在 Content Script 中執行；05-features F10、D-016）
import { countProducts, findLoadMoreButton, loadMoreIcon } from '@/src/site-adapter/collection-page';

const LOG = '[holoshop]';
/** 按鈕距離畫面底部約半個畫面高時觸發 */
const ROOT_MARGIN = '0px 0px 50% 0px';
const POLL_MS = 300;
const TIMEOUT_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 等待商品數超過 before；逾時回傳 false */
export async function waitForMore(
  count: () => number,
  before: number,
  { pollMs = POLL_MS, timeoutMs = TIMEOUT_MS }: { pollMs?: number; timeoutMs?: number } = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    if (count() > before) return true;
  }
  return false;
}

function isShown(el: HTMLElement): boolean {
  return el.isConnected && getComputedStyle(el).display !== 'none' && !(el as HTMLButtonElement).disabled;
}

/** 開始自動載入；回傳停止函式 */
export function startAutoLoad(doc: Document = document): () => void {
  const button = findLoadMoreButton(doc);
  if (!button) return () => undefined;

  let stopped = false;
  let loading = false;
  let inRange = false;

  const spin = (): Animation | undefined =>
    loadMoreIcon(button)?.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
      duration: 1000,
      iterations: Infinity,
    });

  const stop = () => {
    stopped = true;
    observer.disconnect();
  };

  const loadNext = async () => {
    // 上一批載入完成前不重複觸發
    while (!stopped && !loading && inRange && isShown(button)) {
      loading = true;
      const before = countProducts(doc);
      const animation = spin();
      button.click();
      const grew = await waitForMore(() => countProducts(doc), before);
      animation?.cancel();
      loading = false;
      if (!grew) {
        // 沒有新商品：視為已到底或失敗，停止自動載入，按鈕留給使用者手動按
        console.info(LOG, 'auto load stopped: no more products');
        stop();
        return;
      }
      // 版面更新後若按鈕仍在範圍內（例如畫面很高），繼續下一批
      await sleep(POLL_MS);
    }
    if (!stopped && !isShown(button)) stop();
  };

  const observer = new IntersectionObserver(
    (entries) => {
      inRange = entries.some((e) => e.isIntersecting);
      if (inRange) void loadNext();
    },
    { rootMargin: ROOT_MARGIN },
  );
  observer.observe(button);
  return stop;
}
