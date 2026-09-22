// 保全字段规则：格式校验与录入引导
//
// 🔴 单一真源是后端 `MaintenanceFieldRule.java`（`titanium-maintenance-domain/configuration/`），
// 本模块只做**等价翻译**，不引入新口径：
//   · 五个内置正则逐字抄自其私有常量 `EMAIL_PATTERN` / `MOBILE_CN_PATTERN` / `GENDER_PATTERN` /
//     `ID_CARD_CN_PATTERN` / `POSTAL_CODE_CN_PATTERN`
//   · 校验顺序与跳空规则照抄其 `validateValue`（空值不做格式校验）与
//     `MaintenanceFieldProposalPlanner`（先判「不允许清空」，必填另判）
//   · 规范化格式照抄 `MaintenanceFieldValue.normalize`（BOOLEAN 只接受 true/false、
//     DATE 为 ISO `yyyy-MM-dd`、INTEGER 为整数字面量……）
// 契约测试 `tests/maintenance-field-rule-contracts.test.mjs` 逐条比对上述后端源码。
//
// 本模块刻意零依赖（不 import `@/`），以便 node 侧测试直接 import 并与 Java 源码对拍。

/** 字段格式校验类型。值必须与后端 `MaintenanceFieldValidationType.code` 严格一致 */
export type FieldValidationType =
  | 'NONE'
  | 'EMAIL'
  | 'MOBILE_CN'
  | 'GENDER'
  | 'ID_CARD_CN'
  | 'POSTAL_CODE_CN'
  | 'CUSTOM_REGEX'

/**
 * 内置校验类型的正则（**逐字抄自** `MaintenanceFieldRule` 的私有常量）。
 *
 * <p>🔴 不自造、不"改进"这些表达式：前端提前报错必须与后端判定**同结论**，
 * 否则会出现「前端放过、后端拒绝」或更糟的「前端拦住、后端本可接受」。</p>
 */
export const FIELD_VALIDATION_PATTERNS: Record<string, string> = {
  EMAIL:
    "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$",
  MOBILE_CN: '^1[3-9]\\d{9}$',
  GENDER: '^(M|F|UNKNOWN)$',
  ID_CARD_CN: '^(?:\\d{15}|\\d{17}[0-9Xx])$',
  POSTAL_CODE_CN: '^[1-9]\\d{5}$',
}

/**
 * 各校验类型的**格式提示**（placeholder 与兜底报错文案用）。
 *
 * <p>⚠️ 这里写的是「值该长什么样」，不是枚举中文名的副本——枚举/字典的中文名
 * （`MaintenanceFieldValidationType.name`、`MAINTENANCE_FIELD_VALIDATION_TYPE` 字典）
 * 是配置页的展示真源，本表不参与，也不得被当成第二份标签表使用。</p>
 */
export const FIELD_FORMAT_HINT: Record<string, string> = {
  EMAIL: '如 name@example.com',
  MOBILE_CN: '11 位中国大陆手机号，如 13800138000',
  GENDER: 'M / F / UNKNOWN',
  ID_CARD_CN: '15 位或 18 位（末位可为 X）',
  POSTAL_CODE_CN: '6 位，首位不为 0',
  CUSTOM_REGEX: '按配置的自定义正则',
}

/** 字段值类型（`PolicyFieldValueType` / `PolicyFieldDataType` 的 code）对应的格式提示 */
export const VALUE_TYPE_HINT: Record<string, string> = {
  TEXT: '',
  INTEGER: '整数，如 30',
  DECIMAL: '小数，如 12.5',
  BOOLEAN: '仅接受 true / false',
  DATE: 'YYYY-MM-DD',
  DATETIME: 'ISO 带时区，如 2026-09-20T10:00:00+08:00',
  ENUM: '枚举码',
  OBJECT: 'JSON 对象',
  ARRAY: 'JSON 数组',
}

/** 参与校验的字段规则（后端 `MaintenanceFieldRule` 的字段子集，前端不持有 condition 规则明细） */
export interface FieldRuleLike {
  required?: boolean
  allowClear?: boolean
  /** 非空即表示该字段的必填性由条件规则动态决定 */
  conditionRuleCode?: string | null
  expectedValueType?: string | null
  validationType?: FieldValidationType | string | null
  validationPattern?: string | null
  validationMessage?: string | null
  /**
   * 敏感明细已被后端抹除。
   *
   * <p>置位时 `conditionRuleCode` 等五项一律为 null —— 此时「无 conditionRuleCode」**不能**
   * 读作「无条件规则」，故必填判定必须整体让路（见 `fieldValueError`）。</p>
   */
  detailsRedacted?: boolean
}

/**
 * 「空值」判定：null / undefined / 纯空白串。
 *
 * <p>⚠️ 比后端**更严一档**（后端 `MaintenanceFieldValue.normalize` 对 TEXT 不过滤空白，
 * 纯空白会被当成合法值继续走格式校验）。这是刻意的：一个只剩空格的必填字段在任何业务里
 * 都不是有意填写，前端拦住它比放行到后端更有价值。</p>
 */
export function isEmptyFieldValue(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true
  return typeof raw === 'string' && raw.trim() === ''
}

/**
 * 编译校验正则。
 *
 * <p>🔴 两处与 Java 对齐的细节，缺一不可：</p>
 * <p>① **整串匹配**：Java 用 `pattern.matcher(v).matches()`，是整串匹配；JS 的 `test()` 是
 * 子串匹配。故必须显式包成 `^(?:…)$`——否则自定义正则 `a|b` 在 Java 下只接受整串 "a"/"b"，
 * 在 JS 下却会放过 "xax"。</p>
 * <p>② **配置正则不可编译时不报错**：自定义正则的合法性由后端在配置保存时校验
 * （`validateFormatConfiguration` 用 RE2 编译），前端拿到的一定是合法表达式；
 * 若仍编译失败，只能说明前后端语法支持面有差异，此时**不拦**比误拦安全。</p>
 */
function compilePattern(rule: FieldRuleLike): RegExp | null {
  const type = rule.validationType
  if (!type || type === 'NONE') return null
  const source = type === 'CUSTOM_REGEX' ? rule.validationPattern : FIELD_VALIDATION_PATTERNS[type]
  if (!source) return null
  try {
    return new RegExp(`^(?:${source})$`)
  } catch {
    return null
  }
}

/**
 * 校验单个字段值，返回错误文案；无错误返回空串。
 *
 * <p>顺序照抄后端：① 空值且（不允许清空）⇒「不允许清空」——后端在
 * `MaintenanceFieldProposalPlanner.validateProposal` 里就早于格式校验抛出此错；
 * ② 空值且（必填且无条件规则）⇒「必填」；③ 非空才做格式校验（`validateValue` 对 null 直接返回）。</p>
 *
 * <p>🔴 **必填必须排除两类字段**：① 带条件规则的——后端 `validateRequiredFields` 首行即
 * `if (!rule.required() || rule.conditionRuleCode() != null) continue;`，带条件规则的字段其必填性
 * 由条件决定；② 敏感明细已被抹除的——此时 `conditionRuleCode` 也被抹成 null，「无条件规则」与
 * 「被抹除」无法区分，一律当必填会把配置明确豁免的字段拦下来（前端拦住而后端本可接受，
 * 比不拦更糟）。</p>
 */
export function fieldValueError(rule: FieldRuleLike | null | undefined, raw: unknown): string {
  if (!rule) return ''
  const empty = isEmptyFieldValue(raw)
  if (empty) {
    // 「不允许清空」不受条件规则与抹除影响：后端该判据只用 allowClear 与字段目录的 clearable，
    // 而 allowClear 从不在抹除之列
    if (rule.allowClear === false) return '该字段不允许清空'
    if (rule.required && !rule.conditionRuleCode && !rule.detailsRedacted) return '该字段为必填项'
    return ''
  }
  const pattern = compilePattern(rule)
  // 🔴 不 trim 再匹配：后端 `validateValue` 直接拿 `canonicalValue` 匹配，且
  // `MaintenanceFieldValue.normalize` 对 TEXT 不做 trim、对 INTEGER/DECIMAL/DATE 则根本解析不过
  // 带空白的取值。前端若先 trim 再判，就会「放过一个后端必然拒绝的值」——正是要消灭的失败模式。
  // 带空白的输入在此如实报格式错，用户看到提示即可自行修掉。
  if (pattern && !pattern.test(String(raw))) {
    // 配置了提示语就用配置的（租户意图优先），否则退到本模块的格式提示
    const hint = rule.validationMessage
      || (rule.validationType === 'CUSTOM_REGEX'
        ? FIELD_FORMAT_HINT.CUSTOM_REGEX
        : FIELD_FORMAT_HINT[rule.validationType || ''] || '配置要求的格式')
    return `字段值不符合格式要求：${hint}`
  }
  return ''
}

/** 录入控件的形态。仅对**后端已钉死规范化格式**的类型使用结构化控件，其余保持文本录入 */
export type FieldControlKind = 'boolean' | 'gender' | 'date' | 'text'

/**
 * 选定录入控件。
 *
 * <p>判据是「规范化格式是否被后端钉死」，不是「类型看起来像什么」：</p>
 * <p>· `BOOLEAN` → 只能 `true`/`false`（`normalizeBoolean` 显式拒绝其它取值）⇒ 下拉，杜绝手打。</p>
 * <p>· `GENDER` 校验 → 值域 `M|F|UNKNOWN` 固定 ⇒ 字典下拉。</p>
 * <p>· `DATE` → `LocalDate.parse` ⇒ ISO `yyyy-MM-dd` ⇒ 日期选择器。</p>
 * <p>· `DATETIME`/`INTEGER`/`DECIMAL` **仍用文本录入**：日期时间带时区偏移（`OffsetDateTime.parse`，
 * 裸时间串根本解析不过），而 `BigInteger`/`BigDecimal` 的精度也超出 JS number 的表示范围——
 * 用结构化控件会产生**前端表达不了**的值。宁可用文本加提示，把取值原样交给后端。</p>
 */
export function fieldControlKind(
  valueType: string | null | undefined,
  validationType: FieldValidationType | string | null | undefined,
): FieldControlKind {
  if (valueType === 'BOOLEAN') return 'boolean'
  if (validationType === 'GENDER') return 'gender'
  if (valueType === 'DATE') return 'date'
  return 'text'
}

/** 录入框提示语：格式校验的提示优先于值类型提示（前者更具体） */
export function fieldPlaceholder(rule: FieldRuleLike | null | undefined): string {
  if (!rule) return '请输入'
  // 明细被抹除时值类型与格式都不可知，如实说明「按配置填写」好过给一个可能是错的提示
  if (rule.detailsRedacted) return '按保全项配置填写'
  const byValidation = rule.validationType ? FIELD_FORMAT_HINT[rule.validationType] : ''
  if (byValidation && rule.validationType !== 'CUSTOM_REGEX') return byValidation
  return VALUE_TYPE_HINT[rule.expectedValueType || ''] || '请输入'
}
