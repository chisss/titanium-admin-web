// 费率单位语义与保费试算
//
// 🔴 单一真源是两个后端文件，本模块**只做等价翻译，不引入任何新口径**：
//   · `titanium-product-common/.../enums/RateUnit.java` —— 三种单位的业务含义（枚举 desc）
//   · `titanium-product-domain/.../service/PremiumCompositionService.java` —— 公式与钳制顺序
// 契约测试 `tests/pricing-preview-contracts.test.mjs` 逐条比对本模块与上述后端源码，
// 任一侧漂移即失败。金融口径不得由前端各行其是。
//
// 本模块刻意零依赖（不 import `@/`，也不 import 格式化工具）：一是保持纯函数可测，
// 二是让 node 侧测试能直接 `import('../src/constants/pricing.ts')`。

/** 费率单位码。值必须与后端 `RateUnit.code` 严格一致 */
export type RateUnitCode = 'SUM_INSURED_RATIO' | 'PER_THOUSAND_SUM_INSURED' | 'FIXED_AMOUNT'

/** 费率单位语义 */
export interface RateUnitMeta {
  /** 单位名（与后端 `RateUnit.name`、RATE_UNIT 字典 label 一致） */
  name: string
  /** 费率的计量单位，用于列标题「费率（…）」 */
  rateUnit: string
  /** 保费的等义公式写法（后端口径的中文化） */
  formula: string
  /** 保费是否随保额变化；false 时试算基准保额不影响结果 */
  scalesWithSumInsured: boolean
}

/**
 * 三种费率单位的语义表。
 *
 * <p>与后端 `RateUnit` 枚举逐项对应：`SUM_INSURED_RATIO`「保额直接乘以费率」、
 * `PER_THOUSAND_SUM_INSURED`「每千元保额对应的费率」、`FIXED_AMOUNT`「费率值直接作为固定保费金额」。</p>
 */
export const RATE_UNIT_META: Record<RateUnitCode, RateUnitMeta> = {
  SUM_INSURED_RATIO: {
    name: '保额比例',
    rateUnit: '占保额比例',
    formula: '保费 = 保额 × 费率',
    scalesWithSumInsured: true,
  },
  PER_THOUSAND_SUM_INSURED: {
    name: '每千元保额',
    rateUnit: '元 / 千元保额',
    formula: '保费 = 保额 ÷ 1000 × 费率',
    scalesWithSumInsured: true,
  },
  FIXED_AMOUNT: {
    name: '固定金额',
    rateUnit: '元 / 单',
    formula: '保费 = 费率（与保额无关）',
    scalesWithSumInsured: false,
  },
}

/** 取费率单位元数据；未知单位返回 null（**不猜**，宁可不显示也不按近似口径误导） */
export function rateUnitMeta(rateUnit: string | null | undefined): RateUnitMeta | null {
  if (!rateUnit) return null
  return RATE_UNIT_META[rateUnit as RateUnitCode] ?? null
}

/** 折算分母：后端 `PremiumCompositionService.THOUSAND` */
const THOUSAND = 1000

/**
 * 四舍五入到指定小数位，与 `java.math.RoundingMode.HALF_UP` 同语义。
 *
 * <p>🔴 不能用 `Math.round(value * 10 ** n) / 10 ** n`：二进制乘法误差会把临界值推到错误一侧
 * （`1.005 * 100 === 100.49999999999999` ⇒ 舍成 1.00，而 HALF_UP 应为 1.01）。改以**十进制移位**
 * 实现：先取定点串再拼指数，全程不经浮点乘法。`String(v)` 在极小量级（`1e-8`，费率精度 8 位时
 * 真实存在）会给科学计数法，直接拼接会得到 `"1e-8e2"`（NaN），故先 `toFixed` 转定点。</p>
 *
 * <p>仅适用于**非负数**：`Math.round` 对负数取整方向与 HALF_UP 相反。本模块的入参
 * （保额、费率、保额下限/上限）由后端与表单双重约束为 ≥ 0，负值不可达。</p>
 */
export function roundHalfUp(value: number, scale: number): number {
  if (!Number.isFinite(value)) return value
  const text = String(value)
  const decimal = /[eE]/.test(text) ? value.toFixed(24) : text
  const shifted = Number(`${decimal}e${scale}`)
  if (!Number.isFinite(shifted)) return value
  return Number(`${Math.round(shifted)}e${-scale}`)
}

/** 参与试算的费率行字段 */
export interface PreviewRow {
  rate?: number | null
  minimumPremium?: number | null
  maximumPremium?: number | null
}

/** 试算结果 */
export interface PremiumPreview {
  /** 按公式算出的保费（钳制前、舍入前），与后端 `premium` 局部变量同值 */
  computed: number
  /** 命中保费上下限后被收窄到的值；未命中为 undefined */
  clampedTo?: number
  /** 命中的界限类型，用于提示「本次是按上限/下限收窄的」 */
  bound?: 'minimum' | 'maximum'
  /** 最终保费：钳制后按 2 位小数 HALF_UP —— 与后端 `setScale(2, HALF_UP)` 同值 */
  premium: number
}

/**
 * 数值化，**拒绝** null / undefined / 空串。
 *
 * <p>🔴 不能直接用 `Number()`：`Number(null) === 0`、`Number('') === 0`，会把「没填」
 * 静默当成「填了 0」——未填的费率算出保费 0，看起来像一次成功试算，实则是把空值当输入。
 * （同类缺陷在保单操作页也出现过：`Number('')` 让空金额通过校验直达后端。）</p>
 */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 按后端保费合成逻辑试算一条费率行的保费。
 *
 * <p>逐行对应 `PremiumCompositionService.calculate()`：
 * ① 保额须 > 0（后端在 switch **之前**校验，故三种单位都受此约束）；
 * ② 按单位分支算 `computed`，其中每千元保额口径的中间值先按 8 位 HALF_UP 舍入；
 * ③ 先比最低保费、再比最高保费（顺序照抄：两者配反时以后者为准）；
 * ④ 末了统一 `setScale(2, HALF_UP)`。</p>
 *
 * <p>返回 null 表示**试算前提不成立**（费率缺失/为负、保额 ≤ 0、单位未知）。
 * 不返回 0 冒充结果——0 与「算不出来」在界面上必须能区分。</p>
 */
export function previewPremium(
  row: PreviewRow,
  rateUnit: string | null | undefined,
  sumInsured: number | null | undefined,
): PremiumPreview | null {
  const rate = toNumber(row?.rate)
  if (rate === null || rate < 0) return null

  const base = toNumber(sumInsured)
  if (base === null || base <= 0) return null

  const meta = rateUnitMeta(rateUnit)
  if (!meta) return null

  let computed: number
  switch (rateUnit as RateUnitCode) {
    case 'SUM_INSURED_RATIO':
      computed = base * rate
      break
    case 'PER_THOUSAND_SUM_INSURED':
      // 后端在此处 `.divide(THOUSAND, 8, HALF_UP)`：中间值 8 位舍入是公式的一部分，不是显示处理
      computed = roundHalfUp((base * rate) / THOUSAND, 8)
      break
    case 'FIXED_AMOUNT':
      computed = rate
      break
    default:
      return null
  }

  // 顺序不可调换：后端先 min 后 max，两者配反（min > max）时以 max 收尾
  let effective = computed
  let bound: PremiumPreview['bound']
  const min = toNumber(row?.minimumPremium)
  const max = toNumber(row?.maximumPremium)
  if (min !== null && effective < min) {
    effective = min
    bound = 'minimum'
  }
  if (max !== null && effective > max) {
    effective = max
    bound = 'maximum'
  }

  return {
    computed,
    ...(bound ? { clampedTo: effective, bound } : {}),
    premium: roundHalfUp(effective, 2),
  }
}
