// 匯率換算（05-features F13；D-021）：以「1 單位該幣別 = N JPY」表示，只需粗估
export const RATE_BASE = 'JPY';

/** 內建的粗略預設匯率（1 單位 = N JPY） */
export const DEFAULT_RATES: Readonly<Record<string, number>> = {
  JPY: 1,
  USD: 150,
  EUR: 165,
  GBP: 195,
  TWD: 4.8,
  HKD: 19,
  CNY: 21,
  KRW: 0.11,
  SGD: 115,
  AUD: 100,
  CAD: 110,
  NZD: 90,
  THB: 4.4,
  MYR: 34,
  PHP: 2.6,
  IDR: 0.0095,
};

/** 某幣別對 JPY 的匯率：自訂值優先，其次內建值；都沒有時為 null */
export function rateToJpy(currency: string, custom: Record<string, number>): number | null {
  if (currency === RATE_BASE) return 1;
  const value = custom[currency] ?? DEFAULT_RATES[currency];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** 換算金額；任一方沒有匯率時為 null */
export function convert(amount: number, from: string, to: string, custom: Record<string, number>): number | null {
  if (from === to) return amount;
  const a = rateToJpy(from, custom);
  const b = rateToJpy(to, custom);
  return a === null || b === null ? null : (amount * a) / b;
}

/** 幣別的小數位數（例如 JPY 0、TWD 2）；未知幣別為 2 */
export function fractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** 四捨五入到該幣別的小數位數 */
export function roundTo(amount: number, currency: string): number {
  const factor = 10 ** fractionDigits(currency);
  return Math.round(amount * factor) / factor;
}

/**
 * 「1 單位 currency = value 合計幣別」換算回 JPY 基準儲存的值；
 * 合計幣別沒有匯率時無法換算，回傳 null
 */
export function toJpyRate(value: number, base: string, custom: Record<string, number>): number | null {
  const baseRate = rateToJpy(base, custom);
  return baseRate === null ? null : value * baseRate;
}
