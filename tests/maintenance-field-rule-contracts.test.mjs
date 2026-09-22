import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// 保全字段规则契约（round6 批次 2）
//
// 缺陷背景：保全工作台「保全项与字段变更」表格的「拟变更值」列，对**所有**数据类型与校验类型
// 一律渲染裸 `el-input`。后端随案件详情下发的字段规则
// （`required / allowClear / validationType / validationPattern / validationMessage /
// conditionRuleCode`）被整份丢弃，只剩 `expectedValueType` 当作 `dataType`，于是：
//   · 配置好的「邮箱/手机号/身份证」格式要等提交后才由后端拒绝，用户拿不到当场反馈；
//   · 必填字段没有任何标记；
//   · allowClear=false 的字段可以被清空（清空按钮虽可隐藏，退格键不行）；
//   · BOOLEAN 字段得手打 "true"，打错才知道；
//   · 无敏感明细权限时后端把五项抹为 null 并置 detailsRedacted，前端对此毫无反应。
//
// 形态说明：**纯函数行为断言 + 跨语言正则对拍**。校验逻辑是纯函数
// （constants/maintenance.ts 零依赖），可直接 import；而正则与判定顺序的权威在后端 Java 源码，
// 故第一组用例把 Java 字符串字面量抽出来与前端运行时值**逐字对拍**——前端提前报错必须与后端
// 同结论，否则会造出「前端放过、后端拒绝」或更糟的「前端拦住、后端本可接受」。
const { FIELD_VALIDATION_PATTERNS, fieldControlKind, fieldPlaceholder, fieldValueError } = await import(
  '../src/constants/maintenance.ts'
)

const workbenchSource = await readFile(
  new URL('../src/views/maintenance/workbench/index.vue', import.meta.url),
  'utf8',
)
const maintenanceApiSource = await readFile(new URL('../src/api/maintenance.ts', import.meta.url), 'utf8')

/** 剥掉注释，只留可执行代码（说明性注释里刻意引用了历史缺陷，全文匹配会假阳性） */
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')

const workbenchCode = stripComments(workbenchSource)

// 🔴 跨仓库读取：正则与判定顺序的权威在后端领域层
const fieldRuleSource = await readFile(
  new URL(
    '../../titanium-maintenance/titanium-maintenance-domain/src/main/java/com/titanium/maintenance/configuration/MaintenanceFieldRule.java',
    import.meta.url,
  ),
  'utf8',
)
/** 值规范化（BOOLEAN/DATE/… 的 canonical 形态）的真源，非 FieldRule 本身 */
const fieldValueSource = await readFile(
  new URL(
    '../../titanium-maintenance/titanium-maintenance-domain/src/main/java/com/titanium/maintenance/valueobject/change/MaintenanceFieldValue.java',
    import.meta.url,
  ),
  'utf8',
)
const proposalPlannerSource = await readFile(
  new URL(
    '../../titanium-maintenance/titanium-maintenance-domain/src/main/java/com/titanium/maintenance/service/MaintenanceFieldProposalPlanner.java',
    import.meta.url,
  ),
  'utf8',
)
const configurationVOSource = await readFile(
  new URL(
    '../../titanium-maintenance/titanium-maintenance-web/src/main/java/com/titanium/maintenance/web/response/configuration/MaintenanceConfigurationVO.java',
    import.meta.url,
  ),
  'utf8',
)
const webMapperSource = await readFile(
  new URL(
    '../../titanium-maintenance/titanium-maintenance-web/src/main/java/com/titanium/maintenance/web/mapper/MaintenanceConfigurationWebMapper.java',
    import.meta.url,
  ),
  'utf8',
)

/**
 * 抽出 Java 里 `X_PATTERN = Pattern.compile("…")` 的**原始字面量文本**并按 Java 转义规则反转义。
 *
 * <p>逐字符扫描而非正则匹配：EMAIL 那条表达式跨了两行且含 `"` 以外的各种符号，
 * 正则式抽取容易在边界上出错，而这里错一位就会变成假绿。</p>
 */
function javaPattern(name) {
  const anchor = `${name}_PATTERN = Pattern.compile(`
  const start = fieldRuleSource.indexOf(anchor)
  assert.ok(start > 0, `Java 中应存在 ${name}_PATTERN 常量`)
  let i = fieldRuleSource.indexOf('"', start) + 1
  let raw = ''
  while (i < fieldRuleSource.length) {
    const ch = fieldRuleSource[i]
    if (ch === '\\') {
      raw += ch + fieldRuleSource[i + 1]
      i += 2
      continue
    }
    if (ch === '"') break
    raw += ch
    i += 1
  }
  return raw.replace(/\\(.)/g, '$1')
}

test('① 五个内置正则与后端逐字一致（跨语言对拍，防「翻译走样」）', () => {
  for (const name of ['EMAIL', 'MOBILE_CN', 'GENDER', 'ID_CARD_CN', 'POSTAL_CODE_CN']) {
    assert.equal(
      FIELD_VALIDATION_PATTERNS[name],
      javaPattern(name),
      `${name} 正则必须与 MaintenanceFieldRule 中的常量逐字相同`,
    )
  }
  // 前端不得自造第六种内置校验类型
  assert.deepEqual(
    Object.keys(FIELD_VALIDATION_PATTERNS).sort(),
    ['EMAIL', 'GENDER', 'ID_CARD_CN', 'MOBILE_CN', 'POSTAL_CODE_CN'],
  )
})

test('② 判定顺序与跳空规则照抄后端（空值不判格式、先判不许清空、必填排除条件规则）', () => {
  // 空值直接返回，格式校验不参与（后端 validateValue 首行：value == null || isNull() → return）
  assert.match(
    fieldRuleSource,
    /void validateValue\(MaintenanceFieldValue value\) \{\s*\n\s*if \(value == null \|\| value\.isNull\(\) \|\| validationType == MaintenanceFieldValidationType\.NONE\)/,
  )
  // 「不允许清空」在提案校验阶段就抛出，早于格式校验
  const clearIdx = proposalPlannerSource.indexOf('字段不允许清空')
  const formatIdx = proposalPlannerSource.indexOf('rule.validateValue(proposal.value())')
  assert.ok(clearIdx > 0 && formatIdx > 0 && clearIdx < formatIdx, '先判不许清空，再判格式')

  // 🔴 必填只对「无条件规则」的字段生效
  assert.match(
    proposalPlannerSource,
    /for \(MaintenanceFieldRule rule : item\.fieldRules\(\)\) \{\s*\n\s*if \(!rule\.required\(\) \|\| rule\.conditionRuleCode\(\) != null\) \{\s*\n\s*continue;/,
    'validateRequiredFields 必须跳过带条件规则的字段',
  )
  // 正则是整串匹配（Java matcher.matches），前端必须包 ^(?:…)$ 等价化
  assert.match(fieldRuleSource, /!pattern\.matcher\(canonicalValue\)\.matches\(\)/)
})

test('③ 后端确实下发这些元数据，且抹除清单是「条件规则 + 四项校验明细」', () => {
  // 字段确实在 VO 上（前端原先的类型漏了两项，是类型缺失而非后端没给）
  for (const field of [
    'conditionRuleCode', 'expectedValueType', 'validationType',
    'validationPattern', 'validationMessage', 'detailsRedacted',
  ]) {
    assert.ok(configurationVOSource.includes(field), `FieldRuleVO 应含 ${field}`)
    assert.ok(maintenanceApiSource.includes(field), `前端类型应声明 ${field}`)
  }
  // 🔴 抹除清单：敏感明细不可见时五项置 null 并置标记；required/visible/editable/allowClear 不动
  assert.match(
    webMapperSource,
    /sensitiveDetailsVisible \? rule\.conditionRuleCode\(\) : null[\s\S]{0,400}?!sensitiveDetailsVisible\);/,
  )
  for (const kept of ['rule.required()', 'rule.visible()', 'rule.editable()', 'rule.allowClear()']) {
    assert.ok(webMapperSource.includes(kept), `${kept} 不在抹除之列，前端可无条件信任`)
  }
  // 前端必须**消费**这个标记，否则「条件规则为空」会被误读成「无条件规则」
  assert.match(workbenchCode, /!rule\.detailsRedacted/)
})

test('④ 五种内置校验的正负样本（与后端同结论）', () => {
  const cases = [
    { type: 'EMAIL', ok: ['a.b@example.com', 'x+y@sub.domain.co'], bad: ['a@b', 'a b@c.com', '@x.com'] },
    { type: 'MOBILE_CN', ok: ['13800138000', '19912345678'], bad: ['12800138000', '1380013800', '138001380000'] },
    { type: 'GENDER', ok: ['M', 'F', 'UNKNOWN'], bad: ['ALL', 'male', 'm'] },
    { type: 'ID_CARD_CN', ok: ['11010519491231002X', '110105491231002'], bad: ['11010519491231002Y', '1101051949123100'] },
    { type: 'POSTAL_CODE_CN', ok: ['100000', '518000'], bad: ['012345', '10000'] },
  ]
  for (const { type, ok, bad } of cases) {
    for (const value of ok) {
      assert.equal(fieldValueError({ validationType: type }, value), '', `${type} 应接受 ${value}`)
    }
    for (const value of bad) {
      assert.notEqual(fieldValueError({ validationType: type }, value), '', `${type} 应拒绝 ${value}`)
    }
  }
  // 🔴 性别字典含 ALL（不限），但后端校验不接受 —— 界面必须剔除该选项，
  //    否则会给出一个必然被后端拒绝的选项（见页面 exclude-values）
  assert.equal(fieldValueError({ validationType: 'GENDER' }, 'ALL') !== '', true)
  assert.match(workbenchCode, /:exclude-values="\['ALL'\]"/)
})

test('⑤ 自定义正则是整串匹配（JS test 是子串匹配，必须等价化）', () => {
  const rule = { validationType: 'CUSTOM_REGEX', validationPattern: 'a|b' }
  // Java: matcher("xax").matches() === false（只接受整串 a 或 b）
  assert.notEqual(fieldValueError(rule, 'xax'), '', 'JS 的 test() 是子串匹配，未包锚点会放过 xax')
  assert.equal(fieldValueError(rule, 'a'), '')
  assert.equal(fieldValueError(rule, 'b'), '')
  // 带锚点的配置再包一层锚点仍然等价（Java 的 matches 本就忽略 ^$ 的冗余）
  assert.equal(fieldValueError({ validationType: 'CUSTOM_REGEX', validationPattern: '^[A-Z]{2}-\\d{4}$' }, 'AB-1234'), '')
  assert.notEqual(fieldValueError({ validationType: 'CUSTOM_REGEX', validationPattern: '^[A-Z]{2}-\\d{4}$' }, 'xAB-1234'), '')
  // 空值/无配置不拦（后端 validateFormatConfiguration 已保证配置必有表达式，前端编译失败时宁可不拦）
  assert.equal(fieldValueError({ validationType: 'CUSTOM_REGEX' }, 'anything'), '')
  assert.equal(fieldValueError({ validationType: 'CUSTOM_REGEX', validationPattern: '[' }, 'anything'), '')
})

test('⑥ 必填判定：排除条件规则、排除敏感明细被抹除', () => {
  const required = { required: true, allowClear: true }
  assert.notEqual(fieldValueError(required, ''), '', '无条件规则的必填字段留空应报错')
  assert.notEqual(fieldValueError(required, undefined), '')
  assert.notEqual(fieldValueError(required, null), '')
  assert.notEqual(fieldValueError(required, '   '), '', '纯空白视同未填（比后端严一档，见模块注释）')
  assert.equal(fieldValueError(required, '张三'), '')

  // 🔴 带条件规则的必填：后端 validateRequiredFields 首行即 continue，前端不得拦
  assert.equal(fieldValueError({ ...required, conditionRuleCode: 'RULE_1' }, ''), '')
  // 🔴 敏感明细被抹除时 conditionRuleCode 也为 null，两者不可区分 ⇒ 必填一并让路
  assert.equal(fieldValueError({ ...required, detailsRedacted: true }, ''), '')
  // 非必填留空放行
  assert.equal(fieldValueError({ required: false, allowClear: true }, ''), '')
})

test('⑦ 不允许清空优先于必填，且不受条件规则/抹除影响', () => {
  // 后端该判据只看 allowClear 与字段目录的 clearable，而 allowClear 从不在抹除之列
  const noClear = { required: true, allowClear: false }
  assert.match(fieldValueError(noClear, ''), /不允许清空/, '先判不许清空')
  assert.match(fieldValueError({ ...noClear, conditionRuleCode: 'R' }, ''), /不允许清空/)
  assert.match(fieldValueError({ ...noClear, detailsRedacted: true }, ''), /不允许清空/)
  // 非空值不受影响
  assert.equal(fieldValueError(noClear, 'X'), '')
  // 未声明 allowClear（含已保存行）按可清空处理，不误拦
  assert.equal(fieldValueError({ required: false }, ''), '')
})

test('⑧ 空值不做格式校验（照抄后端跳空）', () => {
  for (const type of ['EMAIL', 'MOBILE_CN', 'GENDER', 'ID_CARD_CN', 'POSTAL_CODE_CN', 'CUSTOM_REGEX']) {
    assert.equal(
      fieldValueError({ validationType: type, allowClear: true }, ''),
      '',
      `${type}：空值应交给必填/清空判定，不出格式错`,
    )
  }
  // 配置的提示语优先于模块兜底文案（租户意图优先）
  assert.match(
    fieldValueError({ validationType: 'EMAIL', validationMessage: '请填公司邮箱' }, 'bad'),
    /请填公司邮箱/,
  )
  assert.match(fieldValueError({ validationType: 'EMAIL' }, 'bad'), /name@example\.com/, '无配置提示语时给出格式样例')
})

test('⑨ 控件形态只对「后端已钉死规范化格式」的类型结构化', () => {
  // BOOLEAN 只接受 true/false（normalizeBoolean 显式拒绝其它取值）
  assert.match(
    fieldValueSource,
    /!"true"\.equalsIgnoreCase\(value\) && !"false"\.equalsIgnoreCase\(value\)/,
    '布尔值的规范化在 MaintenanceFieldValue.normalize，不在 FieldRule',
  )
  assert.equal(fieldControlKind('BOOLEAN', 'NONE'), 'boolean')
  assert.equal(fieldControlKind('TEXT', 'GENDER'), 'gender')
  // DATE 为 ISO yyyy-MM-dd（LocalDate.parse，带空白一律解析失败）
  assert.match(fieldValueSource, /case DATE -> LocalDate\.parse\(value\)\.toString\(\)/)
  assert.equal(fieldControlKind('DATE', 'NONE'), 'date')
  // 🔴 DATETIME/INTEGER/DECIMAL 保持文本：时区偏移与 BigDecimal/BigInteger 精度都不是 JS 数值能无损表达的
  assert.match(fieldValueSource, /case DATETIME -> OffsetDateTime\.parse\(value\)\.toString\(\)/)
  assert.match(fieldValueSource, /case INTEGER -> new BigInteger\(value\)\.toString\(\)/)
  assert.match(fieldValueSource, /case DECIMAL -> normalizeDecimal\(value\)/)
  assert.equal(fieldControlKind('DATETIME', 'NONE'), 'text')
  assert.equal(fieldControlKind('DECIMAL', 'NONE'), 'text')
  assert.equal(fieldControlKind('INTEGER', 'NONE'), 'text')
  assert.equal(fieldControlKind(undefined, undefined), 'text')
  // 抹除后 types 为 null ⇒ 退回文本，不会误用结构化控件
  assert.equal(fieldControlKind(null, null), 'text')
  assert.equal(fieldPlaceholder({ detailsRedacted: true }), '按保全项配置填写')
})

test('⑩ 页面接线：规则随行、错误在字段旁、保存前置拦截', () => {
  // 规则随行下传（此前只留 expectedValueType 当 dataType）
  assert.match(workbenchCode, /type FieldEntryRow = MaintenanceFieldChange & \{ rule\?: MaintenanceConfigurationFieldRule \}/)
  assert.match(workbenchCode, /const fieldEntryRows = computed<FieldEntryRow\[\]>/)
  // 已保存行不带规则（其值在记录时已由后端校验，事后重判会把历史数据判成不合规）
  assert.match(workbenchCode, /return \[\.\.\.detail\.value\.fieldChanges, \.\.\.unsavedRows\]/)

  // 实时校验 + 错误贴在字段正下方
  assert.match(workbenchCode, /const fieldErrors = computed<Record<string, string>>/)
  assert.match(workbenchCode, /fieldValueError\(row\.rule, draftValues\[changeKey\(row\)\]\)/)
  assert.match(workbenchCode, /class="field-input__error"/)
  assert.match(workbenchCode, /必填字段/)
  assert.match(workbenchCode, /const requiredOf = \(rawRow: unknown\)/)

  // 结构化控件三者接线
  assert.match(workbenchCode, /controlOf\(row\) === 'boolean'/)
  assert.match(workbenchCode, /<el-radio-button value="true">是<\/el-radio-button>/)
  assert.match(workbenchCode, /<el-radio-button value="false">否<\/el-radio-button>/)
  // 🔴 布尔用分段单选而非下拉：字典契约测试禁页面手写业务枚举下拉，而 true/false 是语言原语、
  //    没有（也不该有）对应字典行 ⇒ 用仓库既有约定（product/create 的封闭小集合解法）
  assert.doesNotMatch(workbenchCode, /<el-option\s+label="[^"]+"\s+value="[^"]+"/)
  // 单选钮点下撤不回 ⇒ 可清空字段补显式「清除」，否则误点即成死路（与 allowClear 同判据）
  assert.match(workbenchCode, /const clearDraft = \(rawRow: unknown\) => \{\s*\n\s*delete draftValues\[changeKey\(rawRow\)\]/)
  assert.match(workbenchCode, /v-if="clearableOf\(row\) && hasDraftValue\(row\)"/)
  assert.match(workbenchCode, /controlOf\(row\) === 'gender'/)
  assert.match(workbenchCode, /dict-type="GENDER"/)
  assert.match(workbenchCode, /controlOf\(row\) === 'date'/)
  assert.match(workbenchCode, /value-format="YYYY-MM-DD"/)

  // 保存前置拦截：校验在 pending 置位之前，且点名第一个出错字段
  assert.match(workbenchCode, /const saveChanges = async \(\) => \{\s*\n\s*if \(!detail\.value\) return\s*\n[\s\S]{0,700}?if \(fieldErrorCount\.value\) \{/)
  assert.match(workbenchCode, /firstFieldError/)
  // 按钮保持可点（禁用按钮说不出「为什么不能点」），错误计数与按钮并排
  assert.match(workbenchCode, /section-actions__error/)
  assert.match(workbenchCode, /:loading="savingChanges"/)
})
