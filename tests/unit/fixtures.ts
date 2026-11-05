// 測試用：讀取 tests/fixtures/ 下的 HTML 並解析成 Document
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadFixture(name: string): Document {
  const html = readFileSync(resolve(process.cwd(), 'tests/fixtures', name), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}
