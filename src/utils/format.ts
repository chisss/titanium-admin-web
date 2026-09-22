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

/** 费率/比例百分数的最大小数位（收敛前各页取值 2 / 4 不一，同一 0.015 会渲染成 1.5% 与 1.50%） */
const RATE_MAX_DIGITS = 4

/**
 * 格式化费率/比例：把 **0–1 小数** 渲染为百分数（`0.3` → `30%`，`0.015` → `1.5%`）。
 *
 * <p>🔴 **本函数只接受 0–1 小数**，这是全仓的规范编码（后端 {@code extraPremiumRatio} 契约注释即
 * 「如 0.30 表示加费30%」，契约校验 {@code LossAssessment.isOutOfDecimalScale} 同样以 1 为界）。
 * 传 0–100 的百分数进来会得到放大 100 倍的结果，反之亦然——**编码口径不一致正是历史上
 * 「加费比例低估 100 倍」缺陷的根因**，故不提供自动猜测量纲的入口。</p>
 *
 * <p>本函数取代了此前散落在 channel / billing / actuarial / product 四处的同名 `rateText`
 * 副本（四份字节级相同、仅空值文案不同），现由 `emptyText` 参数统一承接空值差异。</p>
 *
 * @param value     0–1 小数比例；接受 number 或数字字符串（部分后端字段按字符串下发）
 * @param emptyText 空值展示文案；默认 `-`。佣金等需脱敏的场景传 `'***'`
 * @returns 百分数字符串；小数位最多 4 位并去除尾随零
 */
export function formatRate(
  value: number | string | null | undefined,
  emptyText = '-',
): string {
  if (value === null || value === undefined || value === '') return emptyText
  const rate = Number(value)
  if (!Number.isFinite(rate)) return emptyText

  // 尾随零必须剥掉：0.05 应显示 5% 而非 5.0000%
  const percent = (rate * 100)
    .toFixed(RATE_MAX_DIGITS)
    .replace(/0+$/, '')
    .replace(/\.$/, '')

  return `${percent}%`
}
