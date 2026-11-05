// 所有商店頁面：回報語系與登入身分、執行訂單同步；商品頁注入最愛按鈕與已購標示；/account 被動擷取訂單
import { mount, unmount } from 'svelte';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ProductSnapshot } from '@/src/data/favorites';
import type { PurchaseSummary } from '@/src/data/purchases';
import type { TFunction } from '@/src/i18n';
import { isBroadcastEvent, sendMessage } from '@/src/messaging';
import { identityFromDocument } from '@/src/site-adapter/identity';
import { parseOrdersPage } from '@/src/site-adapter/orders-page';
import {
  findVariantOptions,
  parseProductId,
  parseProductImage,
  parseProductTitle,
  parseSalePeriod,
  TITLE_SELECTOR,
} from '@/src/site-adapter/product-page';
import { parsePageUrl, type PageInfo } from '@/src/site-adapter/url';
import { runSync } from '@/src/sync/runner';
import { startAutoLoad } from '@/src/collection/auto-load';
import { getGlobalState, watchGlobalState, type GlobalState } from '@/src/data/global';
import OptionBadge from './OptionBadge.svelte';
import ProductWidget from './ProductWidget.svelte';
import DownloadsSearch from './DownloadsSearch.svelte';
import { findFilesList } from '@/src/site-adapter/downloads-page';

const LOG = '[holoshop]';

export default defineContentScript({
  matches: ['https://shop.hololivepro.com/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const page = parsePageUrl(location.href);
    if (!page) return;

    const identity = identityFromDocument(document);
    // 先回報身分，讓 Service Worker 確定目前帳號後再進行寫入
    const result = await sendMessage({
      type: 'pageContext',
      identity,
      locale: page.locale,
      pageType: page.type,
    });

    console.info(LOG, 'page context', {
      pageType: page.type,
      handle: page.handle,
      locale: page.locale,
      identity: identity.status,
      activeAccountId: result?.activeAccountId ?? null,
    });

    const customerId = identity.status === 'confirmed' ? identity.customerId : null;

    if (page.type === 'product') {
      await mountProductWidget(ctx, page, customerId);
    }
    if (page.type === 'downloads') {
      // 數位內容列表：全部載入並搜尋（F11）
      const list = findFilesList(document);
      if (list) {
        const ui = await createShadowRootUi(ctx, {
          name: 'holoshop-downloads',
          position: 'inline',
          anchor: list,
          append: 'before',
          onMount: (container) => mount(DownloadsSearch, { target: container, props: { list, locale: page.locale } }),
          onRemove: (app) => {
            if (app) void unmount(app);
          },
        });
        ui.mount();
      }
    }
    if (page.type === 'collection') {
      // 商品列表自動載入更多（F10）；不需登入，依設定即時開關
      let stopAutoLoad: (() => void) | null = null;
      const apply = (state: GlobalState) => {
        if (state.settings.collection.autoLoadMore && !stopAutoLoad) stopAutoLoad = startAutoLoad();
        else if (!state.settings.collection.autoLoadMore && stopAutoLoad) {
          stopAutoLoad();
          stopAutoLoad = null;
        }
      };
      apply(await getGlobalState());
      const unwatch = watchGlobalState(apply);
      ctx.onInvalidated(() => {
        unwatch();
        stopAutoLoad?.();
      });
    }
    if (!customerId) return;

    if (page.type === 'account') {
      // 被動擷取：使用者正在看的訂單清單（D-001）
      const { orders } = parseOrdersPage(document);
      if (orders.length) await sendMessage({ type: 'ingestOrders', customerId, orders });
    }

    // 背景同步：由 Service Worker 判斷是否需要、是否由本分頁執行（D-010）
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (isBroadcastEvent(message) && message.type === 'syncAvailable') void runSync(customerId);
    });
    void runSync(customerId);
  },
});

async function mountProductWidget(ctx: ContentScriptContext, page: PageInfo, customerId: string | null) {
  const productId = parseProductId(document);
  if (!productId || !page.handle) {
    console.warn(LOG, 'product id not found');
    return;
  }
  const product: ProductSnapshot = {
    productId,
    handle: page.handle,
    locale: page.locale,
    title: parseProductTitle(document),
    imageUrl: parseProductImage(document),
    salePeriod: parseSalePeriod(document),
  };

  const optionUis: ShadowRootContentScriptUi<ReturnType<typeof mount>>[] = [];
  const renderOptionBadges = async (summary: PurchaseSummary | null, t: TFunction) => {
    optionUis.splice(0).forEach((ui) => ui.remove());
    if (!summary) return;
    for (const option of findVariantOptions(document)) {
      const count = summary.byVariant[option.variantId];
      if (!count) continue;
      const ui = await createShadowRootUi(ctx, {
        name: 'holoshop-option',
        position: 'inline',
        anchor: option.titleElement,
        append: 'after',
        onMount: (container) =>
          mount(OptionBadge, { target: container, props: { label: t('product.purchasedVariant', { count }) } }),
        onRemove: (app) => {
          if (app) void unmount(app);
        },
      });
      ui.mount();
      optionUis.push(ui);
    }
  };

  const ui = await createShadowRootUi(ctx, {
    name: 'holoshop-product',
    position: 'inline',
    anchor: TITLE_SELECTOR,
    append: 'after',
    onMount: (container) =>
      mount(ProductWidget, {
        target: container,
        props: {
          customerId,
          product,
          hasOptionDom: findVariantOptions(document).length > 0,
          onPurchases: (s, t) => void renderOptionBadges(s, t),
        },
      }),
    onRemove: (app) => {
      if (app) void unmount(app);
    },
  });
  ui.autoMount();
}
