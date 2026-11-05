import { defineConfig } from 'wxt';

// 擴充功能設定；權限清單須與 DEVELOPMENT.md §4 一致
export default defineConfig({
  srcDir: '.',
  // 輸出到非隱藏目錄，方便在「載入未封裝項目」對話框中選取
  outDir: 'output',
  // 建置資料夾名稱：output/holoshop-enhance（開發模式為 holoshop-enhance-dev）
  outDirTemplate: 'holoshop-enhance{{modeSuffix}}',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'ja',
    permissions: ['storage', 'unlimitedStorage', 'alarms', 'sidePanel'],
    host_permissions: ['https://shop.hololivepro.com/*'],
    action: {
      default_title: '__MSG_extName__',
    },
  },
});
