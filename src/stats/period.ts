// 期間別統計（05-features F13；純函式）：依注文日的年或月，按幣別加總訂單合計
import type { Order } from '@/src/data/db';
import { convert, roundTo } from './currency';

export type Granularity = 'year' | 'month';

export interface PeriodRow {
  /** 'YYYY' 或 'YYYY-MM' */
  key: string;
  /** key = 幣別 */
  amounts: Record<string, number>;
  orderCount: number;
  /** 換算成合計幣別的總額；沒有可換算的金額時為 null */
  converted: number | null;
  /** 有幣別沒有匯率而未計入 converted */
  partial: boolean;
}

export interface PeriodSummary {
  rows: PeriodRow[];
  /** 顯示中的列出現過的幣別，依金額（換算後）由大到小 */
  currencies: string[];
  total: PeriodRow;
  /** 排除取消後，沒有金額的訂單數 */
  unknownAmount: number;
  /** 有訂單的年份（新到舊），供下拉選單使用 */
  years: string[];
}

/** 統計對象：排除取消的訂單 */
function counted(orders: Order[]): Order[] {
  return orders.filter((o) => o.status !== 'cancelled' && /^\d{4}-\d{2}/.test(o.date));
}

function emptyRow(key: string): PeriodRow {
  return { key, amounts: {}, orderCount: 0, converted: null, partial: false };
}

function finalize(row: PeriodRow, base: string, rates: Record<string, number>): PeriodRow {
  let converted: number | null = null;
  let partial = false;
  for (const [currency, amount] of Object.entries(row.amounts)) {
    const value = convert(amount, currency, base, rates);
    if (value === null) partial = true;
    else converted = (converted ?? 0) + value;
  }
  return { ...row, converted: converted === null ? null : roundTo(converted, base), partial };
}

export function summarizeByPeriod(
  orders: Order[],
  granularity: Granularity,
  year: string | null,
  base: string,
  rates: Record<string, number>,
): PeriodSummary {
  const all = counted(orders);
  const years = [...new Set(all.map((o) => o.date.slice(0, 4)))].sort().reverse();
  const inRange = granularity === 'month' && year ? all.filter((o) => o.date.startsWith(year)) : all;

  const rowMap = new Map<string, PeriodRow>();
  const total = emptyRow('total');
  let unknownAmount = 0;
  for (const order of inRange) {
    const key = granularity === 'year' ? order.date.slice(0, 4) : order.date.slice(0, 7);
    const row = rowMap.get(key) ?? emptyRow(key);
    rowMap.set(key, row);
    row.orderCount += 1;
    total.orderCount += 1;
    if (!order.total) {
      unknownAmount += 1;
      continue;
    }
    const { amount, currency } = order.total;
    row.amounts[currency] = (row.amounts[currency] ?? 0) + amount;
    total.amounts[currency] = (total.amounts[currency] ?? 0) + amount;
  }

  const rows = [...rowMap.values()].sort((a, b) => b.key.localeCompare(a.key)).map((r) => finalize(r, base, rates));
  const finalTotal = finalize(total, base, rates);
  // 換算後金額由大到小；無法換算的幣別排在後面
  const weight = (currency: string) => convert(finalTotal.amounts[currency] ?? 0, currency, base, rates) ?? -1;
  const currencies = Object.keys(finalTotal.amounts).sort((a, b) => weight(b) - weight(a) || a.localeCompare(b));

  return { rows, currencies, total: finalTotal, unknownAmount, years };
}

/** 訂單中出現過的幣別（排除取消） */
export function currenciesInOrders(orders: Order[]): string[] {
  return [...new Set(counted(orders).flatMap((o) => (o.total ? [o.total.currency] : [])))].sort();
}
