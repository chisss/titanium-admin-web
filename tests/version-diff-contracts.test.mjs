import assert from 'node:assert/strict'
import test from 'node:test'

// 版本差异对比引擎契约（A4：产品/费率/规则版本化 —— 可对比差异、可回滚，满足监管审计）
//
// 形态说明：**行为测试，非源码文本断言**。差异引擎是纯函数，它的错法不会以「崩溃」暴露，
// 而是以「少报一条差异」「多报一堆假差异」暴露——后者更危险：一份被噪声淹没的差异报告，
// 审阅者会直接跳过，等于没有审计。故此处逐条钉住「必须报」与「必须不报」两类行为。
import './ts-resolve-hook.mjs'

const {
  diffRecords,
  diffRowsByKey,
  summarizeDiff,
  summarizeRowDiff,
  formatDiffValue,
  PRODUCT_VERSION_NOISE,
  RATE_TABLE_VERSION_NOISE,
} = await import('../src/utils/versionDiff.ts')

/** 造一个「同一产品两个版本」的最小快照（字段名取自下游 ProductResponse 的真实形状） */
const productVersion = (overrides = {}) => ({
  productId: 'P-2',
  originalProductId: 'P-1',
  productCode: 'LIFE-001',
  productName: '定期寿险',
  version: 'V2.0',
  status: 'DRAFT',
  createTime: '2026-09-21 10:00:00',
  contentHash: 'hash-b',
  pricingBasicRule: { baseRate: 0.012, currency: 'CNY' },
  attachProductIds: ['A-1', 'A-2'],
  ...overrides,
})

test('① 逐字段定位：嵌套字段变更报出完整路径，而非「整个对象变了」', () => {
  const before = productVersion({ pricingBasicRule: { baseRate: 0.012, currency: 'CNY' } })
  const after = productVersion({ pricingBasicRule: { baseRate: 0.015, currency: 'CNY' } })

  const entries = diffRecords(before, after, { ignore: PRODUCT_VERSION_NOISE })

  assert.equal(entries.length, 1, '只应报出真正变动的那一个字段')
  assert.equal(entries[0].path, 'pricingBasicRule.baseRate')
  assert.equal(entries[0].kind, 'CHANGED')
  assert.equal(entries[0].before, 0.012)
  assert.equal(entries[0].after, 0.015)
})

test('② 版本轴字段是噪声：productId/version/status/时间戳/哈希不得进入差异', () => {
  // 两个版本按定义就在这些字段上不同（各自独立聚合、生命周期状态不同、时间戳递增）
  const before = productVersion({ pricingBasicRule: { baseRate: 0.012 } })
  const after = productVersion({ pricingBasicRule: { baseRate: 0.012 } })

  const entries = diffRecords(before, after, { ignore: PRODUCT_VERSION_NOISE })

  assert.deepEqual(entries, [], '配置完全相同即零差异，版本轴字段不得制造噪声')
})

test('③ 数字型字符串不制造假差异（下游 JSON 的数值可能是字符串）', () => {
  const before = productVersion({ pricingBasicRule: { baseRate: '0.012' } })
  const after = productVersion({ pricingBasicRule: { baseRate: 0.012 } })

  assert.deepEqual(diffRecords(before, after, { ignore: PRODUCT_VERSION_NOISE }), [])

  // 但真的不同仍要报出：不能退化成「数值一律忽略」
  const changed = diffRecords(
    productVersion({ pricingBasicRule: { baseRate: '0.012' } }),
    productVersion({ pricingBasicRule: { baseRate: 0.02 } }),
    { ignore: PRODUCT_VERSION_NOISE },
  )
  assert.equal(changed.length, 1)
  assert.equal(changed[0].path, 'pricingBasicRule.baseRate')
})

test('④ 数组保序且整值比较：重排记一条差异，不得按下标展开成 N 条', () => {
  const before = productVersion({ attachProductIds: ['A-1', 'A-2', 'A-3'] })
  const after = productVersion({ attachProductIds: ['A-3', 'A-1', 'A-2'] })

  const entries = diffRecords(before, after, { ignore: PRODUCT_VERSION_NOISE })

  // 顺序在部分业务数组里是有意义的（保全步骤、保障期间），故保序：重排如实记一条
  assert.equal(entries.length, 1, '重排只应产生一条条目，不得按下标展开')
  assert.equal(entries[0].path, 'attachProductIds')
  assert.equal(entries[0].kind, 'CHANGED')

  // 内容真变时同样只报一条，且 before/after 是完整数组（供页面并排展示）
  const changed = diffRecords(
    productVersion({ attachProductIds: ['A-1', 'A-2'] }),
    productVersion({ attachProductIds: ['A-1', 'A-9'] }),
    { ignore: PRODUCT_VERSION_NOISE },
  )
  assert.equal(changed.length, 1)
  assert.deepEqual(changed[0].before, ['A-1', 'A-2'])
  assert.deepEqual(changed[0].after, ['A-1', 'A-9'])
})

test('⑤ 新增与删除字段：一侧整体缺失时按「块」报出，保留块路径', () => {
  const before = productVersion({ waitPeriodDays: 90, remark: '旧备注' })
  const after = productVersion({ remark: '旧备注', surrenderValuePolicy: { mode: 'LINEAR' } })
  delete after.waitPeriodDays

  const entries = diffRecords(before, after, { ignore: PRODUCT_VERSION_NOISE })
  const byPath = Object.fromEntries(entries.map((e) => [e.path, e]))

  assert.equal(byPath.waitPeriodDays.kind, 'REMOVED')
  assert.equal(byPath.waitPeriodDays.before, 90)
  // 整块新增记为块本身（而非递归拆成 surrenderValuePolicy.mode 等叶子）：
  // 审阅者要看的是「多配了一整块配置」，且条目数与真实变更规模成比例
  assert.equal(byPath.surrenderValuePolicy.kind, 'ADDED')
  assert.deepEqual(byPath.surrenderValuePolicy.after, { mode: 'LINEAR' })
  assert.equal(
    entries.some((e) => e.path.startsWith('surrenderValuePolicy.')),
    false,
    '块级差异不得递归展开为叶子条目',
  )
  assert.equal(entries.some((e) => e.path === 'remark'), false, '未变字段不得出现')
})

test('⑥ 空值降噪：新版本才出现的 null/空数组不报差异，但「从有值变空」必须报', () => {
  const before = productVersion({})
  const after = productVersion({ extraConfig: null, emptyList: [] })

  assert.deepEqual(
    diffRecords(before, after, { ignore: PRODUCT_VERSION_NOISE }),
    [],
    '凭空出现的空值不构成证据（下游序列化差异），应降噪',
  )

  const cleared = diffRecords(
    productVersion({ extraConfig: { a: 1 } }),
    productVersion({ extraConfig: null }),
    { ignore: PRODUCT_VERSION_NOISE },
  )
  assert.equal(cleared.length, 1, '从有值变 null 是真实的清空动作，必须报出')
  assert.equal(cleared[0].kind, 'CHANGED')
  assert.equal(cleared[0].after, null)
})

test('⑦ 输出稳定排序：同一对快照多次对比、键序不同，结果必须逐字一致', () => {
  const before = { alpha: 1, beta: 2, gamma: 3 }
  const afterFromDifferentKeyOrder = { gamma: 30, alpha: 10, beta: 2 }

  const entries = diffRecords(before, afterFromDifferentKeyOrder)

  assert.deepEqual(
    entries.map((e) => e.path),
    ['alpha', 'gamma'],
    '差异必须按路径排序输出（否则测试无法断言、审阅者无法对齐阅读）',
  )
})

test('⑧ 忽略列表命中自身与子路径（前缀语义），不误伤同前缀的其它字段', () => {
  const before = { audit: { by: 'u1', at: '10:00' }, auditor: '老李' }
  const after = { audit: { by: 'u2', at: '11:00' }, auditor: '老李' }

  const entries = diffRecords(before, after, { ignore: ['audit'] })

  assert.deepEqual(entries, [], 'audit 及其子路径均被忽略')
  // 「auditor」不是「audit」的子路径（前缀必须带点才算命中）
  const notIgnored = diffRecords({ auditor: '老李' }, { auditor: '老王' }, { ignore: ['audit'] })
  assert.equal(notIgnored.length, 1, '前缀匹配必须以字段边界为界')
})

test('⑨ 费率表行集合：按业务维度键匹配，改一行费率只报一条 changed', () => {
  // rowId 逐版本重新生成（下游每个版本的行各自入库），用它匹配会得出「全删全增」的假结论
  const beforeRows = [
    { rowId: 'r-1', dimensionHash: 'd-30-M', ageFrom: 30, ageToExclusive: 31, gender: 'M', rate: 0.012 },
    { rowId: 'r-2', dimensionHash: 'd-31-M', ageFrom: 31, ageToExclusive: 32, gender: 'M', rate: 0.013 },
  ]
  const afterRows = [
    { rowId: 'r-9', dimensionHash: 'd-30-M', ageFrom: 30, ageToExclusive: 31, gender: 'M', rate: 0.015 },
    { rowId: 'r-8', dimensionHash: 'd-31-M', ageFrom: 31, ageToExclusive: 32, gender: 'M', rate: 0.013 },
  ]

  const keyOf = (row) => row.dimensionHash
  const diff = diffRowsByKey(beforeRows, afterRows, keyOf, { ignore: ['rowId'] })

  assert.equal(diff.added.length, 0, '不得因 rowId 变化判为新增')
  assert.equal(diff.removed.length, 0, '不得因 rowId 变化判为删除')
  assert.equal(diff.changed.length, 1)
  assert.equal(diff.changed[0].key, 'd-30-M')
  assert.deepEqual(diff.changed[0].fields.map((f) => f.path), ['rate'])

  const summary = summarizeRowDiff(diff)
  assert.deepEqual(summary, { added: 0, removed: 0, changed: 1, total: 1 })
})

test('⑩ 费率表行集合：新增/删除行按维度键如实归类（回滚场景的主要差异形态）', () => {
  const rows = (hash, rate) => ({ dimensionHash: hash, rate })
  const diff = diffRowsByKey(
    [rows('d-30-M', 0.012), rows('d-40-M', 0.02)],
    [rows('d-30-M', 0.012), rows('d-50-M', 0.03)],
    (row) => row.dimensionHash,
  )

  assert.deepEqual(diff.added.map((r) => r.dimensionHash), ['d-50-M'])
  assert.deepEqual(diff.removed.map((r) => r.dimensionHash), ['d-40-M'])
  assert.equal(diff.changed.length, 0)
  assert.deepEqual(summarizeRowDiff(diff), { added: 1, removed: 1, changed: 0, total: 2 })
})

test('⑪ 汇总计数：ADDED/REMOVED/CHANGED 分类准确，total 为三者之和', () => {
  const summary = summarizeDiff([
    { path: 'a', kind: 'ADDED', before: undefined, after: 1 },
    { path: 'b', kind: 'CHANGED', before: 1, after: 2 },
    { path: 'c', kind: 'REMOVED', before: 3, after: undefined },
    { path: 'd', kind: 'CHANGED', before: 4, after: 5 },
  ])

  assert.deepEqual(summary, { added: 1, removed: 1, changed: 2, total: 4 })
})

test('⑫ 差异值渲染：四种「空」必须两两可辨，否则真实的空值变更会显示成两列相同', () => {
  // 审计视图里四种空含义完全不同：从未配置 / 未赋值 / 被写成空串 / 明确配了空列表
  assert.equal(formatDiffValue(undefined), '（无此字段）')
  assert.equal(formatDiffValue(null), '—')
  assert.equal(formatDiffValue(''), '（空字符串）')
  assert.equal(formatDiffValue([]), '（空列表）')
  assert.equal(formatDiffValue(['A-1', 'A-2']), 'A-1、A-2')
  assert.equal(formatDiffValue(0), '0', '数值 0 是有效值，不得被当成空')

  // 🔴 null 与 '' 是两个不同的 JSON 值，渲染必须能区分。实测命中：产品 V2A-LIFE-001 的
  //    insureCondition.healthNotice 在 V1.0 为 null、V2.0 为 ''，若都渲染成 —，差异表里
  //    这一行会显示成「— → —」，即一个自称「变更」却两列一模一样的「幽灵差异行」。
  assert.notEqual(formatDiffValue(null), formatDiffValue(''), '两种空渲染成同一文本即失去审计意义')
})

test('⑫b 空值变更必须真的进入差异表，且两列渲染不同', () => {
  // 引擎口径：null 与 '' 判为不等（不像 "12.5" 与 12.5 那样同义判等）——
  // 审计口径是「宁可多一行噪声也不要少一条证据」，不得为消噪把它判成「无差异」
  const entries = diffRecords({ healthNotice: null }, { healthNotice: '' })

  assert.equal(entries.length, 1, '空值从 null 变为空串是一条真实的值变更')
  assert.equal(entries[0].kind, 'CHANGED')
  assert.equal(entries[0].path, 'healthNotice')
  assert.notEqual(formatDiffValue(entries[0].before), formatDiffValue(entries[0].after))
})

test('⑬ 费率表噪声清单不包含 rows —— 行明细是费率版本对比的全部内容', () => {
  // 🔴 反向断言：若有人把 rows 加进噪声清单，费率版本对比会变成永远「零差异」的空壳，
  //    而它仍然全绿通过（不报错的空结果）。故在此钉死。
  assert.equal(RATE_TABLE_VERSION_NOISE.includes('rows'), false)

  const before = { tableId: 't-1', tableVersion: '1', status: 'PUBLISHED', rows: [{ dimensionHash: 'd', rate: 0.01 }] }
  const after = { tableId: 't-2', tableVersion: '2', status: 'DRAFT', rows: [{ dimensionHash: 'd', rate: 0.02 }] }

  const entries = diffRecords(before, after, { ignore: RATE_TABLE_VERSION_NOISE })

  assert.equal(entries.length, 1, '版本轴字段被忽略后，剩下的唯一差异就是行内容')
  assert.equal(entries[0].path, 'rows')
  assert.equal(entries[0].kind, 'CHANGED')
})

test('⑬b 出货的费率噪声清单必须真的过滤 rowId —— 用生产清单验，不用测试自带的', () => {
  // 🔴 本用例用 RATE_TABLE_VERSION_NOISE 本身，而不是本地内联的 ['rowId']：
  //    ⑦ 号用例用的是内联清单，它只证明「引擎在被告知忽略 rowId 时不报它」，
  //    却证明不了「出货的清单里确实有 rowId」——而这恰恰是线上出问题的地方：
  //    清单缺 rowId 时，每条变更行都会附一条「rowId f4e03d53… → 6db069fe…」的假差异，
  //    把「费率 0.0012 → 0.0015」这条关键证据淹掉，而 ⑦ 依然全绿。
  assert.ok(RATE_TABLE_VERSION_NOISE.includes('rowId'), 'rowId 逐版本重新生成，必须列入噪声清单')
  // 反向：dimensionHash 是行匹配键，列进噪声清单等于把配对依据也当成差异
  assert.equal(RATE_TABLE_VERSION_NOISE.includes('dimensionHash'), false)

  const beforeRows = [{ rowId: 'f4e03d53', dimensionHash: 'h-M', rate: 0.0012, maximumPremium: 1000000 }]
  const afterRows = [{ rowId: '6db069fe', dimensionHash: 'h-M', rate: 0.0015, maximumPremium: null }]

  const diff = diffRowsByKey(beforeRows, afterRows, (row) => row.dimensionHash, {
    ignore: RATE_TABLE_VERSION_NOISE,
  })

  assert.equal(diff.changed.length, 1)
  assert.deepEqual(
    diff.changed[0].fields.map((f) => f.path),
    ['maximumPremium', 'rate'],
    '变更行的字段里不得出现 rowId（每个版本的行都重新生成它）',
  )
})
