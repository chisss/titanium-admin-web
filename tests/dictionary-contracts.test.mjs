import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { SEED_DIR } from './liquibase-rows.mjs'

const viewsRoot = fileURLToPath(new URL('../src/views/', import.meta.url))

async function vueFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return extname(entry.name) === '.vue' ? [path] : []
  }))
  return nested.flat()
}

test('业务页面的字符串枚举下拉统一由字典驱动', async () => {
  const violations = []
  for (const path of await vueFiles(viewsRoot)) {
    const source = await readFile(path, 'utf8')
    const literalOptions = source.match(/<el-option\s+label="[^"]+"\s+(?:v-bind:)?value="[^"]+"/g) || []
    if (literalOptions.length) violations.push({ path, literalOptions })
  }
  assert.deepEqual(violations, [])
})

test('保全配置和核心业务页面引用正式字典编码', async () => {
  const requiredReferences = new Map([
    ['maintenance/configuration/MaintenanceConfigurationEditor.vue', ['MAINTENANCE_FIELD_VALIDATION_TYPE', 'MAINTENANCE_EFFECTIVE_TIME_TYPE']],
    ['maintenance/workbench/index.vue', ['MAINTENANCE_CASE_STATUS', 'MAINTENANCE_CHANNEL']],
    ['policy/list/index.vue', ['POLICY_STATUS']],
    ['rule-engine/list/index.vue', ['RULE_SET_TYPE', 'RULE_SET_STATUS', 'RULE_ACTION']],
    ['product/actuarial-workbench/index.vue', ['PRICE_COMPONENT_CATEGORY', 'FACTOR_MISSING_POLICY', 'ACCOUNTING_CLASS', 'JURISDICTION']],
    ['system/dict/index.vue', ['SUPPORTED_LOCALE']],
  ])

  for (const [relativePath, dictTypes] of requiredReferences) {
    const source = await readFile(join(viewsRoot, relativePath), 'utf8')
    for (const dictType of dictTypes) assert.match(source, new RegExp(dictType))
  }
})

test('字典管理在移动端使用上下分区而非压缩双栏', async () => {
  const source = await readFile(join(viewsRoot, 'system/dict/index.vue'), 'utf8')

  assert.match(source, /<el-col :xs="24" :sm="8">/)
  assert.match(source, /<el-col :xs="24" :sm="16">/)
  // 断点改走 $breakpoint-mobile 令牌（原为字面量 767px）。本用例守的是
  // 「移动端把双栏拆成上下分区」，断点取值本身由 layout-breakpoint-contracts.test.mjs 守护。
  assert.match(source, /@media \(max-width: \$breakpoint-mobile\)/)
  assert.match(source, /\.dict-type-panel \{\s+height: 300px;/)
})

test('保单查询状态下拉剔除字典中的历史死码（读侧永不产生）', async () => {
  // 🔴 缺陷现场：字典 POLICY_STATUS 因早期 seed 与新 dml 两份数据并存，并集 10 项 >
  // 读侧真实值域 7 项。用户选中 PROPOSAL「投保中」/ACTIVE「生效中」/NOT_EFFECTIVE「未生效」
  // 三者之一时列表恒为 0 条，读起来像「系统里没有这类保单」，比报错更隐蔽。
  // 处置是剔除而非改字典：同一字典被多页复用，改字典会连带影响其它场景。
  await assertDeadCodeExcluded({
    page: 'policy/list/index.vue',
    dictType: 'POLICY_STATUS',
    constant: 'POLICY_STATUS_DEAD_CODES',
    deadCodes: ['ACTIVE', 'PROPOSAL', 'NOT_EFFECTIVE'],
    liveCodes: ['EFFECTIVE', 'EXPIRED', 'TERMINATED', 'SUSPENDED', 'CANCELLED', 'LAPSED'],
  })
})

/**
 * 取出某常量声明的**数组字面量原文**（含方括号），取不到返回空串。
 *
 * <p>🔴 不可用 `new RegExp(\`${name}[^\\]]*\\]\`)` 这类「截到第一个 `]`」的写法：常量声明形如
 * `export const X: string[] = [...]`，**类型标注 `string[]` 里就有 `]`**，正则会在此处截断、
 * 返回 `export const X: string[]`——不含任何状态码。用它做反向断言（「不得误含真实码」）会
 * **恒绿空转**：比对文本里本就没有码，怎么剔错都 PASS。</p>
 *
 * <p>故改为「先定位 `export const` 声明，再从 `=` 之后找数组开括号」，绕开类型标注的 `[]`。</p>
 */
function extractArrayLiteral(source, constant) {
  const nameAt = source.indexOf(`export const ${constant}`)
  if (nameAt === -1) return ''
  const eqAt = source.indexOf('=', nameAt)
  if (eqAt === -1) return ''
  const openAt = source.indexOf('[', eqAt)
  if (openAt === -1) return ''
  const closeAt = source.indexOf(']', openAt)
  return closeAt === -1 ? '' : source.slice(openAt, closeAt + 1)
}

/**
 * 断言某查询页的状态下拉已剔除指定死码，且剔除集合不含该视图的真实码。
 *
 * <p>只断言「有 exclude-values 属性」会空转（属性在、值写空数组也 PASS），故逐码断言；
 * 反向断言防止剔错把可用筛选项一起藏掉。</p>
 *
 * @param {object} spec
 * @param {string} spec.page 页面相对 `src/views/` 的路径
 * @param {string} spec.dictType 驱动该下拉的字典类型码
 * @param {string} spec.constant 死码常量名（`src/constants/policy.ts` 中）
 * @param {string[]} spec.deadCodes 该视图投影**从不写入**的码
 * @param {string[]} spec.liveCodes 该视图投影**实际写入**的码（反向断言用）
 */
async function assertDeadCodeExcluded({ page, dictType, constant, deadCodes, liveCodes }) {
  const pageSource = await readFile(join(viewsRoot, page), 'utf8')
  const constantsSource = await readFile(
    new URL('../src/constants/policy.ts', import.meta.url),
    'utf8',
  )

  const selectTag = (pageSource.match(/<TiDictSelect[\s\S]*?\/>/g) || []).find((tag) =>
    tag.includes(dictType),
  )
  assert.ok(selectTag, `${page} 应存在由 ${dictType} 字典驱动的状态下拉`)

  // 允许两种合规形态：引用常量（单一真源）或就地内联字面量数组；两者都必须含全部死码。
  const viaConstant = selectTag.includes(`:exclude-values="${constant}"`)
  const excluded = viaConstant ? extractArrayLiteral(constantsSource, constant) : selectTag
  assert.ok(excluded, `${page} 未能从 src/constants/policy.ts 取到 ${constant} 的数组字面量`)
  for (const code of deadCodes) {
    assert.match(excluded, new RegExp(`'${code}'`), `${page} 状态下拉未剔除死码 ${code}`)
  }

  for (const real of liveCodes) {
    // 🔴 必须带引号精确匹配：投保单侧死码 `REJECTED` 是活码 `UNDERWRITING_REJECTED` 的子串，
    // 不带引号的正则会把「错误剔除活码」与「正确剔除死码」判成同一现象，正反两向同时失灵。
    assert.doesNotMatch(excluded, new RegExp(`'${real}'`), `${page} 剔除集合误含真实状态码 ${real}`)
  }
}

test('意向单查询状态下拉剔除字典中的历史死码（读侧独有码，写侧投影从不写入）', async () => {
  // 🔴 缺陷现场：字典 POLICY_INTENT_STATUS 由「早期 seed + admin_business_dictionary dml」两份数据
  // 并集而成 6 项，超出读模型真实值域 4 项。本视图投影写入的是**写侧** `ProposalStatusCode`
  // （ProposalProjectionEventHandler :78/:91/:101/:111 四处 setStatus 全用写侧枚举），
  // 而 `CONFIRMED`/`CANCELLED` 是**读侧** `PolicyEnum.IntentStatus` 独有的码，从不落库。
  // live 实测（2026-09-21，:5199）：`CONVERTED_TO_APPLICATION` 返回 17 条 = 全量，
  // `CONFIRMED`（已确认）与 `CANCELLED`（已作废）均返回 0 条。
  // ⚠️ 方向与保单查询页**相反**（那边死码是写侧独有码）——判据只能是「本视图投影写了哪一侧的码」，
  // 从相邻页面外推必错。
  await assertDeadCodeExcluded({
    page: 'policy/intention/index.vue',
    dictType: 'POLICY_INTENT_STATUS',
    constant: 'POLICY_INTENT_STATUS_DEAD_CODES',
    deadCodes: ['CONFIRMED', 'CANCELLED'],
    liveCodes: ['DRAFT', 'SUBMITTED', 'CONVERTED_TO_APPLICATION', 'VOIDED'],
  })
})

test('投保单查询状态下拉剔除字典中的历史死码（不得误伤同前缀活码 UNDERWRITING_REJECTED）', async () => {
  // 🔴 缺陷现场：字典 POLICY_APPLICATION_STATUS 并集 11 项 = 写侧 `InsuranceStatusCode` 8 码
  // + 读侧 `PolicyEnum.ProposalStatus` 独有的 3 码。本视图投影同样写入**写侧**枚举
  // （InsuranceProjectionEventHandler 五处 setStatus）。live 实测：`ISSUED` 返回 19 条 = 全量，
  // `PENDING_AUDIT`（待审核）与 `COMPLETED`（已完成）均返回 0 条。
  // 🔴 本页是「剔除死码误伤活码」风险的唯一现场：死码 `REJECTED`（920014「已驳回」）与活码
  // `UNDERWRITING_REJECTED`（920178「核保拒绝」）在字典里并存且互为子串，剔除实现一旦改成前缀/
  // 包含判断，就会把「核保拒绝」这个真实筛选项一并藏掉——故两者一并纳入断言。
  await assertDeadCodeExcluded({
    page: 'policy/application/index.vue',
    dictType: 'POLICY_APPLICATION_STATUS',
    constant: 'POLICY_APPLICATION_STATUS_DEAD_CODES',
    deadCodes: ['PENDING_AUDIT', 'REJECTED', 'COMPLETED'],
    liveCodes: [
      'DRAFT',
      'SUBMITTED',
      'UNDERWRITING',
      'UNDERWRITING_APPROVED',
      'UNDERWRITING_REJECTED',
      'UNDERWRITING_SUSPENDED',
      'ISSUED',
      'VOIDED',
    ],
  })
})

/**
 * `t_dict_data` 的 INSERT 块（本文件用 `INSERT ... SELECT ... FROM (...) seed`，非 VALUES 形态）。
 * 多数种子文件不含字典数据，故「本文件无块」返回空数组、不算失败；「目标字典全库一条都没有」
 * 由调用方断言。
 */
function dictDataBlocks(source) {
  return source.match(/INSERT INTO `t_dict_data`[\s\S]*?;/g) || []
}

/**
 * 单行种子行的解析式：`SELECT '920422' id, 'ACCOUNTING_CLASS' dict_type, 'RISK_PREMIUM' dict_value,`。
 * 首个元组带列别名、后续元组不带，故每个标识符后的别名都是可选的（一并捕获，见下）。
 */
const DICT_DATA_ROW =
  /^\s*SELECT\s+'(\d+)'(?:\s+(\w+))?\s*,\s*'([A-Z_]+)'(?:\s+(\w+))?\s*,\s*'([A-Za-z0-9_-]+)'(?:\s+(\w+))?\s*,\s*'([^']*)'(?:\s+(\w+))?\s*,\s*(\d+)/

/**
 * 跨 admin 域全部种子文件汇总某字典类型的 `dict_value` 集合。
 *
 * <p>🔴 解析失败必须**抛错**而非跳过该行：静默丢行只会让集合变小，而本用例是与枚举对账，
 * 「两侧同步缩小」的假象在这里不会出现（另一侧是 Java 源码）——但丢行仍会让「字典缺值」被
 * 误判成「一致」，故沿用 liquibase-rows.mjs 的硬约束。</p>
 *
 * <p>另按**每块首行自带的列别名**校验「第 3 个字符串确实是 dict_value」：位置是硬编码的，
 * 若将来有人调整元组列序而不同步解析器，就会拿别的列去和枚举对账。别名写在种子行里，
 * 是唯一随数据一起移动的 schema 说明。</p>
 */
async function seedDictValues(dictType) {
  const values = new Set()
  const files = (await readdir(SEED_DIR)).filter((name) => name.endsWith('.sql'))
  for (const name of files) {
    const source = await readFile(join(SEED_DIR, name), 'utf8')
    for (const block of dictDataBlocks(source)) {
      let aliasChecked = false
      for (const line of block.split('\n')) {
        // 跳过两类非数据行：INSERT 的外层投影（`SELECT seed.id, ...`）与幂等守卫
        // （`WHERE NOT EXISTS (SELECT 1 FROM ...)`）
        if (!/^\s*SELECT\b/.test(line) || /^\s*SELECT\s+(seed\.|1\s+FROM)\b/.test(line)) continue
        const matched = line.match(DICT_DATA_ROW)
        if (!matched) {
          throw new Error(`${name}: t_dict_data 行不符合解析器预期（拒绝静默跳过）：${line.trim()}`)
        }
        if (!aliasChecked) {
          if (matched[6] !== 'dict_value') {
            throw new Error(
              `${name}: t_dict_data 元组第 3 个值应别名为 dict_value，实际为 ${matched[6]}（解析器需同步）`,
            )
          }
          aliasChecked = true
        }
        if (matched[3] === dictType) values.add(matched[5])
      }
    }
  }
  return values
}

/** 取 metadata 枚举的 `code` 集合（构造器第 2 参数，即落库值） */
async function enumCodes(enumFile) {
  const path = fileURLToPath(
    new URL(
      `../../titanium-metadata/src/main/java/com/titanium/metadata/enums/pricing/${enumFile}`,
      import.meta.url,
    ),
  )
  const source = await readFile(path, 'utf8')
  const codes = new Set()
  for (const line of source.split('\n')) {
    const matched = line.match(/^\s{4}([A-Z][A-Z0-9_]*)\(\s*\d+\s*,\s*"([A-Za-z0-9_-]+)"\s*,/)
    if (matched) codes.add(matched[2])
  }
  if (!codes.size) throw new Error(`${enumFile}: 未解析到任何枚举常量的 code，解析器需同步`)
  return codes
}

test('精算工作台新字典值域与 metadata 枚举逐条一致（两处清单不得漂移）', async () => {
  // 🔴 比的是**两处独立真源**：Liquibase 种子（前端下拉看到什么）与 metadata 枚举（后端语义）。
  // 二者必须各写一份（字典是 Admin 的展示权威、枚举是业务语义权威），可任一侧加了值另一侧没跟，
  // 就会出现「前端选得到、后端无此码」或「后端有码、前端选不到」——故逐条对账。
  // 不写「计数相等」断言：计数相等恰好掩盖「一侧多一个、另一侧少一个」；也不内联第三份期望清单，
  // 三份清单必然漂移，坏的那份一旦参与比对就再也对不上真源。
  for (const [dictType, enumFile] of [
    ['ACCOUNTING_CLASS', 'AccountingClass.java'],
    ['JURISDICTION', 'Jurisdiction.java'],
  ]) {
    const seeded = [...(await seedDictValues(dictType))].sort()
    const declared = [...(await enumCodes(enumFile))].sort()
    assert.ok(seeded.length, `${dictType} 在 Liquibase 种子里一条都没有`)
    assert.deepEqual(
      seeded,
      declared,
      `${dictType} 字典种子与 ${enumFile} 枚举值域不一致`,
    )
  }
})

test('司法辖区存量值 CN 在新值域内（库内现存唯一值必须可回显）', async () => {
  // 库内 t_product_tax_policy 的 jurisdiction_code 去重后只有 CN（2026-09-21 实查）。
  // 新建枚举不得漏掉它，否则存量策略在列表/详情回显退化成裸码、且编辑时存不回去。
  const declared = await enumCodes('Jurisdiction.java')
  assert.ok(declared.has('CN'), 'Jurisdiction 枚举缺存量唯一值 CN')
  assert.ok((await seedDictValues('JURISDICTION')).has('CN'), 'JURISDICTION 字典缺存量唯一值 CN')
})
