import assert from 'node:assert/strict'
import test from 'node:test'
import { h } from 'vue'

import {
  loadSFC,
  renderSFC,
  stubComponent,
  dumpTree,
  findNode,
  tagsOf,
  mountComposable,
  assertNoNode,
} from './sfc-render.mjs'

// TiTable 契约（🔴 D-06）—— 行为测试，非源码文本断言。
//
// 守住两条容易被无声破坏的性质：
//  ① **向后兼容**：stripe/border 由硬编码改为 prop 后，存量实例的渲染结果必须逐项不变
//     （用户 2026-09-17 明确选择「stripe 默认 true、保零变化」）。
//     这条只有真渲染才测得出来——源码里写了 `stripe: true` 不等于渲染结果就是那样。
//     实测口径：全仓 25 处 `<TiTable>` 实例（24 个文件）**无一传新 props**，
//     故「默认形态等价」这一条即可覆盖全部存量实例。
//  ② **失败态可区分**：接口失败与「确实没数据」此前同形，现须为两条不同路径。
const { useTable } = await import('../src/composables/useTable.ts')

const TiTable = await loadSFC(
  new URL('../src/components/TiTable/index.vue', import.meta.url).pathname,
  'titable',
)

// 🔴 原先此处要 `createI18n` 造一个语言包给 TiTable 挂上（它内部调 t()）。
// D-12 移除前端 i18n 后组件不再依赖语言包，构造器随依赖一并删除——
// 语言包本就是**为了让组件能渲染**才存在的测试脚手架，不是被测行为。

// 按 EP 的真实 prop 类型声明桩组件——否则 `stripe` 会以原始属性形态出现，
// 量到的是属性字符串而非解析后的布尔值。
const STUBS = [
  stubComponent('el-table', {
    data: Array,
    stripe: Boolean,
    border: Boolean,
    highlightCurrentRow: Boolean,
    height: [String, Number],
    maxHeight: [String, Number],
  }),
  stubComponent('el-pagination'),
  stubComponent('el-button'),
  stubComponent('el-empty'),
  stubComponent('el-icon'),
]

const rows = [{ id: 1 }]
const render = (props = {}, slots = {}) =>
  renderSFC(TiTable, {
    props: { data: rows, total: 1, ...props },
    slots: { default: () => [], ...slots },
    stubs: STUBS,
  })

test('① 默认渲染 = 存量实例的形态：stripe 开、border 关、无工具栏、无失败态', async () => {
  const tree = await render()
  const table = findNode(tree, (n) => n.tag === '<el-table>')

  assert.ok(table, '默认必须渲染 el-table')
  assert.equal(table.props.stripe, true, '🔴 stripe 默认必须为 true，否则 25 处存量实例全部失去斑马纹')
  assert.equal(table.props.border, false, 'border 默认应为 false（与既有硬编码行为一致）')
  assert.equal(table.props.highlightCurrentRow, true, 'highlight-current-row 默认保持开启')

  // 默认不得出现工具栏与失败态——否则存量页面凭空多出元素
  assert.ok(!findNode(tree, (n) => n.tag === 'div' && n.props.class === 'ti-table-toolbar'), '默认不应有工具栏')
  assert.ok(!findNode(tree, (n) => n.props.role === 'alert'), '默认不应有失败态')
})

test('② 失败态：不再渲染表格，改为 role=alert + 重试按钮（与「暂无数据」可区分）', async () => {
  const tree = await render({ error: new Error('接口 500') })

  assertNoNode(tree, (n) => n.tag === '<el-table>', '失败时不得再渲染表格')
  assertNoNode(tree, (n) => n.tag === '<el-pagination>', '失败时不得渲染分页条')

  const alert = findNode(tree, (n) => n.props.role === 'alert')
  assert.ok(alert, '失败态须有 role="alert" 供读屏识别')

  const text = dumpTree(tree).join('\n')
  assert.match(text, /接口 500/, '须展示真实失败原因，而非笼统的「加载失败」')
  assert.match(text, /重试/, '须给出重试出口')
})

test('③ 新增能力不泄漏到 el-table：showRefresh/error 不再被当作无效属性透传', async () => {
  const tree = await render({ showRefresh: true, border: true })
  const table = findNode(tree, (n) => n.tag === '<el-table>')

  assert.equal(table.props.border, true, 'border 应正常生效')
  // 旧实现里 border/showRefresh 走 $attrs 直落 el-table，会渲染成无意义的 DOM 属性
  assert.ok(!('showRefresh' in table.props), 'showRefresh 是组件自身的 prop，不应落到 el-table 上')

  const buttons = tagsOf(tree).filter((t) => t === '<el-button>')
  assert.ok(buttons.length >= 1, 'showRefresh 应渲染出刷新按钮')
  const refreshBtn = findNode(tree, (n) => n.tag === '<el-button>')
  assert.equal(refreshBtn.props['aria-label'], '刷新', '纯图标按钮须有 aria-label')
})

test('④ 插槽可覆盖：toolbar / error', async () => {
  const withToolbar = await render({}, { toolbar: () => [h('span', '导出')] })
  assert.ok(
    findNode(withToolbar, (n) => n.props.class === 'ti-table-toolbar'),
    '传 #toolbar 插槽即应渲染工具栏',
  )

  const customError = await render({ error: new Error('后端原始报文') }, {
    error: () => [h('div', { class: 'my-error' }, '自定义失败态')],
  })
  const text = dumpTree(customError).join('\n')
  assert.ok(
    findNode(customError, (n) => n.props.class === 'my-error'),
    '#error 插槽应参与渲染',
  )
  // 🔴 断言「内置实现不再叠加」必须用布尔值，不可 assert.equal(node, null) ——
  // 失败时 Node 会把整棵循环节点树格式化成 diff，单条用例耗时从毫秒涨到 27 秒。
  // 另注：插槽内容**不能传 `() => []`**（Vue 的 ensureValidVNode 视空数组为无效内容而回退默认），
  // 那样测的是默认分支，用例会假绿。
  const builtinLeaked = /后端原始报文/.test(text) || /ti-table-error__icon/.test(text)
  assert.ok(!builtinLeaked, '#error 插槽应完全接管失败态渲染，不再叠加内置实现')
})

test('⑤ refresh 事件：内置刷新按钮与失败态重试按钮同源', async () => {
  let refreshCount = 0
  const onRefresh = () => {
    refreshCount += 1
  }

  // 刷新按钮
  const withRefresh = await render({ showRefresh: true, onRefresh })
  const btn = findNode(withRefresh, (n) => n.tag === '<el-button>')
  btn.props.onClick()
  assert.equal(refreshCount, 1, '点击内置刷新按钮应 emit refresh')

  // 重试按钮（失败态内）
  refreshCount = 0
  const withError = await render({ error: new Error('x'), onRefresh })
  const retryBtn = findNode(withError, (n) => n.tag === '<el-button>')
  retryBtn.props.onClick()
  assert.equal(refreshCount, 1, '点击失败态重试按钮应 emit 同一个 refresh 事件')
})

test('⑥ 与 useTable 对接：Hook 产出的 tableError 直接驱动失败态', async () => {
  // 串起 D-07 的产出与 D-06 的消费：断言的是**真实链路**（Hook 首屏加载失败 → 取到 tableError
  // → 喂给 TiTable → 渲染出可读失败态），而非「Hook 返回值里有 tableError 这个键」——
  // 后者是声明存在性断言，字段在但恒为 null 也照样通过。
  const table = await mountComposable(() =>
    useTable(async () => {
      throw new Error('下游服务不可用')
    }),
  )

  assert.ok(table.tableError.value, '首屏自动加载失败也必须落成错误态（此前该路径完全静默）')
  const tree = await render({ error: table.tableError.value })
  assert.ok(
    findNode(tree, (n) => n.props.role === 'alert'),
    'useTable 的 tableError 可直接驱动失败态',
  )
  assert.match(dumpTree(tree).join('\n'), /下游服务不可用/)
})

test('⑦ 内置文案是中文常量而非 i18n 键（🔴 D-12）', async () => {
  // D-12 把 4 处 t() 换成字面量。这里按**渲染结果**钉住替换后的文案，而不是搜源码里有没有
  // 「上一页」三个字——源码写了不代表渲染出来就是它（此前是 {{ t('common.prevPage') }}，
  // 渲染结果取决于挂上来的语言包）。total=null 是「总数未知」（D-501-57）分支，
  // 只在数据非空且总数未知时出现，是这四处里最容易被重构漏掉的一处。
  const tree = await render({ total: null })
  // 插值会把文本切成多个节点，dumpTree 逐节点成行，故去掉空白再比对
  const flat = dumpTree(tree).join('').replace(/\s+/g, '')

  assert.match(flat, /当前页1条，总数未知/, '总数未知分支须给出本页条数，并如实说明总数未知')
  assert.match(flat, /上一页/, '未走 t() 后仍须渲染出「上一页」')
  assert.match(flat, /下一页/, '未走 t() 后仍须渲染出「下一页」')

  // 反向断言：i18n 键名不得泄漏到界面。去掉语言包后若还有人调 t()，vue-i18n 会把键名
  // 原样显示出来（common.prevPage），此时上面对「上一页」的断言会失败、而只把键名当文案
  // 的回归则只有这条能抓住。
  assert.doesNotMatch(flat, /common\.(noData|totalUnknown|prevPage|nextPage)/, '界面出现了 i18n 键名')
})
