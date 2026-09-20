import assert from 'node:assert/strict'
import test from 'node:test'

// 自注册无扩展名 TS 导入的解析钩子，必须在动态 import useTable 之前
import './ts-resolve-hook.mjs'

// 🔴 D-07 错误态契约 —— 行为测试，非源码文本断言。
//
// 形态说明：本缺陷的现场是「接口挂了，界面却显示『暂无数据』」。用文本断言去测
// 「源码里有没有 catch」是**假信心**——catch 存在但把错误吞掉、或在 finally 里把错误
// 抹掉，文本断言一样通过。故此处真正 mount 组件、注入会 reject 的 fetchFn，
// 直接断言 Hook 暴露出的状态。
//
// 零新增依赖：用 `createRenderer` 自建 headless renderer（自定义 nodeOps 全部空实现），
// 不引入 jsdom/happy-dom/@vue/test-utils —— 项目正朝减依赖方向走，不该为 4 条断言加三个包。
const { useTable } = await import('../src/composables/useTable.ts')
const { createRenderer, defineComponent, h } = await import('vue')

const noop = () => ({})
const { createApp } = createRenderer({
  createElement: noop,
  createText: noop,
  createComment: noop,
  setText: () => {},
  setElementText: () => {},
  insert: () => {},
  remove: () => {},
  parentNode: () => null,
  nextSibling: () => null,
  patchProp: () => {},
  querySelector: () => null,
  setScopeId: () => {},
})

/** 让挂起的 promise 链跑完（fetchData 是 async，onMounted 里的调用不 await） */
const flush = () => new Promise((r) => setTimeout(r, 0))

/**
 * 在真实组件上下文中调用 useTable 并返回其 API。
 * 必须 mount：`onMounted` 在无组件实例时不会被触发（首屏自动加载依赖它）。
 */
async function mountTable(fetchFn, options) {
  let api
  const app = createApp(
    defineComponent({
      setup() {
        api = useTable(fetchFn, undefined, options)
        return () => h('div')
      },
    }),
  )
  app.mount({})
  await flush()
  return api
}

/**
 * 可编程的假 fetchFn：按序返回预设结果，并记录调用次数。
 * 用 `{ __reject: v }` 显式表示「以 v 拒绝」——若不这样标记，普通对象会被当成**成功返回值**，
 * 测试会静默变成在测另一条路径（本文件初版即踩过：`{ code: 500 }` 被当作成功的分页信封）。
 * 最后一步会重复用于后续所有调用，便于测「重试仍然失败」。
 */
function scriptedFetch(steps) {
  const calls = { count: 0 }
  const fn = async () => {
    const step = steps[Math.min(calls.count, steps.length - 1)]
    calls.count += 1
    if (step && typeof step === 'object' && '__reject' in step) throw step.__reject
    return step
  }
  return { fn, calls }
}

test('① 请求失败时 tableError 非空，且 tableData 为空', async () => {
  const { fn } = scriptedFetch([{ __reject: new Error('接口 500') }])
  const t = await mountTable(fn, { immediate: false })

  assert.equal(t.tableError.value, null, '尚未请求时不应有错误')
  await t.fetchData()

  assert.ok(t.tableError.value instanceof Error, 'tableError 应为 Error 实例')
  assert.equal(t.tableError.value.message, '接口 500')
  assert.deepEqual(t.tableData.value, [], '失败后不得残留数据')
})

test('② 请求成功时 tableError 为 null（成功路径必须清错）', async () => {
  const { fn } = scriptedFetch([{ __reject: new Error('先失败') }, { list: [{ id: 1 }], total: 1 }])
  const t = await mountTable(fn, { immediate: false })

  await t.fetchData()
  assert.ok(t.tableError.value, '第一次应失败')

  // 🔴 关键：失败一次后重试成功，错误态必须消失。
  // 若把清错写在 finally 里（而非成功路径），错误态会永远显示——这是本修复最易写错处。
  await t.fetchData()
  assert.equal(t.tableError.value, null, '成功路径未清错 → 错误态将永久卡住')
  assert.deepEqual(t.tableData.value, [{ id: 1 }])
})

test('③ retry() 会重新发起请求', async () => {
  const { fn, calls } = scriptedFetch([{ __reject: new Error('boom') }])
  const t = await mountTable(fn, { immediate: false })

  await t.fetchData()
  assert.equal(calls.count, 1, '首次请求')

  await t.retry()
  assert.equal(calls.count, 2, 'retry() 必须真的再发一次请求，而非仅清空错误')
})

test('④ 失败后 loading 必须归 false（否则重试按钮永远转圈）', async () => {
  const { fn } = scriptedFetch([{ __reject: new Error('boom') }])
  const t = await mountTable(fn, { immediate: false })

  await t.fetchData()
  assert.equal(t.tableLoading.value, false, '失败路径也必须走 finally 关 loading')
})

test('⑤ 失败必须清空上一次的成功数据（避免「旧数据 + 新错误」）', async () => {
  const { fn } = scriptedFetch([
    { list: [{ id: 1 }, { id: 2 }], total: 2 },
    { __reject: new Error('第二次失败') },
  ])
  const t = await mountTable(fn, { immediate: false })

  await t.fetchData()
  assert.equal(t.tableData.value.length, 2, '第一次应成功')
  assert.equal(t.pagination.total, 2)

  await t.fetchData()
  assert.deepEqual(t.tableData.value, [], '旧数据不得残留——否则用户会当成本次查询结果')
  assert.equal(t.pagination.total, null, '失败时总数未知，不得留着旧值渲染出对不上的分页条')
  assert.ok(t.tableError.value)
})

test('⑥ 非 Error 的 reject 值也能给出可读报错（拦截器可能 reject 字符串/对象）', async () => {
  const { fn } = scriptedFetch([{ __reject: '后端原始字符串报错' }])
  const t = await mountTable(fn, { immediate: false })

  await t.fetchData()
  assert.ok(t.tableError.value instanceof Error, '必须归一为 Error，否则消费方取不到 message')
  assert.equal(t.tableError.value.message, '后端原始字符串报错')

  const { fn: fn2 } = scriptedFetch([{ __reject: { code: 500 } }])
  const t2 = await mountTable(fn2, { immediate: false })
  await t2.fetchData()
  assert.ok(t2.tableError.value instanceof Error, '普通对象也应归一为 Error')
  assert.equal(typeof t2.tableError.value.message, 'string', 'message 必须是字符串且非空')
  assert.ok(t2.tableError.value.message.length > 0)
})

test('⑦ 既有契约未被回退：裸数组归一化 + 未知总数不压成 0 + 首屏恰好一次', async () => {
  // 裸数组（无分页信封）
  const { fn } = scriptedFetch([[{ id: 1 }, { id: 2 }]])
  const t = await mountTable(fn, { immediate: false })
  await t.fetchData()
  assert.equal(t.tableData.value.length, 2, '裸数组须归一化')
  assert.equal(t.pagination.total, 2, '裸数组用长度作总数')

  // total 为 null 表示未知，不得压成 0（D-501-57）
  const { fn: fn2 } = scriptedFetch([{ list: [], total: null }])
  const t2 = await mountTable(fn2, { immediate: false })
  await t2.fetchData()
  assert.equal(t2.pagination.total, null, '未知总数不得压成 0')

  // 首屏自动加载恰好一次（D-501-43）
  const { fn: fn3, calls } = scriptedFetch([{ list: [], total: 0 }])
  await mountTable(fn3)
  assert.equal(calls.count, 1, '默认应自动加载首屏，且不得重复请求')

  // 显式关闭时不加载
  const { fn: fn4, calls: c4 } = scriptedFetch([{ list: [], total: 0 }])
  await mountTable(fn4, { immediate: false })
  assert.equal(c4.count, 0, 'immediate:false 时不得自动加载')
})
