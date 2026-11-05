// JST（UTC+9）日期工具（D-008）

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

/** 以 JST 的年月日時分建立含 +09:00 的 ISO 8601 字串；數值不合法時回傳 null */
export function jstIso(year: number, month: number, day: number, hour: number, minute: number): string | null {
  const utc = Date.UTC(year, month - 1, day, hour, minute) - JST_OFFSET_MS;
  const check = new Date(utc + JST_OFFSET_MS);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+09:00`;
}

/** 以 JST 顯示：YYYY/MM/DD HH:mm (JST) */
export function formatJst(iso: string): string {
  const d = new Date(new Date(iso).getTime() + JST_OFFSET_MS);
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} (JST)`;
}

/** 距離截止的剩餘時間（毫秒）；已過期為負值 */
export function msUntil(iso: string, now: Date = new Date()): number {
  return new Date(iso).getTime() - now.getTime();
}

/** 剩餘天數（無條件進位）；已過期回傳 0 以下 */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.ceil(msUntil(iso, now) / DAY_MS);
}
