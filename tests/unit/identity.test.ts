import { describe, expect, it } from 'vitest';
import { identityFromDocument, parseStScript } from '@/src/site-adapter/identity';

function docWith(script?: string): Document {
  const body = script === undefined ? '' : `<script id="__st">${script}</script>`;
  return new DOMParser().parseFromString(`<html><head>${body}</head><body></body></html>`, 'text/html');
}

describe('parseStScript', () => {
  it('解析 var __st={...};', () => {
    expect(parseStScript('var __st={"a":1,"cid":123,"p":"product"};')).toEqual({ a: 1, cid: 123, p: 'product' });
  });

  it('格式不符回傳 null', () => {
    expect(parseStScript('var x = 1;')).toBeNull();
    expect(parseStScript('var __st={broken;')).toBeNull();
  });
});

describe('identityFromDocument', () => {
  it('有 cid 時為 confirmed', () => {
    expect(identityFromDocument(docWith('var __st={"a":1,"cid":1234567890,"p":"home"};'))).toEqual({
      status: 'confirmed',
      customerId: '1234567890',
    });
  });

  it('沒有 cid 時為 logged-out', () => {
    expect(identityFromDocument(docWith('var __st={"a":1,"p":"home"};'))).toEqual({ status: 'logged-out' });
  });

  it('找不到 script#__st 時為 unknown', () => {
    expect(identityFromDocument(docWith()).status).toBe('unknown');
  });

  it('cid 不是數字時為 unknown', () => {
    expect(identityFromDocument(docWith('var __st={"cid":"abc"};')).status).toBe('unknown');
  });
});
