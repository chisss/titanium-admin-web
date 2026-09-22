import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

// 「产品」列降级契约（🔴 R9-F01）
//
// 现场：数据看板「最新保单」表 5 行的产品列**全空**。
// 根因不在数据也不在后端：保单**列表**读模型 `t_policy_view` 只有 product_code / product_id，
// **没有 product_name** —— 产品名只在详情路径由 `PolicyQueryServiceImpl.enrichDetail` 装配，
// 该处源码明写「仅详情查询执行，避免列表查询产生 N+1」（拿列表接口补名字要按行查险种段视图）。
// 故凡消费**保单列表**响应渲染产品的列，都必须自带降级链（productName → productCode → '-'）。
// 同域正例：`policy/list` 同列一直是这么写的；dashboard 是唯一漏网处（R9 实测）。
//
// 形态说明：源码文本断言。该缺陷运行期表现为「单元格空白」——既不报错、也不触发任何失败态，
// 且组件树里 prop 绑定与数据都在，只有**渲染结果**为空，故必须锁模板结构。
//
// 🔴 扫描前必须剔 HTML 注释：`<!-- -->` 与 `//` 是两套语法，只剥 JS 注释时，
// 被注释掉的整块模板仍会被扫到 ⇒ 断言恒绿（用户级 lessons 已实测过这一形态）。
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')

/** 递归收集 src/views 下全部 .vue 页面 */
async function collectViews(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir)
    if (entry.isDirectory()) files.push(...(await collectViews(full)))
    else if (entry.name.endsWith('.vue')) files.push(full)
  }
  return files
}

/**
 * 渲染保单列表响应的视图 ⇒ 产品列必须在模板内降级。
 * 新增视图消费保单列表且渲染产品时，**必须**登记到此处，由用例 ① 强制。
 *
 * 🔴 三处是同一条判断的副本（R9 取证时 policy/list 与 customer/detail 即为正例）：
 * 有意**不做 DRY 收敛**——那要改动两处与本次缺陷无关的正确代码，扩大回归面；
 * 改由用例 ② 对每一处逐一断言同一个表达式，漂移即红。
 */
const POLICY_LIST_CONSUMERS = {
  'src/views/dashboard/index.vue': '最新保单表：getPolicyList 首页数据（本次修复对象）',
  'src/views/policy/list/index.vue': '保单列表：getPolicyList（正例）',
  'src/views/customer/detail/index.vue': '客户详情的保单表：listPoliciesByCustomer（另一入口、同一读模型，正例）',
}

/**
 * 数据源本身带产品名的视图 ⇒ 无需降级（逐条给出依据，不接受无依据豁免）。
 */
const EXEMPT_WITH_REASON = {
  'src/views/product/list/index.vue': '产品列表接口的产品读模型自身含 product_name，与该缺陷不同源',
}

/** 取出所有 el-table-column 块（含其 `<template #default>` 插槽内容） */
function columnBlocks(source) {
  return source.match(/<el-table-column\b[\s\S]*?(?:\/>|<\/el-table-column>)/g) ?? []
}

test('① 每一个渲染 productName 的列都必须被登记（新页面漏登记即失败）', async () => {
  const views = await collectViews(new URL('../src/views/', import.meta.url))
  const classified = new Set([...Object.keys(POLICY_LIST_CONSUMERS), ...Object.keys(EXEMPT_WITH_REASON)])
  const unclassified = []
  const seen = new Set()
  for (const file of views) {
    const key = `src/views/${file.pathname.split('/src/views/')[1]}`
    const source = stripComments(await readFile(file, 'utf8'))
    if (!columnBlocks(source).some((block) => /prop="productName"/.test(block))) continue
    seen.add(key)
    if (!classified.has(key)) unclassified.push(key)
  }
  assert.deepEqual(
    unclassified,
    [],
    `以下视图渲染了 productName 列但未登记：${unclassified.join(', ')}\n` +
      '若其数据源是**保单列表**，必须加降级链并登记进 POLICY_LIST_CONSUMERS；否则登记进 EXEMPT_WITH_REASON 并写明依据',
  )
  // 登记表不得留死条目（文件改名/删除后必须同步，否则契约会静默空转）
  const stale = [...classified].filter((key) => !seen.has(key))
  assert.deepEqual(stale, [], `以下登记项已不存在对应列，请清理：${stale.join(', ')}`)
})

test('② 保单列表消费方的产品列必须有 productName → productCode → "-" 降级链', async () => {
  for (const [key, reason] of Object.entries(POLICY_LIST_CONSUMERS)) {
    const source = stripComments(
      await readFile(new URL(`../${key}`, import.meta.url), 'utf8'),
    )
    const blocks = columnBlocks(source).filter((block) => /prop="productName"/.test(block))
    assert.equal(blocks.length, 1, `${key} 应恰好有 1 个 productName 列（${reason}）`)
    assert.match(
      blocks[0],
      /row\.productName\s*\|\|\s*row\.productCode\s*\|\|\s*'-'/,
      `${key} 的产品列缺少降级链：保单列表读模型没有 product_name，只绑 prop 会渲染成空白单元格`,
    )
    // 弹性列须有下限，否则内容短时该列独吞剩余宽度（与同族列口径不一致）
    assert.match(blocks[0], /min-width="\d+"/, `${key} 的产品列缺少 min-width 下限`)
  }
})
