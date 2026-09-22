import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

import { loadSFC, renderSFC, stubComponent, findNode, mountComposable } from './sfc-render.mjs'

// 表格失败态契约（🔴 R7-13）
//
// 缺陷现场：接口 500 时 `tableData` 被清成 []，TiTable 照常渲染「暂无数据」——
// 界面向用户断言「系统里没有这类数据」，而真相是这次没查成。二者在屏幕上完全同形。
// 全局 toast 不构成兜底：它是瞬时的，而那句「暂无数据」是持久的。
//
// 基础设施（useTable 的 tableError / TiTable 的 :error + 重试按钮）在 D-07/D-06 已就绪，
// 但**使用侧一个都没接**——本文件守的正是这条「基础设施齐备却无人调用」的断层：
// 它不产生任何报错、任何 console 警告，UI 上也看不出异常，只能靠结构性断言钉住。

const { useTable, useTableError } = await import('../src/composables/useTable.ts')

const TiTable = await loadSFC(
  new URL('../src/components/TiTable/index.vue', import.meta.url).pathname,
  'titable-errorstate',
)

const STUBS = [
  stubComponent('el-table', { data: Array, stripe: Boolean, border: Boolean }),
  stubComponent('el-pagination'),
  // 🔴 loading 必须按 Boolean 声明：否则 `:loading` 会以属性字符串形态出现，
  // 量到的是 'true' 而非解析后的布尔值（同 ti-table-contracts 里 stripe 的那处坑）
  stubComponent('el-button', { loading: Boolean, size: String, type: String, plain: Boolean }),
  stubComponent('el-empty'),
  stubComponent('el-icon'),
]

/**
 * 引号感知地取出每个 `<TiTable>` 开标签的标签体。
 * 不能简单按 `>` 切——属性值里可能出现 `=>`（内联箭头函数）。
 */
function tiTableTags(source) {
  const tags = []
  let cursor = 0
  for (;;) {
    const start = source.indexOf('<TiTable', cursor)
    if (start === -1) break
    let quote = null
    let end = -1
    for (let i = start; i < source.length; i++) {
      const c = source[i]
      if (quote) {
        if (c === quote) quote = null
        continue
      }
      if (c === '"' || c === "'") quote = c
      else if (c === '>') { end = i; break }
    }
    assert.notEqual(end, -1, `<TiTable> 开标签未闭合（偏移 ${start}）`)
    // 自闭合标签无子节点，本仓不存在，出现即说明形态变了，断言暴露而不是静默跳过
    assert.notEqual(source[end - 1], '/', '<TiTable> 出现自闭合形态，扫描口径需更新')
    tags.push(source.slice(start, end))
    cursor = end
  }
  return tags
}

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
 * 失败态归**页面级**（el-alert + 重试）而非表级的使用点白名单。
 * 🔴 每条必须写明理由，且理由要能被复核；白名单是「已确认的有意例外」，不是「懒得接」。
 */
const PAGE_LEVEL_EXEMPT = new Map([
  [
    'src/views/maintenance/workbench/index.vue',
    '流程任务表与页面共用同一份 load()，故障时整个案件详情都没取到，失败态归页面级；表内数据非独立可取',
  ],
])

test('① 全站每个 TiTable 都成对接上 :error 与 @refresh（缺一即失效）', async () => {
  const views = await collectViews(new URL('../src/views/', import.meta.url))
  const missing = []
  let instanceCount = 0

  for (const file of views) {
    const source = await readFile(file, 'utf8')
    const rel = file.pathname.replace(/^.*\/src\//, 'src/')
    const tags = tiTableTags(source)
    if (!tags.length) continue
    if (PAGE_LEVEL_EXEMPT.has(rel)) continue

    for (const [index, tag] of tags.entries()) {
      instanceCount += 1
      const hasError = /:error\s*=/.test(tag)
      const hasRefresh = /@refresh\s*=/.test(tag)
      if (!hasError || !hasRefresh) {
        missing.push(`${rel} 第 ${index + 1} 个 TiTable（:error=${hasError} @refresh=${hasRefresh}）`)
      }
    }
  }

  // 覆盖量下限：TiTable 实例数若因重构骤降，说明扫描口径失效（测空集恒真）
  assert.ok(instanceCount >= 30, `扫描到的 TiTable 实例仅 ${instanceCount} 个，口径疑似失效`)
  assert.deepEqual(missing, [], `以下 TiTable 未成对接上失败态：\n  ${missing.join('\n  ')}`)

  // 🔴 为何必须成对：错误块里的「重试」按钮是 emit('refresh')。只接 :error 会渲染出一个
  // 点了没有任何反应的按钮——比不接更难排查（看起来功能是有的）。
  assert.ok(
    PAGE_LEVEL_EXEMPT.size <= 3,
    `页面级豁免增至 ${PAGE_LEVEL_EXEMPT.size} 处，除非新增处同样有独立理由，否则应接表级失败态`,
  )
})

test('② 重试按钮在途给出反馈（失败态与表格互斥渲染，否则点了界面纹丝不动）', async () => {
  const render = (props) =>
    renderSFC(TiTable, { props: { data: [], total: 0, ...props }, slots: { default: () => [] }, stubs: STUBS })

  const idle = await render({ error: new Error('接口 500') })
  const idleBtn = findNode(idle, (n) => n.tag === '<el-button>')
  assert.equal(idleBtn.props.loading, false, '非在途时重试按钮不应转圈')

  const retrying = await render({ error: new Error('接口 500'), loading: true })
  const retryBtn = findNode(retrying, (n) => n.tag === '<el-button>')
  assert.equal(retryBtn.props.loading, true, '重试在途时按钮须转圈，否则用户无从判断是否点上了')
})

test('③ useTableError：失败归一任意形态，成功清错', async () => {
  const state = await mountComposable(() => useTableError())

  assert.equal(state.tableError.value, null, '初始无错')

  // 拦截器 reject 的不一定是 Error —— 可能是后端原始字符串。若原样塞进失败态，
  // 消费方 `error.message` 取到 undefined，失败块渲染成一片空白（比不显示更迷惑）
  state.setTableError('下游超时')
  assert.ok(state.tableError.value instanceof Error, '非 Error 值必须归一为 Error')
  assert.equal(state.tableError.value.message, '下游超时', '须保留原始文案，不可吞成通用兜底')

  // 空字符串/空对象同样要给出可读文案，不能渲染成空失败块
  state.setTableError('')
  assert.match(state.tableError.value.message, /\S/, '空值归一后仍须有可读文案')

  state.clearTableError()
  assert.equal(state.tableError.value, null, '成功路径须能清掉失败态')
})

test('④ useTable：失败态不会永久卡住——重试成功后必须清掉（清错位置写错即失效）', async () => {
  // 🔴 本用例钉的是那条最易写错的分支：若把清错写进 `finally`，失败路径也会经过它，
  // 刚置上的错误会被立刻抹掉，失败态**永远不显示**——而「重试后再置错」这类回归
  // 只有「失败 → 成功」这个序列才抓得住，单测失败分支是抓不到的。
  let shouldFail = true
  const table = await mountComposable(() =>
    useTable(async () => {
      if (shouldFail) throw new Error('下游服务不可用')
      return { list: [{ id: 'P1' }], total: 1 }
    }),
  )

  assert.ok(table.tableError.value, '首屏失败须落成失败态')
  assert.match(table.tableError.value.message, /下游服务不可用/, '须保留真实原因')
  assert.deepEqual(table.tableData.value, [], '失败须清空上一次的数据，避免「旧数据 + 新错误」')
  assert.equal(table.pagination.total, null, '失败时总数未知，不得留给旧值去渲染对不上的分页条')
  assert.equal(table.tableLoading.value, false, '失败路径同样要关 loading，否则重试按钮永远转圈')

  shouldFail = false
  await table.fetchData()
  assert.equal(table.tableError.value, null, '重试成功后失败态必须清掉')
  assert.equal(table.tableData.value.length, 1, '重试成功后须渲染新数据')
  assert.equal(table.tableLoading.value, false)
})

// ───────────────────────── ⑤~⑦ 一个页面里的第二条加载链（🔴 R8-02）─────────────────────────
//
// R7-13 的扫查口径是「每个 TiTable 实例」（用例 ①）＋「整页共用一份 load 的页面」（PAGE_LEVEL_EXEMPT）。
// 两口径之间留下一个洞：**一个页面里可以有两条互相独立的加载链，而其中一条根本不是 TiTable**。
// system/dict 正是此形态——左栏字典类型走自定义 `el-scrollbar` + `v-for`，右栏字典项才是 TiTable。
// 左栏加载失败时 `typeList` 保持 `[]`，渲染成**空白面板**，与「一个字典类型都没有」完全同形。
//
// 🔴 为什么本组不写成「全站扫自定义列表」的通用规则：判「一段加载逻辑是否算独立加载链、
//    是否该有自己的失败态」需要理解语义（下拉选项、懒加载块、可失败可降级的附属数据各不相同），
//    机械口径必然大量误报，误报多了就会被塞进白名单，规则随即空转——那正是 R8-01 的教训
//    （**守卫的可信度取决于我能否核实它的覆盖面**）。故此处只钉本页的结构事实，
//    把「一个页面可以有 N 条加载链」这条认识写进注释，交由人工在新页面上复用。

/**
 * 剥注释后再断言（🔴 见 lessons「源码扫描型断言：必须先剔注释」）。
 * 本文件自身的注释里就引用了 `useTableError()` / `v-if="typeListError"` 等字样，
 * 不剥注释的话，**把修复整段注释掉**仍会被判为「已存在」——反向对照才是这条断言的验收标准。
 *
 * 🔴 **必须连 HTML 注释一起剥**：.vue 的模板注释是 `<!-- -->`，不是 `//`。
 * 只剥 JS 注释的话，把 `<el-alert v-if="typeListError">` 整块用 `<!-- -->` 包起来调试，
 * `indexOf('v-if="typeListError"')` 照样命中**注释里的文本** ⇒ 失败态断言恒绿。
 * （JS 的块注释、行注释、HTML 注释三种都要剥；剥的顺序无关，互相不会吃掉对方的识别符。）
 */
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')

const dictSource = await readFile(new URL('../src/views/system/dict/index.vue', import.meta.url), 'utf8')
const dictCode = stripComments(dictSource)

test('⑤ 同页两条加载链各持一个失败态：（行为）两个 useTableError 实例互不串扰', async () => {
  // 若有人把左右两栏改成共用一个 useTableError()，两栏的失败态会互相污染：
  // 右栏表格取数成功 clearing 掉错误、顺手把左栏「加载失败」也一起抹掉（或反之，左栏失败把
  // 右栏正在展示的数据状态顶掉）。这条断言把「各持一个」从注释变成可执行约束。
  const left = await mountComposable(() => useTableError())
  const right = await mountComposable(() => useTableError())

  left.setTableError(new Error('左栏加载失败'))
  assert.equal(right.tableError.value, null, '左栏置错不得影响右栏')
  right.setTableError(new Error('右栏加载失败'))
  assert.equal(left.tableError.value.message, '左栏加载失败', '右栏置错不得覆盖左栏')

  right.clearTableError()
  assert.ok(left.tableError.value, '右栏成功清错不得把左栏的失败态一并抹掉')
})

test('⑥ system/dict 左栏：加载失败必须置失败态（而非静默留空列表）', () => {
  const body = /\nconst loadTypes = async \(\) => \{([\s\S]*?)\n\}\n/.exec(dictCode)?.[1]
  assert.ok(body, '未能定位 loadTypes 函数体（源码结构变了，扫描口径需更新）')

  assert.match(body, /catch\s*\(/, 'loadTypes 必须有 catch——原实现无 catch，接口 500 会变成未捕获拒绝')
  assert.match(body, /typeList\.value = \[\]/, '失败须清空列表，避免「旧数据 + 新错误」')
  assert.match(body, /setTypeListError\(/, '失败须置上失败态；只 catch 不置错等于没有失败态')
  // 🔴 清错只能在成功分支：写进 finally 会把失败路径刚置上的错误立刻抹掉，失败态永不显示
  assert.ok(
    !/finally[\s\S]{0,200}clearTypeListError/.test(body),
    'clearTypeListError 不得出现在 finally 里（同 useTable 用例 ④ 的坑）',
  )
})

test('⑦ system/dict 左栏：失败态先于空态与列表渲染，且重试可达 loadTypes', () => {
  const alertAt = dictCode.indexOf('v-if="typeListError"')
  const emptyAt = dictCode.indexOf('v-else-if="!filteredTypes.length"')
  const listAt = dictCode.indexOf('v-for="type in filteredTypes"')

  assert.notEqual(alertAt, -1, '左栏须渲染失败态（此前只在右栏 TiTable 上有）')
  assert.notEqual(emptyAt, -1, '左栏须有空态：否则空白面板与「加载失败」再次同形')
  assert.notEqual(listAt, -1, '左栏列表仍须渲染')
  // 🔴 顺序即语义：接口挂掉时 filteredTypes 同样为空，失败态若排在空态/列表之后，
  //    界面仍会断言「没有字典类型」——而真相是这次没查成。
  assert.ok(alertAt < emptyAt, '失败态必须排在空态之前')
  assert.ok(emptyAt < listAt, '空态必须排在列表之前（三者须构成同一条 if 链）')

  // 重试必须真的重新拉取；只渲染一个按钮而不绑事件＝点了没反应（同用例 ① 的「成对」判据）
  const alertBlock = dictCode.slice(alertAt, emptyAt)
  assert.match(alertBlock, /@click="loadTypes"/, '失败块里的重试必须重新调用 loadTypes')

  // 两条链的失败态不得共用同一个标识（共用一个 ref 会让两块面板的失败互相污染，见用例 ⑤）
  assert.match(dictCode, /:error="tableError"/, '右栏 TiTable 仍须绑自己的失败态')
  const errorStateCount = dictCode.split('useTableError()').length - 1
  assert.equal(
    errorStateCount,
    2,
    `本页须有**两个** useTableError() 实例（左栏自定义列表 + 右栏 TiTable），实为 ${errorStateCount} 个`
      + '——只出现一个说明又合并回一份，失败态会互相污染',
  )
})

/**
 * 收集页面内由 `useTableError()` / `useTable(...)` 解构出的标识符（含重命名别名）。
 * 🔴 解构体用 `[^}]*` 而非 `[\s\S]*?`：后者会跨语吃到更早的 `const {`，
 * 把 `const rows = ref<…>` 之类也算成解构项（本轮 dry-run 实测踩到，见 ⑨ 的注释）。
 */
const destructuredFrom = (code) => {
  const names = new Set()
  const re = /const\s*\{([^}]*)\}\s*=\s*(?:useTableError\(\)|useTable[<(])/g
  let m
  while ((m = re.exec(code))) {
    for (const part of m[1].split(',')) {
      const seg = part.trim()
      if (!seg) continue
      // `tableError: typeListError` → 取别名；`tableError` → 取本名
      const [, key, alias] = /^(\w+)(?:\s*:\s*(\w+))?$/.exec(seg) ?? []
      if (key) names.add(alias || key)
    }
  }
  return names
}

// 本轮（R8-04）修掉的正是这条：rule-engine/list 曾自建 `const error = ref<Error | null>(null)`
// 并绑 `:error="error"` —— 全站 34 个 TiTable 绑定里唯一一个不叫 tableError 的。
// 它不只是命名漂移：旧写法对非 Error 的拒绝值一律套硬编码文案，把后端给的原因吞掉，
// 而 setTableError 走的 normalizeError 会保留原始文案（可能是后端原始字符串）。

test('⑧ 每个 TiTable 的 :error 绑定必须可追溯到 useTableError/useTable（唯一实现，防命名漂移）', async () => {
  const views = await collectViews(new URL('../src/views/', import.meta.url))
  const offenders = []
  let bound = 0

  for (const file of views) {
    const code = stripComments(await readFile(file, 'utf8'))
    const rel = file.pathname.replace(/^.*\/src\//, 'src/')
    const names = destructuredFrom(code)
    for (const tag of code.match(/<TiTable[\s\S]*?>/g) ?? []) {
      const id = /:error\s*=\s*"([^"]+)"/.exec(tag)?.[1]?.trim()
      if (!id) continue
      bound += 1
      // 断言的是「可追溯」而非「必须叫 tableError」：payment-operations 一屏三表，
      // 三份失败态各起重命名（callbackError/securityError/collectionError）是**正例**
      // —— 同名反而会让三块面板的失败互相污染（同用例 ⑤ 的判据）。
      if (!names.has(id)) {
        const available = [...names].join(', ') || '（本页无解构声明）'
        offenders.push(`${rel}：:error="${id}" 不在 {${available}} 中`)
      }
    }
  }

  // 覆盖量下限：绑定数若因重构骤降，说明 `:error` 扫描口径失效（测空集恒真）
  assert.ok(bound >= 30, `仅扫到 ${bound} 个 TiTable :error 绑定，口径疑似失效`)
  assert.deepEqual(
    offenders,
    [],
    '以下 :error 绑定无法追溯到失败态的唯一实现（手写 ref 会绕过 normalizeError）：\n  '
      + offenders.join('\n  '),
  )
})

test('⑨ 页面不得自建 Error ref 充当失败态（绕过 normalizeError ⇒ 空白失败块）', async () => {
  const views = await collectViews(new URL('../src/views/', import.meta.url))
  const offenders = []
  let consumers = 0

  for (const file of views) {
    const code = stripComments(await readFile(file, 'utf8'))
    if (/ref<\s*Error(\s*\|\s*null)?\s*>/.test(code)) {
      offenders.push(file.pathname.replace(/^.*\/src\//, 'src/'))
    }
    if (/useTableError\(\)|=\s*useTable[<(]/.test(code)) consumers += 1
  }

  assert.ok(consumers >= 28, `仅 ${consumers} 个页面走到 useTableError/useTable，口径疑似失效`)
  assert.deepEqual(
    offenders,
    [],
    '以下页面自建 Error ref：`setTableError` 的 normalizeError 是唯一实现，'
      + '手写 ref 在拦截器 reject 非 Error 值（后端原始字符串/对象）时会渲染出没有文案的失败块\n  '
      + offenders.join('\n  '),
  )
})

// ──────────────── ⑩~⑫ 同页第 N 条加载链：product/detail 的条款面板（🔴 R9-F02a）────────────────
//
// 现场：BFF 首次并发调用竞态（ClauseServiceClient.listCoverages 解码失败）时，该面板
// **整条链完全静默**：`getCoverages` 的 `.catch(() => [])` 把失败抹成空数组，表格的 #empty 槽
// 照常渲染「该条款暂未配置保障责任」——向用户断言「该条款确实没配」，而真相是这次没查成。
// 连 ④/⑤ 那类全局提示也不会触发：`getClauseDetail` 取到了（resolved=1），
// 下方 `resolved === 0` 的分支根本不进。故失败态必须**就地、持久、可重试**。
//
// 与 ⑥⑦（system/dict 左栏）同判据、不同形态：那里是「整块面板取不到」，这里是「面板取到了、
// 面板内某项取不到」，且失败态落在表格的 #empty 槽内——**空态与失败态共用同一个渲染位置**，
// 所以顺序与互斥在这里格外重要。

const productDetailCode = stripComments(
  await readFile(new URL('../src/views/product/detail/index.vue', import.meta.url), 'utf8'),
)

test('⑩ product/detail 条款面板：整块取数失败必须置失败态，且清错只在成功分支', () => {
  const body = /\nconst loadClauses = async \(productId: string\) => \{([\s\S]*?)\n\}\n/.exec(productDetailCode)?.[1]
  assert.ok(body, '未能定位 loadClauses 函数体（源码结构变了，扫描口径需更新）')

  assert.match(body, /catch\s*\(/, 'loadClauses 必须有 catch——原实现只有 try/finally，接口 500 会变成未捕获拒绝')
  assert.match(body, /clauseGroups\.value = \[\]/, '失败须清空列表，避免「旧数据 + 新错误」')
  assert.match(body, /setClauseError\(/, '失败须置上失败态；只 catch 不置错等于没有失败态')
  // 🔴 清错只能在成功分支：写进 finally 会把失败路径刚置上的错误立刻抹掉（同用例 ④/⑥ 的坑）
  assert.ok(
    !/finally[\s\S]{0,200}clearClauseError/.test(body),
    'clearClauseError 不得出现在 finally 里（失败路径同样经过 finally）',
  )
})

test('⑪ product/detail 条款面板：失败态先于空态，且重试可达 loadClauses', () => {
  const alertAt = productDetailCode.indexOf('v-if="!clauseLoading && clauseError"')
  const emptyAt = productDetailCode.indexOf('v-else-if="!clauseLoading && clauseGroups.length === 0"')
  const listAt = productDetailCode.indexOf('<el-collapse v-else')

  assert.notEqual(alertAt, -1, '条款面板须渲染失败态（此前只有空态，接口挂掉时与「暂无绑定条款」同形）')
  assert.notEqual(emptyAt, -1, '条款面板仍须有空态：否则空白面板与「加载失败」再次同形')
  assert.notEqual(listAt, -1, '条款列表仍须渲染')
  // 🔴 顺序即语义：接口挂掉时 clauseGroups 同样为空，失败态若排在空态之后，
  //    界面仍会断言「该产品暂无绑定条款」——而真相是这次没查成（R9-F02a 的判据）
  assert.ok(alertAt < emptyAt, '失败态必须排在空态之前')
  assert.ok(emptyAt < listAt, '空态必须排在列表之前（三者须构成同一条 if 链）')

  // 重试必须真的重新拉取；只渲染按钮不绑事件＝点了没反应（同用例 ① 的「成对」判据）
  const alertBlock = productDetailCode.slice(alertAt, emptyAt)
  assert.match(alertBlock, /@click="reloadClauses"/, '失败块里的重试必须重新加载条款')
  const reloadDef = /const reloadClauses = \(\) => loadClauses\(/.test(productDetailCode)
  assert.ok(reloadDef, 'reloadClauses 必须重新调用 loadClauses（而不是只清错）')
})

test('⑫ product/detail 保障责任：「没配」与「没查成」必须可区分（同一 #empty 槽内分支）', () => {
  // 失败原因必须被保留下来，而不是被 `.catch(() => [])` 抹掉
  // 🔴 断言用 assert.ok(re.test()) 而非 assert.match：后者失败时会把整个 .vue 源码倾进输出
  assert.ok(
    /error: normalizeError\(err\)/.test(productDetailCode),
    '保障责任取数失败须保留原因（走 normalizeError 归一，非 Error 拒绝值才不会渲染成空白失败块）',
  )
  assert.ok(
    /coverageError: coverages\.error/.test(productDetailCode),
    '保留下来的失败原因须落到 ClauseGroup.coverageError 上，模板才有可判的依据',
  )
  assert.ok(
    !/getCoverages\([\s\S]{0,120}?\.catch\(\s*\(\)\s*=>\s*\[\]/.test(productDetailCode),
    'getCoverages 不得再用 .catch(() => []) 把失败吞成空数组——那正是 R9-F02a 的成因',
  )

  // 表内失败态与「暂未配置」同槽，必须互斥且失败在前
  const failAt = productDetailCode.indexOf('v-if="group.coverageError"')
  const notConfiguredAt = productDetailCode.indexOf('该条款暂未配置保障责任')
  assert.notEqual(failAt, -1, '保障责任的失败态须渲染（否则与「暂未配置」同形）')
  assert.notEqual(notConfiguredAt, -1, '「暂未配置」空态仍须保留')
  assert.ok(failAt < notConfiguredAt, '失败态必须排在「暂未配置」之前（同一 #empty 槽内的 if/else 链）')
  const slotBlock = productDetailCode.slice(failAt, notConfiguredAt)
  assert.match(slotBlock, /@click="reloadClauses"/, '表内失败态必须可重试')

  // 条款头部不得直接渲染 coverages.length：失败时那会显示「0 项保障」，同样是「确实没配」的断言
  const headerMeta = /<span class="clause-meta">[\s\S]{0,200}?<\/span>/.exec(productDetailCode)?.[0]
  assert.ok(headerMeta, '未能定位条款头部 meta（源码结构变了，扫描口径需更新）')
  assert.ok(
    !/group\.coverages\.length/.test(headerMeta),
    '条款头部不得直接写 group.coverages.length——失败时渲染「0 项保障」即向用户断言「确实没配」',
  )
  assert.ok(/coverageCountText\(group\)/.test(headerMeta), "条款头部须走 coverageCountText 以区分失败与零项")
})
