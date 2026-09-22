/**
 * 日期时间格式化工具
 */

/**
 * 格式化日期时间为 YYYY-MM-DD HH:mm:ss
 * @param date 日期字符串或Date对象
 * @returns 格式化后的日期时间字符串，如 "2026-08-10 15:59:21"
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-'

  const d = typeof date === 'string' ? new Date(date) : date

  if (isNaN(d.getTime())) return '-'

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  const second = String(d.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

/** 按指定 IANA 时区格式化为 YYYY-MM-DD HH:mm:ss。 */
export function formatDateTimeInZone(
  date: string | Date | null | undefined,
  timeZone: string,
): string {
  if (!date) return '-'
  const parsed = typeof date === 'string' ? new Date(date) : date
  if (isNaN(parsed.getTime())) return '-'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(parsed)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @param date 日期字符串或Date对象
 * @returns 格式化后的日期字符串，如 "2026-08-10"
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'

  const d = typeof date === 'string' ? new Date(date) : date

  if (isNaN(d.getTime())) return '-'

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * 格式化时间为 HH:mm:ss
 * @param date 日期字符串或Date对象
 * @returns 格式化后的时间字符串，如 "15:59:21"
 */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '-'

  const d = typeof date === 'string' ? new Date(date) : date

  if (isNaN(d.getTime())) return '-'

  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  const second = String(d.getSeconds()).padStart(2, '0')

  return `${hour}:${minute}:${second}`
}

/**
 * 当前时间的 YYYY-MM-DDTHH:mm:ss 文本，用作日期选择器的默认值。
 *
 * <p>不能用 `new Date().toISOString()`：它按 UTC 输出，东八区会把「此刻」写成 8 小时前的字符串，
 * 用户一打开表单就看到一个明显不对的默认值，反而怀疑是系统算错了。</p>
 *
 * @returns 本地时区的当前时间，如 "2026-09-21T10:29:00"
 */
export function nowDateTimeValue(): string {
  const d = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}
