/**
 * 金额展示格式化
 *
 * 收敛前全站有 6 种互不兼容的金额写法，同一个 ¥575.7 会被渲染成
 * `¥575.7`（无固定小数）/ `CNY 575.7`（币种码前置、无固定小数）/
 * `CNY 575.70`（币种码前置）/ `575.70 CNY`（币种后置）/ `575.7`（无单位）五种形态，
 * 且同一页面的表头与表体可能各用一种。本模块给出唯一形态。
 */

import { CURRENCY_META, DEFAULT_CURRENCY } from '@/constants/locale'

/** 未知币种的兜底小数位（ISO 4217 中多数币种为 2 位） */
const FALLBACK_MINOR_UNITS = 2

/**
 * 格式化金额：币种符号前置 + 千分位 + 该币种法定小数位（`¥575.70` / `JP¥1,200`）
 *
 * @param value    金额；接受 number 或数字字符串（后端部分金额字段是字符串）
 * @param currency ISO 4217 币种码；缺省或空串按人民币
 * @returns 空值/非有限数返回 `-`；未知币种码以「币种码 + 空格」代替符号
 *
 * 🔴 只用于**金额**。费率、百分比、数量列不适用——它们的小数位语义与货币最小单位无关，
 * 套用本函数会把 `3.5` 渲染成 `¥3.50`。费率另有各自的展示约定，见各页 `rateText`。
 */
export function formatAmount(
  value: number | string | null | undefined,
  currency?: string,
): string {
  if (value === null || value === undefined || value === '') return '-'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '-'

  const code = currency || DEFAULT_CURRENCY
  const meta: { symbol: string; minorUnits: number } | undefined = CURRENCY_META[code]
  const digits = meta?.minorUnits ?? FALLBACK_MINOR_UNITS

  // 负号须落在币种符号之外（`-¥1,234.56`，而非 `¥-1,234.56`），故对绝对值取千分位
  const grouped = Math.abs(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

  return `${amount < 0 ? '-' : ''}${meta ? meta.symbol : `${code} `}${grouped}`
}
