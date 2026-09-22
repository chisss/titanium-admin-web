import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import { SEED_DIR, sqlRows } from './liquibase-rows.mjs'

// 理赔状态取色单一真源守卫（🔴 R10-07 / 用户点名 R9-F06）
//
// 现场：`claim/detail` 的「赔付状态」原是一行内联三元自己配色 ——
// `paymentStatus === 'PROCESSING' ? 'warning' : paymentStatus === 'SUCCESS' ? 'success' : 'info'`。
// 而 `ClaimEnum.PaymentStatus` 有 **5** 个码：逐码对账下来，`FAILED`（赔付失败）与
// `REJECTED_CLOSED`（拒赔结案）在 `TiStatusTag.COLOR_MAP` 里是 danger，却被那个 `: 'info'`
// 一并吞成灰底 —— 两个**负向终态**在页面上与「结案」毫无区别，而 COLOR_MAP 里那两条 danger
// 在本页**永远不生效**。这不是「缺映射」，是**同一判断写了两份、渲染走了错的那份**，
// 故修法是删掉第二份而不是补颜色（补颜色只会让两份继续漂移）。
//
// 守卫钉三处，各自可独立触发：
//   ① **三真源对账**：后端枚举（ClaimEnum.PaymentStatus）＝ 字典启用码 ⊆ 色表。
//      色表少一个码 ⇒ 该码在**全站**都渲染成中性灰（TiStatusTag 的 `|| 'info'` 兜底，见
//      tagType 实现），页面上看不出任何异常 —— 只能靠对账发现。
//      字典少一个码 ⇒ 前端回显拿不到中文、筛选选不到该状态。
//   ② 页面只允许把值**交给** TiStatusTag，不得再写第二份局部色表。
//   ③ 页面里每一处 `paymentStatus` 用法都经人工裁示（登记制）：新增用法即失败待判，
//      因为「新增一处取色」正是 F-06 的复发形态。
//
// 🔴 判据取**独立真源互比**（Java 枚举 / Liquibase 种子 / 组件色表），不内联期望码清单：
//    内联一份「正确的 5 码」，就变成三份清单互相比对，坏的那份一旦参与比对就再也对不上真源。
//
// ⚠️ 举一反三查证（2026-09-22，结论**不成立**，记下来免得下一个人重判一遍）：`CLAIM_STATUS`
//    的字典**静态文本**里同时有旧状态机（REPORTED / INVESTIGATING / APPROVING / SETTLED /
//    REJECTED，来自 admin_init_202507191000_seed）与新六态，粗看是「字典 10 码 > 后端
//    `ClaimStatus` 6 码 ⇒ 筛选下拉里 4 个码永不命中」。实为**文本并集假象**：六态收敛与删除
//    写在同一个变更集里（admin_claim_dict_202609031600，`runOnChange:true`，
//    `DELETE FROM t_dict_data … dict_type IN (…)` 后再全量 INSERT），运行时该字典就是 6 码
//    = 后端枚举，**没有死码、无需剔除**。对照 `POLICY_STATUS` 是真并存、真死码，已在
//    dictionary-contracts.test.mjs 处置 —— 两者形态相同、结论相反，判据只能是
//    「该 dict_type 有没有被某个变更集的 DELETE 接管」（本文件 seededCodes 按此实现）。
//    ⚠️ 本条**未做 live 库复核**（MySQL MCP 指向的是另一套库、无钛库凭据；:8888 需登录），
//    依据是变更集语义（DELETE + runOnChange）本身。

const DETAIL = new URL('../src/views/claim/detail/index.vue', import.meta.url)
const LIST = new URL('../src/views/claim/list/index.vue', import.meta.url)
const TI_STATUS_TAG = new URL('../src/components/TiStatusTag/index.vue', import.meta.url)
/** 跨仓读取：本仓是 <root>/titanium-admin-web，后端语义真源在 <root>/titanium-metadata 与 <root>/titanium-claim */
const CLAIM_ENUM = new URL(
  '../../titanium-metadata/src/main/java/com/titanium/metadata/enums/claim/ClaimEnum.java',
  import.meta.url,
)
const CLAIM_CONSTANTS = new URL(
  '../../titanium-claim/titanium-claim-common/src/main/java/com/titanium/claim/common/constant/ClaimConstants.java',
  import.meta.url,
)

/**
 * 剥注释后再扫描。🔴 必须连 HTML 注释 `<!-- -->` 一起剥（用户级 lessons：模板注释是独立的一种，
 * 只剥 `//` 与 `/* *​/` 仍会命中注释里的文本 ⇒ 断言恒绿）。本文件与源文件的注释里写满了
 * `paymentStatus`、`'info'` 字样（F-06 的现场说明就在页面注释里），不剥注释这几条断言必然恒绿。
 */
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')

/** 花括号配平地取 `NAME … = { … }` 的对象体（不按 `}` 直接切：对象可嵌套） */
function objectLiteral(source, name) {
  const at = source.indexOf(name)
  assert.notEqual(at, -1, `未找到 ${name}`)
  const open = source.indexOf('{', at)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return assert.fail(`${name} 对象体未闭合`)
}

/** 解析 `CODE: 'value',` 形态的字符串映射（剔注释 ⇒ 被注释掉的那一行不算数） */
function stringMap(source, name) {
  const map = new Map()
  for (const m of stripComments(objectLiteral(source, name)).matchAll(
    /(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'([a-z]+)'\s*,?/g,
  )) {
    map.set(m[1], m[2])
  }
  return map
}

/**
 * 取外层类里某个嵌套枚举的**码集合**（`PROCESSING(1, "PROCESSING", "赔付中"),` 取第二个字符串，
 * 即落库/序列化用的那个）。
 *
 * <p>🔴 必须先切出该枚举的块再解析：`ClaimEnum` 里还有 `ClaimType` 等嵌套枚举，全文扫描会把
 * 它们的码一并算进来 —— 那样「枚举码 = 字典码」这条对账就成了拿错的域去比，且**比错时看起来
 * 完全正常**（两侧都变多）。块的边界用「下一个 4 空格缩进的 `}`」界定（嵌套枚举的常量在 8 空格级），
 * 并断言块内只有一个 `enum` 关键字，防止边界漂移后静默把两个枚举合并。</p>
 */
function nestedEnumCodes(source, name) {
  const at = source.search(new RegExp(`\\benum\\s+${name}\\b`))
  assert.notEqual(at, -1, `ClaimEnum 里找不到嵌套枚举 ${name}`)
  const end = source.indexOf('\n    }', at)
  assert.notEqual(end, -1, `${name} 枚举体未闭合，解析器需同步`)
  const block = stripComments(source.slice(at, end))
  assert.equal(
    (block.match(/\benum\s/g) ?? []).length,
    1,
    `${name} 块边界不对（块内不止一个 enum），解析器需同步 —— 否则会把两个枚举的码合并成一份`,
  )

  const codes = new Set()
  for (const m of block.matchAll(/([A-Z][A-Z0-9_]*)\(\s*\d+\s*,\s*"([A-Za-z0-9_-]+)"\s*,/g)) {
    assert.equal(m[1], m[2], `枚举常量名 ${m[1]} 与其码值 ${m[2]} 不一致，解析器需同步`)
    codes.add(m[2])
  }
  assert.ok(codes.size >= 5, `${name} 只解析到 ${codes.size} 个码，解析器需同步`)
  return codes
}

/**
 * 取 `XxxConstants` 里某个前缀的码集合（`CLAIM_STATUS_PENDING = "PENDING";` 取**引号里的值**）。
 * 值必须是带引号的大写码字面量 —— 同前缀的 `CLAIM_STATUS_CHANGED = CrossDomainTopics.…`
 * 是主题常量、不是状态码，靠这一点排除（只匹配 `= "…"` 形态）。
 */
function prefixedConstants(source, prefix) {
  const codes = new Set()
  for (const m of stripComments(source).matchAll(
    new RegExp(`${prefix}([A-Z0-9_]+)\\s*=\\s*"([A-Za-z0-9_-]+)"`, 'g'),
  )) {
    assert.equal(m[1], m[2], `常量 ${prefix}${m[1]} 与其码值 ${m[2]} 不一致，解析器需同步`)
    codes.add(m[2])
  }
  assert.ok(codes.size >= 6, `${prefix}* 只解析到 ${codes.size} 个码，解析器需同步`)
  return codes
}

/**
 * 跨全部种子文件汇总某字典类型的**启用**（status='0'）码集合。
 *
 * <p>🔴 必须扣除被「先删后插」变更集接管的行。本仓收敛字典的写法是
 * `DELETE FROM t_dict_data WHERE tenant_id='1' AND dict_type IN (…)` 后全量 INSERT
 * （`runOnChange:true`，见 admin_claim_dict_202609031600）—— **静态文本里新旧两版的行同时存在**，
 * 直接并集会把「已被删除的旧状态机」当成现行值，于是「字典比枚举多 4 个码」这种
 * **只存在于文档里的差集**会被报成缺陷。判据：某 dict_type 被哪个文件的 DELETE 接管，
 * 就以那个文件的 INSERT 行为准；并断言只被一个文件接管（多于一个则接管顺序不可知）。</p>
 */
async function seededCodes(dictType) {
  const files = (await readdir(SEED_DIR)).filter((name) => name.endsWith('.sql'))
  const parsed = []
  for (const name of files) {
    const source = await readFile(join(SEED_DIR, name), 'utf8')
    const owns = [...source.matchAll(/DELETE\s+FROM\s+`t_dict_data`[^;]*/g)].some((m) =>
      m[0].includes(`'${dictType}'`),
    )
    parsed.push({ name, owns, rows: sqlRows(source, 't_dict_data', name) })
  }

  const owners = parsed.filter((f) => f.owns).map((f) => f.name)
  assert.ok(
    owners.length <= 1,
    `${dictType} 被多个种子文件的 DELETE 接管（${owners.join('、')}），接管顺序不可知，解析器需同步`,
  )

  const codes = new Set()
  for (const file of parsed) {
    if (owners.length === 1 && !file.owns) continue
    for (const row of file.rows) {
      if (row.dict_type === dictType && row.status === '0') codes.add(row.dict_value)
    }
  }
  assert.ok(codes.size >= 3, `${dictType} 字典只解析到 ${codes.size} 个启用码，解析器需同步`)
  return codes
}

/**
 * 模板里出现 `paymentStatus` 的**属性值**集合（剔注释、归一空白）。
 * 只取属性值不取整行：整行会把 `<!-- … -->` 之外的行内文案也算进来，而归一空白后逐字比对
 * 才能让「新增一处取色」必须经过人工裁示。
 *
 * <p>调用方须先剥 HTML 注释：**注释掉的旧三元不是一处用法**，纳入比对就会把「注释掉以停用」
 * 这种正当改法判红（用户级 lessons：模板注释是独立的一种，且这里的方向是误报而非漏判）。</p>
 */
function paymentStatusBindings(template) {
  const values = new Set()
  for (const m of template.matchAll(/[:\w@.[\]-]+="([^"]*)"/g)) {
    if (!m[1].includes('paymentStatus')) continue
    values.add(m[1].replace(/\s+/g, ' ').trim())
  }
  return [...values].sort()
}

/**
 * 只剥 HTML 注释。🔴 不复用上面的 `stripComments`：它按 `//` 截行，而模板里
 * `<a href="http://…">` 这类属性值中就有 `//`，会把该行后半段整段吃掉。
 */
const htmlComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '')

const [detailRaw, listRaw, tagRaw, enumRaw, constantsRaw] = await Promise.all([
  readFile(DETAIL, 'utf8'),
  readFile(LIST, 'utf8'),
  readFile(TI_STATUS_TAG, 'utf8'),
  readFile(CLAIM_ENUM, 'utf8'),
  readFile(CLAIM_CONSTANTS, 'utf8'),
])
const detail = stripComments(detailRaw)
const list = stripComments(listRaw)
/** 根模板的完整标记：首个 `<template>` 到**最后**一个 `</template>`（嵌套 template 的闭标签在更早处） */
const template = htmlComments(
  detailRaw.slice(detailRaw.indexOf('<template>'), detailRaw.lastIndexOf('</template>')),
)
const colorMap = stringMap(tagRaw, 'const COLOR_MAP')

test('① 理赔状态三真源对账：后端枚举码 ＝ 字典启用码，且每个码在色表里都有语义色', async () => {
  // 登记表：dict_type ⟷ 后端码源（两种形态：metadata 嵌套枚举 / claim-common 常量前缀）。
  // 新增一个状态字段即在此登记一行，两侧真值自动对账。
  const registry = [
    {
      dictType: 'CLAIM_PAYMENT_STATUS',
      title: '赔付状态',
      declared: nestedEnumCodes(enumRaw, 'PaymentStatus'),
    },
    {
      dictType: 'CLAIM_STATUS',
      title: '案件状态',
      declared: prefixedConstants(constantsRaw, 'CLAIM_STATUS_'),
    },
  ]

  // 覆盖量下限：色表解析口径若失效（表被改写、被注释掉），下面的逐码断言会退化成空比空
  assert.ok(colorMap.size >= 60, `COLOR_MAP 只解析到 ${colorMap.size} 个键，解析器需同步`)

  for (const { dictType, title, declared } of registry) {
    const seeded = await seededCodes(dictType)

    // 两侧各取真值互比（不是「计数相等」——计数相等恰好掩盖「一侧多一个、另一侧少一个」）：
    // 字典多一个 ⇒ 下拉/回显多出一个读侧永不产生的死码；字典少一个 ⇒ 前端拿不到该状态的中文
    assert.deepEqual(
      [...seeded].sort(),
      [...declared].sort(),
      `${dictType}（${title}）字典启用码与该状态的后端码源不一致：`
        + '字典多的码是读侧永不产生的死码，字典少的码在前端回显/筛选里缺失',
    )

    for (const code of declared) {
      assert.ok(
        colorMap.has(code),
        `${dictType} 的 ${code} 在 TiStatusTag.COLOR_MAP 里没有条目 ⇒ 全站都渲染成中性灰`
          + '（tagType 的 `|| \'info\'` 兜底），负向终态会看起来与「结案」无区别',
      )
    }
  }
})

test('② 赔付状态渲染只走 TiStatusTag，不得第二份局部色表（F-06 的正题）', async () => {
  // 单源渲染 + 文案来自字典（域内语义最准；STATUS_TEXT 兜底表里 FAILED='失败'、CLOSED='已关闭'
  // 都与字典文案不同，故 label 必须显式传）
  assert.match(
    detail,
    /<TiStatusTag\s+:value="claim\.paymentStatus"\s+:label="paymentStatusLabel\(claim\.paymentStatus\)"\s*\/>/,
    '赔付状态须由 TiStatusTag 渲染并显式传字典文案（形如 `<TiStatusTag :value="…" :label="…Label(…)" />`）',
  )
  assert.match(
    detail,
    /const \{ getLabel: paymentStatusLabel \} = useDict\('CLAIM_PAYMENT_STATUS'\)/,
    '文案真源须是 CLAIM_PAYMENT_STATUS 字典（域内语义最准，兜底表会把它说错）',
  )

  // 第二份色表：任何 `:type` 绑定都不许拿 paymentStatus 取色
  const colorBindings = [...detail.matchAll(/:type="[^"]*"/g)].map((m) => m[0])
  assert.ok(
    colorBindings.length >= 1,
    '文件里一个 `:type` 绑定都没有，本断言的扫描口径已失效（空集恒绿）',
  )
  const offenders = colorBindings.filter((binding) => binding.includes('paymentStatus'))
  assert.deepEqual(
    offenders,
    [],
    `赔付状态不得再写局部色表（F-06 复发形态）：${offenders.join('、')}\n`
      + '全仓状态色的唯一真源是 TiStatusTag.COLOR_MAP，页面侧只允许把值交给它',
  )
})

test('③ 模板里每一处 paymentStatus 用法都经裁示（新增用法即失败待判）', async () => {
  const actual = paymentStatusBindings(template)
  // 登记项 = 已人工裁示过的用法。逐条给出角色，避免「再出现一个同文本」被蒙混过关。
  const registered = [
    'claim && claim.paymentStatus === \'PROCESSING\'', // 条件显示（非取色）：赔付中才展示提示条
    'claim.paymentStatus', // TiStatusTag 的 :value
    'paymentStatusLabel(claim.paymentStatus)', // TiStatusTag 的 :label
    // 以及 v-if="claim.paymentStatus"（同上，属性值同形，已归一去重）
  ].sort()

  assert.deepEqual(
    actual,
    registered,
    '模板里 paymentStatus 的用法发生了变化，须人工裁示后再更新登记：\n'
      + `  实际：${actual.join('、')}\n  登记：${registered.join('、')}\n`
      + '新增用法最可能的形态就是又一处取色（`:type="… paymentStatus …"`）——即 F-06 的复发',
  )
})

test('④ 案件状态列在列表页与详情页同款（同一字典、同一渲染路径）', async () => {
  // 赔付状态是「同一个值在详情页被写成第二份色表」；案件状态则是**同一字典在列表页已经走对了**。
  // 两侧写成同款，才不会出现「列表页有色、详情页没色」这类只在一个页面出现的漂移。
  // 允许节点前带 `v-if="claim"`（详情页是加载后才有值，`v-if` 与取色无关故不约束其内容）
  const tagRe =
    /<TiStatusTag(?:\s+v-if="[^"]*")?\s+:value="(?:row|claim)\.status"\s+:label="claimStatusLabel\((?:row|claim)\.status\)"\s*\/>/
  for (const [where, source] of [['claim/list', list], ['claim/detail', detail]]) {
    assert.match(
      source,
      tagRe,
      `${where} 的案件状态须由 TiStatusTag 渲染并显式传字典文案`,
    )
    assert.match(
      source,
      /const \{ (?:dictOptions: claimStatusOptions, )?getLabel: claimStatusLabel \} = useDict\('CLAIM_STATUS'\)/,
      `${where} 的案件状态文案真源须是 CLAIM_STATUS 字典`,
    )
  }

  // 列表页的筛选下拉同样取自该字典 —— 字典=枚举（见文件头举一反三备注）故无需剔除死码；
  // 但若哪天字典里真出现死码，这条会与 ① 的对账一起报出来
  assert.match(
    list,
    /<el-option v-for="opt in claimStatusOptions" :key="opt\.value" :label="opt\.label" :value="opt\.value" \/>/,
    'claim/list 的案件状态筛选项须由字典驱动（不得就地罗列码）',
  )
})
