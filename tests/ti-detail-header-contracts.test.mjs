import assert from 'node:assert/strict'
import test from 'node:test'
import { h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { loadSFC, renderSFC, stubComponent, dumpTree, findNode, tagsOf, assertNoNode } from './sfc-render.mjs'

// TiDetailHeader 契约（ui-011 底盘补位）
//
// 这个组件存在的理由是**消灭 8 份重复**（7 份 .detail-header + claim 的 .ti-detail-header），
// 所以这里要守的不是「它能渲染出标题」这种显然的事，而是两类容易被无声破坏的性质：
//  ① **返回按钮真的会返回**。这是本组件里唯一有行为的部分，也是最容易写成「点了没反应」的地方：
//     直接打开详情页时没有上一条历史，`router.back()` 静默失聪——按钮、图标、hover 效果齐全，
//     却什么都不会发生。测试要证明三种情形（给了 backTo / 有历史 / 无历史）各走各的路。
//  ② **槽位缺省时不留下痕迹**。详情页的头部形态全站一致、业务差异全在插槽里，
//     若空槽也渲染出容器，每个页面的 DOM 都会凭空多出两个空 div 并把 flex gap 撑成两倍。
const TiDetailHeader = await loadSFC(
  new URL('../src/components/TiDetailHeader/index.vue', import.meta.url).pathname,
  'tidetailheader',
)

// 🔴 `text` 必须按 EP 的真实 prop 类型声明为 Boolean。不声明时它只会作为原始属性出现，
// dumpTree 读到的是空串 `''`，而真实 el-button 里 Boolean 类型的 `text` 解析结果是 true ——
// 量到的东西与实际渲染不是一回事（TiTable 契约里 stripe 踩过同一个坑）。
const STUBS = [stubComponent('el-button', { text: Boolean, icon: Object }), stubComponent('el-icon')]

/** 造一个装了 memory history 的真 router —— useRouter() 没有它拿不到实例 */
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/list', component: { render: () => null } },
      { path: '/detail/:id', component: { render: () => null } },
      { path: '/other', component: { render: () => null } },
    ],
  })
}

/**
 * 渲染并把 router 的两个导航入口换成记录器。
 *
 * 不直接断言「URL 变了」：memory history 下的真实跳转要靠 await router.isReady() 之类的时序配合，
 * 而本组件要守的是**它调了哪一个** —— back() 与 push() 是语义不同的两个动作
 * （回到来处 vs 去一个明确目标），记录调用比观察终点更直接、也更稳定。
 */
async function mount(opts = {}) {
  const router = makeRouter()
  const calls = []
  router.back = () => calls.push('back')
  router.push = (to) => {
    calls.push(`push:${typeof to === 'string' ? to : JSON.stringify(to)}`)
    return Promise.resolve()
  }
  // hasHistory() 读的正是这里：null = 直接打开详情页（无前一个路由）
  if (opts.back !== undefined) {
    router.options.history.state.back = opts.back
  }

  const tree = await renderSFC(TiDetailHeader, {
    props: { title: opts.title ?? '保单详情 - P2026001', ...opts.props },
    slots: opts.slots ?? {},
    stubs: STUBS,
    plugins: [router],
  })

  // 🔴 点击发生在 renderSFC 返回**之后**，而 renderSFC 内部会把 console.warn 换成空函数
  // 并在返回前还原（它要压掉组件库的缺失告警）。故捕获必须包住点击本身，
  // 而不是只包住渲染 —— 否则本用例测的是「渲染期间有没有告警」，必然测不到返回按钮的行为。
  const click = () => {
    const warnings = []
    const origWarn = console.warn
    console.warn = (...args) => warnings.push(args.join(' '))
    try {
      findNode(tree, (n) => n.tag === '<el-button>').props.onClick()
    } finally {
      console.warn = origWarn
    }
    return warnings
  }

  return { tree, calls, click, router }
}

test('① 默认形态：返回按钮 + 标题，槽位缺省时不留下空容器', async () => {
  const { tree } = await mount()

  const back = findNode(tree, (n) => n.tag === '<el-button>')
  assert.ok(back, '必须有返回按钮')
  assert.equal(back.props.text, true, '返回按钮须是 text 形态（与 7 份现存实现一致）')
  assert.equal(back.props.icon?.name, 'ArrowLeft', '图标须是 ArrowLeft，与 7 份现存实现一致')
  assert.match(dumpTree(tree).join('\n'), /返回/, '默认文案须为「返回」')

  // 🔴 反向断言：meta / actions 无内容时不得渲染容器。
  // 空 div 仍是 flex item，会把父级 gap 从 12px 撑成 24px+ —— 视觉上「只是稍微宽了点」，
  // 没人会当成 bug 报，但它让「加了 #meta 插槽」这件事对布局产生了看不见的副作用。
  assertNoNode(tree, (n) => /__meta|__actions/.test(n.props.class ?? ''), '空槽不得渲染容器')
  assert.equal(tagsOf(tree).filter((t) => t === 'div').length, 1, '默认形态下只应有根节点这一个 div')
})

test('② 标题与文案可配，槽位内容进入对应容器', async () => {
  const { tree } = await mount({
    title: '理赔案件详情',
    props: { backText: '返回列表' },
    slots: {
      meta: () => [h('span', { class: 'tag' }, '已终止')],
      actions: () => [h('button', { class: 'act' }, '编辑')],
    },
  })

  const text = dumpTree(tree).join('\n')
  assert.match(text, /返回列表/, 'backText 应覆盖默认文案')
  assert.match(text, /理赔案件详情/, 'title 应渲染')

  const meta = findNode(tree, (n) => /__meta/.test(n.props.class ?? ''))
  const actions = findNode(tree, (n) => /__actions/.test(n.props.class ?? ''))
  assert.ok(meta, '传了 #meta 才渲染 meta 容器')
  assert.ok(actions, '传了 #actions 才渲染 actions 容器')
  assert.ok(findNode(meta.children, (n) => n.props.class === 'tag'), '#meta 内容须落在 meta 容器内')
  assert.ok(findNode(actions.children, (n) => n.props.class === 'act'), '#actions 内容须落在 actions 容器内')
})

test('③ 给了 backTo 就总是去 backTo —— 文案说去哪就去哪', async () => {
  // 有历史也给 backTo 时**仍走 push**：claim/detail 的按钮写着「返回列表」，
  // 用户从另一个详情页跳进来时若回到那个详情页，文案与行为就是两回事。
  const { tree, calls, click } = await mount({ back: '/list', props: { backTo: '/other' } })
  click()

  assert.deepEqual(calls, ['push:/other'], '有 backTo 时不得改走 back()')
})

test('④ 没给 backTo 且有历史：回到来处（与现存 11 个页面行为一致）', async () => {
  const { tree, calls, click } = await mount({ back: '/list' })
  click()

  assert.deepEqual(calls, ['back'], '有历史可退时须走 back()，不得擅自 push 到别处')
})

test('⑤ 没给 backTo 且无历史：不静默失聪，留下可检索的痕迹', async () => {
  // 现场：直接打开 /policy/detail/xxx 后点「返回」。go(-1) 无历史可退 ⇒ 什么都不发生，
  // 控制台也没有任何输出。这正是 D-12 那个「改不动语言的语言按钮」的同一形态：
  // 控件看起来能用、实际什么都没做，且不留痕迹。
  const { calls, click } = await mount({ back: null })
  const warnings = click()

  assert.deepEqual(calls, [], '无历史可退时不得调用 back()（它只会静默失败）')
  assert.equal(warnings.length, 1, '无路可退必须留下痕迹，不能静默')
  assert.match(warnings[0], /backTo/, '痕迹须说明补救办法（提供 backTo）')
})

test('⑥ 探测失灵时按「有历史」处理：不能因为探测失败把返回按钮弄坏', async () => {
  // 删掉 state.back 模拟 vue-router 将来改了内部结构。
  const { calls, click } = await mount({ back: undefined })
  click()

  assert.deepEqual(calls, ['back'], '探测不到历史信息时应退回本组件出现之前的行为')
})

test('⑦ back 事件先于跳转发出，调用方可接管', async () => {
  const router = makeRouter()
  const order = []
  router.back = () => order.push('navigate')
  router.push = () => {
    order.push('navigate')
    return Promise.resolve()
  }
  router.options.history.state.back = '/list'

  let onBackCount = 0
  const tree = await renderSFC(TiDetailHeader, {
    props: { title: 'x', onBack: () => { onBackCount += 1; order.push('emit') } },
    stubs: STUBS,
    plugins: [router],
  })
  findNode(tree, (n) => n.tag === '<el-button>').props.onClick()

  assert.equal(onBackCount, 1, '点击须 emit back')
  assert.deepEqual(order, ['emit', 'navigate'], 'emit 必须先于跳转，调用方才能在此之前拦截或埋点')
})
