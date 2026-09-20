import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { h, reactive } from 'vue'

import { loadSFC, renderSFC, stubComponent, dumpTree, findNode, assertNoNode } from './sfc-render.mjs'

// TiSearchForm 契约（ui-011 增强）
//
// 增强前这个组件只是一层壳：搜索/重置按钮 `emit` 一个事件，剩下的全交给页面。
// 20 个调用点无一例外都绑了 @reset，所以「页面忘绑」这个洞**今天没有现场**——
// 但它正是本次要堵的东西：一个只在 emit、无人监听时就彻底空转的重置按钮，
// 和 D-12 那个「点了语言不变」的按钮是同一种东西（有按钮、有图标、有 hover，什么都没发生）。
//
// 因此这里最该守的两条：
//  ① 重置**不依赖页面**也能用（页面没绑 @reset 时表单照样还原）
//  ② 但同时**不越权**：页面绑了 @reset，它的语义必须在最后生效（存量 20 页全部依赖这一点）
// 这两条互为约束，只测一条都会漏掉一半：只测 ① 会写成「无条件覆盖表单」而破坏 20 个存量页；
// 只测 ② 则本增强没有任何意义。
const TiSearchForm = await loadSFC(
  new URL('../src/components/TiSearchForm/index.vue', import.meta.url).pathname,
  'tisearchform',
)

const STUBS = [
  stubComponent('el-form', { model: Object, inline: Boolean }),
  stubComponent('el-form-item', { label: String }),
  stubComponent('el-button', { type: String, icon: Object, text: Boolean, nativeType: String }),
  stubComponent('el-input', { modelValue: [String, Number], placeholder: String, clearable: Boolean }),
  stubComponent('el-select', { modelValue: [String, Number, Array], placeholder: String, clearable: Boolean }),
  stubComponent('el-option', { label: String, value: [String, Number] }),
  stubComponent('el-collapse-transition'),
  stubComponent('TiDictSelect', { modelValue: [String, Array], dictType: String, placeholder: String }),
]

/**
 * 按文案找按钮。
 *
 * 两个理由不能改成「取第 2 个 el-button」：模板里按钮会增减（高级搜索开关是条件渲染的），
 * 按位置取会在将来插入按钮时**静默取错**——测的就不再是重置按钮了。
 * 也不从 dumpTree 的文本行里正则抠文案：dump 是给人读的，从它反解结构等于把展示格式当契约。
 */
const buttonByText = (tree, text) =>
  findNode(
    tree,
    (n) => n.tag === '<el-button>' && (n.children ?? []).some((c) => c.tag === '#text' && c.text === text),
  )

/** 点击某个按钮，返回点击期间的 console.warn 记录 */
function clickWithWarnCapture(node) {
  const warnings = []
  const origWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    node.props.onClick()
  } finally {
    console.warn = origWarn
  }
  return warnings
}

const render = (props, slots = {}) =>
  renderSFC(TiSearchForm, { props: { model: reactive({}), ...props }, slots, stubs: STUBS })

test('① 向后兼容：不传 fields 时结构不变，插槽照旧渲染', async () => {
  const model = reactive({ no: '' })
  const tree = await render(
    { model },
    { default: () => [h('span', '手写字段')], advanced: () => [h('span', '高级字段')] },
  )
  const text = dumpTree(tree).join('\n')

  assert.match(text, /手写字段/, '既有 20 个调用点靠 #default 插槽传字段，必须原样渲染')
  assert.match(text, /高级字段/, '#advanced 插槽必须原样渲染')
  // 声明式字段不存在时不应产生任何字段表单项：模板里 v-for 空数组不渲染，这里钉住这一点
  assertNoNode(tree, (n) => n.tag === '<el-form-item>' && n.props.label, '不传 fields 不应凭空出现带标签的表单项')
  // 🔴 默认不显示高级搜索开关：hasAdvanced 默认 false 且无 advanced 字段
  // 比较布尔值而非把节点交给 assert.equal —— 见 sfc-render.mjs 中 assertNoNode 的说明
  assert.equal(buttonByText(tree, '高级搜索') === null, true, '没有高级区时不得渲染开关')
})

test('② 重置不依赖页面：没绑 @reset 也能还原表单', async () => {
  // 现场：页面忘了绑 @reset。改动前点击重置 → emit 无人监听 → 表单纹丝不动，
  // 且没有任何报错。这是本次增强要消灭的那种「看起来能用」的控件。
  const model = reactive({ no: 'P2026001', status: 'ACTIVE' })
  const tree = await render({ model })

  model.no = '用户改的'
  model.status = 'TERMINATED'
  clickWithWarnCapture(buttonByText(tree, '重置'))

  assert.equal(model.no, 'P2026001', '重置须把表单还原到挂载时的值，不能依赖页面绑事件')
  assert.equal(model.status, 'ACTIVE', '所有字段都要还原')
})

test('③ 不越权：页面绑了 @reset 时它的语义最后生效', async () => {
  // 🔴 这条是 ② 的反面约束。存量 20 个页面全部依赖 useTable.handleReset（它把模型清空）
  // 或 Object.assign 一整套默认值；若组件在 emit **之后**还原，页面的重置会被反过来覆盖，
  // 20 个页面全部行为改变。顺序必须是「先还原、再 emit」。
  const model = reactive({ no: 'P2026001', status: 'ACTIVE' })
  const seenByPage = []
  const tree = await render({
    model,
    onReset: () => {
      // 页面处理器看到的应当已经是**还原后**的表单（这样只读不写的页面也拿得到正确状态）
      seenByPage.push({ ...model })
      // 页面自己的重置语义：写入一个不同的值，最终态必须由它决定
      model.status = '页面说的算'
    },
  })

  model.no = '用户改的'
  clickWithWarnCapture(buttonByText(tree, '重置'))

  assert.deepEqual(seenByPage, [{ no: 'P2026001', status: 'ACTIVE' }], '页面的 @reset 须在还原之后被调用')
  assert.equal(model.status, '页面说的算', '页面在 @reset 里写下的值必须最后生效，不被组件覆盖')
})

test('④ 快照是深拷贝：数组字段改动后能真正还原，不是共享引用', async () => {
  // 浅拷贝会让快照与表单共享同一个数组实例 —— 用户改动多选项时快照也跟着变，
  // 表现是「重置之后多选还是新选的那些」。这类 bug 在单字段用例里完全看不出来。
  const model = reactive({ tags: ['A', 'B'], no: '' })
  const tree = await render({ model })

  model.tags.push('C')
  clickWithWarnCapture(buttonByText(tree, '重置'))

  assert.deepEqual(model.tags, ['A', 'B'], '数组字段须还原到挂载时的内容')
})

test('⑤ 重置会清掉挂载后新增的键，而不只是恢复旧键', async () => {
  const model = reactive({ no: '' })
  const tree = await render({ model })

  model.extra = '用户填的'
  clickWithWarnCapture(buttonByText(tree, '重置'))

  assert.equal('extra' in model, false, '挂载后才出现的字段同样要清掉，否则表单会残留看不见的条件')
})

test('⑥ 声明式字段：类型分派、宽度走令牌档位、高级字段自动折叠并可展开', async () => {
  const model = reactive({ no: '', status: '', channel: '' })
  const tree = await render({
    model,
    fields: [
      { prop: 'no', label: '保单号', width: 'md' },
      { prop: 'status', label: '状态', type: 'dict', dictType: 'POLICY_STATUS', width: 'sm' },
      { prop: 'channel', label: '渠道', type: 'select', width: 'lg', options: [{ label: '直销', value: 'D' }], advanced: true },
    ],
  })

  const items = []
  ;(function collect(nodes) {
    for (const n of nodes) {
      if (n.tag === '<el-form-item>' && n.props.label) items.push(n)
      collect(n.children ?? [])
    }
  })(tree)

  assert.deepEqual(items.map((i) => i.props.label), ['保单号', '状态', '渠道'], '三个字段都应渲染')

  const input = findNode(items[0].children, (n) => n.tag === '<el-input>')
  assert.ok(input, '未指定 type 时默认渲染输入框')
  assert.equal(input.props.class, 'ti-search-control-md', '宽度档位 md 须落到令牌类上')

  const dict = findNode(items[1].children, (n) => n.tag === '<TiDictSelect>')
  assert.ok(dict, 'type=dict 须交给 TiDictSelect')
  assert.equal(dict.props.dictType, 'POLICY_STATUS')
  assert.equal(dict.props.class, 'ti-search-control-sm', '短枚举用 sm 档')

  // 高级字段落在折叠区里，且开关自动出现 —— 否则声明式配置里的 advanced 字段将永远不可见
  const advanced = findNode(tree, (n) => /ti-search-advanced/.test(n.props.class ?? ''))
  assert.ok(advanced, '须有高级搜索折叠区')
  assert.ok(findNode(advanced.children, (n) => n.props.label === '渠道'), 'advanced 字段须落在折叠区内')
  // v-show 由 runtime-dom 的指令实现写 `el.style`（不走自定义渲染器的 patchProp），
  // 故这里读的是节点的 style，而不是 props.style —— 读错地方会得到 undefined 却「看起来没报错」
  assert.equal(advanced.style?.display, 'none', '默认收起')
  assert.ok(buttonByText(tree, '高级搜索'), '有 advanced 字段时须自动出现开关，否则这些字段无处可达')
})

test('⑦ 搜索控件宽度的令牌有了真实消费者，且压得住 EP 的同特异性规则', async () => {
  // 这条守卫的是本任务里唯一一处**只靠单测发现不了**的缺陷。整个过程记在这里，免得后人重蹈：
  //
  // ① 令牌此前**全仓 0 处引用**——注释写着「此前 19 个页面用了 14 种像素值」，而页面依旧各自
  //    写着内联像素值。声明一个没人能用的令牌，与没有它没有区别。
  // ② 补上 `.ti-search-control-md { width: 160px }` 后单测全绿（类名确实落到了控件上），
  //    但真机实测 `<el-input class="ti-search-control-md">` 计算宽度是 **189.5px**、
  //    `el-select` 是 **44px**——都不是令牌里的 160px。
  //    根因：EP 自带 `.el-input { width: var(--el-input-width) }`（默认 100%）、
  //    `.el-select { width: var(--el-select-width) }`，与单类名**特异性同为 (0,1,0)**，
  //    谁赢只由样式表顺序决定；而 vite.config.ts 里 `unplugin-vue-components` 的
  //    ElementPlusResolver 会为每个按需组件**再注入一份组件样式**，那次注入排在 index.scss 之后，
  //    于是 EP 恒赢。同一个类挂在裸 div 上则精确得到 120px，可见规则本身没错、是被顺序压掉了。
  // ③ 故选择器必须双写类名取 (0,2,0)——与同文件上方 `:root:root` 同一手法。
  //
  // 🔴 所以本用例断言的**不是**「宽度是多少」，而是「选择器写成了双写形态」：
  // 单写类名在真机上失效，而任何一次「这两个类名重复了，清理一下」的善后都会静默退回 ② 的状态，
  // 且单测仍然全绿。真机像素由 assets 的可视验证承担，这里只钉住这条不可见的前提。
  const scss = await readFile(new URL('../src/assets/styles/index.scss', import.meta.url), 'utf8')
  for (const [suffix, token] of [
    ['sm', '$search-control-width-sm'],
    ['md', '$search-control-width-md'],
    ['lg', '$search-control-width-lg'],
  ]) {
    const doubled = new RegExp(`\\.ti-search-control-${suffix}\\.ti-search-control-${suffix}\\s*\\{[^}]*width:\\s*\\${token}`)
    assert.match(scss, doubled, `ti-search-control-${suffix} 须双写选择器取 (0,2,0) 并由 ${token} 驱动`)
  }

  // 反向：不得留下单写形式的声明。单写虽有 (0,1,0) 符合语法，但在真实应用里会被 EP 按顺序压掉，
  // 属于「看着对、跑起来不对」——比不写更糟，因为它会让人以为宽度已经统一了。
  const single = /^\.ti-search-control-(sm|md|lg)\s*\{/m
  assert.equal(single.test(scss), false, '不得存在单写类名的宽度声明（会被 EP 同特异性规则按顺序压掉）')
})

test('⑧ 配置错误在开发期就响：声明为 dict 却漏写 dictType', async () => {
  // 漏写时若照常渲染字典下拉，界面上是「点开一片空白」——完全看不出是配置写错了。
  // 这类错误必须在现场就发出声音。
  //
  // 🔴 silenceWarnings: false 不能省：renderSFC 内部会把 console.warn 换成空函数，
  // 在调用方包一层是拦不到的（还原发生在挂载之后，还回的是调用方那一层，而告警已经过去了）。
  const warnings = []
  const origWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    await renderSFC(TiSearchForm, {
      props: { model: reactive({}), fields: [{ prop: 'status', label: '状态', type: 'dict' }] },
      stubs: STUBS,
      silenceWarnings: false,
    })
  } finally {
    console.warn = origWarn
  }

  const mine = warnings.filter((w) => w.includes('[TiSearchForm]'))
  assert.equal(mine.length, 1, '漏写 dictType 须有告警')
  assert.match(mine[0], /status/, '告警须点名是哪个字段')
  assert.match(mine[0], /dictType/, '告警须说清缺的是什么')
})

test('⑨ 漏写 dictType 的字段降级为输入框，不留一个永远没选项的下拉', async () => {
  // 🔴 这条是本组件里最容易被写成「看起来正确」的地方：`type: 'dict'` 照常走
  // `<TiDictSelect :dict-type="field.dictType ?? ''">` 在类型上完全成立（dictType 要求 string），
  // 但空字典类型意味着 ① 下拉永远没有选项，用户点开是空的、选不了任何值 ——
  // 又一个「有控件、没反应」；② 拿空串去 getDict('') 发一次注定失败的请求（store 无空值守卫）。
  // 降级为输入框后这个字段仍能用于检索，配置错误交给告警点名。
  const tree = await render({ fields: [{ prop: 'status', label: '状态', type: 'dict' }] })

  assertNoNode(tree, (n) => n.tag === '<TiDictSelect>', '缺 dictType 时不得渲染字典下拉')
  assert.ok(findNode(tree, (n) => n.tag === '<el-input>'), '字段仍须以输入框形态留在表单里')

  // 反向：给了 dictType 就必须走字典下拉，否则上面的断言在「什么都不渲染」时也会通过
  const ok = await render({
    fields: [{ prop: 'status', label: '状态', type: 'dict', dictType: 'POLICY_STATUS' }],
  })
  assert.ok(findNode(ok, (n) => n.tag === '<TiDictSelect>'), '配了 dictType 才走字典下拉')
})
