/**
 * 版本差异对比引擎（A4：产品 / 费率 / 规则版本化，可对比差异、可回滚，满足监管审计）。
 *
 * <p>纯函数、零依赖、零副作用：输入两个版本的快照，输出结构化的差异条目。
 * 它<b>不认识任何业务字段</b>——「哪些字段算噪声」「哪些字段是版本轴」由调用方通过
 * {@link DiffOptions.ignore} 注入（见 {@link PRODUCT_VERSION_NOISE} / {@link RATE_TABLE_VERSION_NOISE}）。
 * 这样域知识留在页面里，引擎本身可被任意新版本化对象复用。</p>
 *
 * <h3>为什么不用 JSON.stringify 比较</h3>
 * <p>审计场景要回答的不是「两个版本一样吗」，而是「<b>具体哪几个字段从什么变成了什么</b>」。
 * 字符串比较只能给一个是/否，还会因键序不同产生假差异。故此处逐字段遍历。</p>
 *
 * <h3>数组为什么按「整值」比较，而不是按下标递归</h3>
 * <p>业务数组的顺序在部分场景<b>是有意义的</b>（保全步骤顺序、保障期间顺序），故引擎<b>保序</b>——
 * 重排会被如实记成一条差异；但记法上把数组当叶子值，只产出<b>一条</b>「整个列表从 A 变成 B」，
 * 而不是按下标展开成十几条 `list[3].name` 式的条目：后者会让一次重排淹没真正的字段变更，
 * 且下标在业务上不可读。<b>真正的行集合</b>（费率表行）另走 {@link diffRowsByKey}，
 * 按业务维度键匹配，行序不同不产生差异。</p>
 *
 * <h3>一侧整体缺失时按「块」报，不递归到叶子</h3>
 * <p>若新版本新增了 `surrenderValuePolicy` 整个配置块，差异记为该<b>块</b>的 ADDED（值为整个块），
 * 而不是把它拆成若干条叶子条目——审阅者要看到的是「多配了一整块」，且条目数与真实变更规模成比例。</p>
 */

/** 单条差异 */
export interface DiffEntry {
  /** 字段路径（点分，如 `pricingBasicRule.baseRate`；数组字段整值比较，不出现下标） */
  path: string
  /** 差异类型：一侧缺失为 ADDED/REMOVED，两侧都有但值不同为 CHANGED */
  kind: DiffKind
  /** 变更前的值（缺失时为 undefined） */
  before: unknown
  /** 变更后的值（缺失时为 undefined） */
  after: unknown
}

/** 差异类型 */
export type DiffKind = 'ADDED' | 'REMOVED' | 'CHANGED'

/** 差异对比选项 */
export interface DiffOptions {
  /**
   * 忽略的字段路径前缀（点分）。命中该前缀或其子路径的字段不参与对比。
   * <p>🔴 传空前请确认：审计视图里被忽略的字段就等于「查不到」，宁可多一行噪声也不要少一条证据。</p>
   */
  ignore?: readonly string[]
  /** 最大递归深度（默认 8，防御异常深的嵌套结构把页面卡死） */
  maxDepth?: number
}

/** 行集合差异（用于费率表这类「以维度键标识的行」） */
export interface RowDiff<T> {
  /** 新增行（仅出现在新版本） */
  added: T[]
  /** 删除行（仅出现在旧版本） */
  removed: T[]
  /** 变更行（两侧同一维度键，但字段有差异） */
  changed: Array<{ key: string; before: T; after: T; fields: DiffEntry[] }>
}

/**
 * 产品版本对比的噪声字段。
 *
 * <p>每个产品版本是<b>独立聚合</b>（修订生成新 productId），故身份类字段按定义就不同，
 * 它们不是「被改动的配置」，列进差异只会把真正的配置变更淹没：</p>
 * <ul>
 *   <li>`productId`/`originalProductId` —— 版本轴本身；</li>
 *   <li>`version`/`status` —— 版本号与生命周期状态，两版本本就不同；</li>
 *   <li>审计时间戳与操作人 —— 逐版本递增/逐版本不同，无对比意义（「谁建的」在版本表的创建人列已逐版本列出）；</li>
 *   <li>`effectiveTime`/`invalidTime` —— **本版本自己的**生命周期时刻，非用户配置；</li>
 *   <li>`contentHash` —— 任一字段变动都会连带变，属派生物，不是独立证据。</li>
 * </ul>
 *
 * <p>🔴 字段名以**下游真实载荷**为准：`ProductResponse` 用的是 `createdAt`/`updatedAt`/
 * `createdBy`/`updatedBy`（见 `ProductQueryResult`）。`createTime`/`updateTime` 等别名予以保留——
 * 本仓它域载荷仍有此写法，且**未命中的忽略项是无害的**（不会误伤任何真实字段），
 * 而漏掉一个真名则会让它逐版本冒充「配置变更」，是审计视图里最坏的一类噪声。</p>
 */
export const PRODUCT_VERSION_NOISE: readonly string[] = [
  'productId',
  'originalProductId',
  'version',
  'status',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'effectiveTime',
  'invalidTime',
  'createTime',
  'updateTime',
  'createdTime',
  'updatedTime',
  'contentHash',
]

/**
 * 费率表版本对比的噪声字段（同上：tableId/版本号/状态/时间戳/内容哈希为版本轴与派生物）。
 *
 * <p>🔴 `rowId` 必须在此：**每个版本的费率行都各自生成新 rowId**（同一维度组合的两行，
 * 在两个版本里的 rowId 必然不同），故它是一条**必定出现**的假差异——只要费率改了，
 * 差异表里就一定会多出一条「rowId f4e03d53… → 6db069fe…」。它会与真实变更并排显示，
 * 让「费率 0.0012 → 0.0015」这条关键证据淹在技术主键里。行的身份由 `dimensionHash` 承担
 * （它是匹配键，见 {@link diffRowsByKey}），`rowId` 不是证据。</p>
 *
 * <p>判据同 {@link PRODUCT_VERSION_NOISE}：**留一个假差异 = 每一行都多一条噪声**；
 * 而 `dimensionHash` 不得进本清单——它是行匹配键，列进去等于把配对依据也当成差异。</p>
 */
export const RATE_TABLE_VERSION_NOISE: readonly string[] = [
  'tableId',
  'tableVersion',
  'rowId',
  'status',
  'createTime',
  'updateTime',
  'contentHash',
  'rowCount',
]

/** 判定两个叶子值是否相等（数字型字符串按数值比较，避免 `"12.5"` 与 `12.5` 的假差异） */
const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (a === null || a === undefined || b === null || b === undefined) return false
  if (typeof a === 'number' && typeof b === 'string') return numericEqual(a, b)
  if (typeof a === 'string' && typeof b === 'number') return numericEqual(b, a)
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    return aKeys.length === bKeys.length && aKeys.every((key) => sameValue(a[key], b[key]))
  }
  return false
}

/** 字符串是否为可无损转数字的十进制数（排除空串、"12abc"、"1e3" 等） */
const numericEqual = (num: number, text: string): boolean => {
  const trimmed = text.trim()
  if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) return false
  return Number(trimmed) === num
}

/** 是否为普通对象（排除 null、数组、日期等） */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
}

/** 路径是否命中忽略列表（命中自身或其子路径均算命中） */
const isIgnored = (path: string, ignore: readonly string[]): boolean => {
  return ignore.some((prefix) => path === prefix || path.startsWith(`${prefix}.`))
}

/**
 * 比较两个版本快照，返回逐字段差异（按路径稳定排序，便于测试与阅读）。
 *
 * @param before 旧版本快照（通常是历史版本的详情响应）
 * @param after  新版本快照
 * @param options 对比选项（忽略字段、递归深度）
 */
export function diffRecords(before: unknown, after: unknown, options: DiffOptions = {}): DiffEntry[] {
  const entries: DiffEntry[] = []
  walk('', before, after, entries, {
    ignore: options.ignore ?? [],
    maxDepth: options.maxDepth ?? 8,
  })
  // 路径排序：对象键序在两侧可能不同，排序后输出才是稳定的（测试可断言、用户可对齐阅读）
  return entries.sort((a, b) => a.path.localeCompare(b.path))
}

/** 递归遍历：一侧缺失记 ADDED/REMOVED，两侧都在则递归对象或比较叶子 */
const walk = (
  path: string,
  before: unknown,
  after: unknown,
  out: DiffEntry[],
  ctx: { ignore: readonly string[]; maxDepth: number },
): void => {
  if (path && isIgnored(path, ctx.ignore)) return

  const beforeMissing = before === undefined
  const afterMissing = after === undefined
  if (beforeMissing && afterMissing) return
  if (beforeMissing) {
    if (isEmptyValue(after)) return // 新版本里凭空出现的 null/空数组不构成证据，避免噪声
    out.push({ path, kind: 'ADDED', before: undefined, after })
    return
  }
  if (afterMissing) {
    if (isEmptyValue(before)) return
    out.push({ path, kind: 'REMOVED', before, after: undefined })
    return
  }
  if (sameValue(before, after)) return

  const depthExceeded = path ? path.split('.').length >= ctx.maxDepth : false
  if (!depthExceeded && isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    for (const key of keys) {
      walk(path ? `${path}.${key}` : key, before[key], after[key], out, ctx)
    }
    return
  }
  out.push({ path, kind: 'CHANGED', before, after })
}

/** 空值判定：null、空串、空数组、空对象（用于「新版本凭空出现空值」的降噪） */
const isEmptyValue = (value: unknown): boolean => {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) return Object.keys(value).length === 0
  return false
}

/**
 * 按业务键比较两版「行集合」（费率表行、责任行等），不受行顺序影响。
 *
 * <p>🔴 匹配键必须取<b>业务维度</b>（费率表用 `dimensionHash`——它正是为「同一维度组合」而存在的
 * 标识），不得用 `rowId`：每个版本的行各自生成新 rowId，用它匹配会得出「全删全增」的假结论，
 * 而审计要看的恰恰是「同一档年龄性别的费率从 0.012 涨到 0.015」。</p>
 *
 * @param before  旧版本行
 * @param after   新版本行
 * @param keyOf   行 → 业务维度键
 * @param options 行内字段对比的选项（忽略/深度）
 */
export function diffRowsByKey<T>(
  before: readonly T[],
  after: readonly T[],
  keyOf: (row: T) => string,
  options: DiffOptions = {},
): RowDiff<T> {
  const beforeMap = new Map<string, T>()
  const afterMap = new Map<string, T>()
  for (const row of before) beforeMap.set(keyOf(row), row)
  for (const row of after) afterMap.set(keyOf(row), row)

  const added: T[] = []
  const removed: T[] = []
  const changed: RowDiff<T>['changed'] = []

  for (const [key, afterRow] of afterMap) {
    const beforeRow = beforeMap.get(key)
    if (beforeRow === undefined) {
      added.push(afterRow)
      continue
    }
    const fields = diffRecords(beforeRow, afterRow, options)
    // 行内字段差异为空 = 键相同且字段全同，无需上报（同一行被重复录入属数据问题，不属版本差异）
    if (fields.length > 0) {
      changed.push({ key, before: beforeRow, after: afterRow, fields })
    }
  }
  for (const [key, beforeRow] of beforeMap) {
    if (!afterMap.has(key)) removed.push(beforeRow)
  }

  return { added, removed, changed }
}

/** 差异汇总（页面头部一句「共 N 处差异」用） */
export interface DiffSummary {
  added: number
  removed: number
  changed: number
  total: number
}

/** 统计差异条目 */
export function summarizeDiff(entries: readonly DiffEntry[]): DiffSummary {
  let added = 0
  let removed = 0
  let changed = 0
  for (const entry of entries) {
    if (entry.kind === 'ADDED') added += 1
    else if (entry.kind === 'REMOVED') removed += 1
    else changed += 1
  }
  return { added, removed, changed, total: added + removed + changed }
}

/** 行集合差异的汇总（与 {@link summarizeDiff} 同口径，供费率表版本对比使用） */
export function summarizeRowDiff<T>(diff: RowDiff<T>): DiffSummary {
  const added = diff.added.length
  const removed = diff.removed.length
  const changed = diff.changed.length
  return { added, removed, changed, total: added + removed + changed }
}

/**
 * 差异值 → 可读文本（页面渲染用）。
 *
 * <p>空值一律渲染成标记而不是空串：审计视图里「空着」与「没有这个字段」在视觉上无法区分，
 * 而这两者在业务上完全不同（前者是清空，后者是从未配置）。</p>
 *
 * <h3>🔴 两种「空」必须各自可辨</h3>
 * <p>`null`（未配置）与 `''`（被写成空串）虽然都是空，却是**两个不同的 JSON 值**，
 * 故必须渲染成不同的文本：`null → —`、`'' → （空字符串）`。若二者都渲染成 `—`，
 * 一条 `<字段>: null → ""` 的真实变更会在差异表里显示成「`—` → `—`」——**读者看到的是
 * 一个自称「变更」却两列一模一样的行**，既读不出改了什么，还会怀疑比对功能本身失灵。
 * 实测命中：产品 `V2A-LIFE-001` 的 `insureCondition.healthNotice` 在 V1.0 为 `null`、
 * V2.0 为 `''`，旧版本渲染下正是这种「幽灵差异行」。</p>
 *
 * <p>⚠️ 这属于**显示层**的修复，不是比对层的：引擎里 `null` 与 `''` 仍是两个不同的值
 * （不像 `"12.5"` 与 `12.5` 那样被判等）。审计口径是「宁可多一行噪声也不要少一条证据」，
 * 故不能为了消掉这行而把它判成「无差异」。</p>
 */
export function formatDiffValue(value: unknown): string {
  if (value === undefined) return '（无此字段）'
  if (value === null) return '—'
  if (value === '') return '（空字符串）'
  if (Array.isArray(value)) {
    return value.length === 0 ? '（空列表）' : value.map((item) => formatDiffValue(item)).join('、')
  }
  if (isPlainObject(value)) return JSON.stringify(value)
  return String(value)
}
