// 单文件组件（SFC）的无浏览器渲染工具 —— 供组件契约测试使用。
//
// 为什么要自己搭：项目没有 vitest / @vue/test-utils / jsdom / happy-dom，
// 且正朝减依赖方向走（D-12 要移掉 vue-i18n），不该为几条断言引入三个包。
// 这里用 vue 自带的 `createRenderer` 提供自定义 nodeOps，把渲染结果搭成一棵
// 可遍历的普通对象树，**不需要 DOM**。
//
// 🔴 两个曾踩到的坑（都会让测试变成「假绿」）：
//  1. 用 ref 抓组件实例再读 `subTree` —— ref 拿到的是公开实例代理，`subTree` 不在其上，
//     结果两版都 dump 出空数组，「都为空所以相等」，测试全绿但什么也没验证。
//     故此处改为从**渲染结果**取证。
//  2. 不注册桩组件就把组件树 dump 出来 —— 未解析的组件会把 prop 原样记为属性，
//     旧版直传的 `stripe=""`（空串）与新版传的 `stripe: true` 会显示成不同值，
//     而真实 EP 组件里 `stripe` 声明为 Boolean，两者解析结果都是 true。
//     故 `renderSFC` 支持注册桩组件，把「属性字符串」归一成「解析后的 prop 值」。
import './ts-resolve-hook.mjs'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { parse, compileScript } from 'vue/compiler-sfc'
import { createRenderer, createApp, defineComponent, h } from 'vue'

// 临时产物放 tests/.cache（`.cache/` 已在 .gitignore，任意层级生效，不污染工作树）。
// 🔴 不能放 node_modules 下：Node 拒绝对 node_modules 内的文件做类型擦除，
// 会抛 ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING（原实现即踩此坑）。
// 放项目内是为了让编译产物仍能向上解析到 `vue`。
const TMP_DIR = new URL('./.cache/sfc-render/', import.meta.url)
mkdirSync(TMP_DIR, { recursive: true })

/**
 * 把 .vue 单文件组件编译为可 import 的模块。
 * @param absPath SFC 绝对路径
 * @param tag 唯一标识（用于缓存文件名与 scopeId，同一文件重复加载会复用）
 */
export async function loadSFC(absPath, tag) {
  const source = readFileSync(absPath, 'utf8')
  const { descriptor, errors } = parse(source, { filename: absPath })
  if (errors.length) throw new Error(`SFC 解析失败 ${absPath}: ${errors[0].message}`)

  const { content } = compileScript(descriptor, { id: tag, inlineTemplate: true })
  // unplugin-auto-import 在构建期注入的 API，node 侧需手动补上。
  // 🔴 这份清单必须覆盖组件真实用到的那几个：组件里**不能**再显式 import 同名 API，
  // 否则与本行构成重复声明（SyntaxError: Identifier 'x' has already been declared）。
  // 故新增一个 Vue API 时，改这里而不是改组件——组件侧保持与线上一致的「不 import」形态。
  const autoImported = `import { computed, ref, reactive, watch, watchEffect, onMounted, onUnmounted, toRaw } from 'vue'\n`
  const file = new URL(`./${tag}.ts`, TMP_DIR)
  writeFileSync(file, autoImported + content)
  return (await import(file.href)).default
}

// 🔴 元素节点必须带一个真实存在的 `style` 对象。
// v-show 编译成 `[[vShow, …]]`，而 vShow 是 runtime-dom 的实现、**不走自定义渲染器的 patchProp**：
// 它直接读写 `el.style.display`。此前只被 v-if 覆盖的组件都侥幸躲过了这个洞，
// 组件一旦用 v-show（TiSearchForm 的高级搜索折叠区），渲染即抛
// "Cannot read properties of undefined (reading 'display')"。
const mkEl = (tag) => ({ tag, props: {}, style: {}, children: [], parent: null })
const mkText = (text) => ({ tag: '#text', text, props: {}, children: [], parent: null })

const ops = {
  createElement: mkEl,
  createText: mkText,
  createComment: (text) => ({ tag: '#comment', text, props: {}, children: [], parent: null }),
  setText: (n, t) => {
    n.text = t
  },
  setElementText: (el, t) => {
    el.children = [mkText(t)]
  },
  insert: (child, parent) => {
    child.parent = parent
    if (parent?.children) parent.children.push(child)
  },
  remove: (child) => {
    const p = child.parent
    if (!p) return
    const i = p.children.indexOf(child)
    if (i > -1) p.children.splice(i, 1)
  },
  parentNode: (n) => n.parent ?? null,
  nextSibling: (n) => {
    const p = n.parent
    if (!p) return null
    return p.children[p.children.indexOf(n) + 1] ?? null
  },
  patchProp: (el, key, _prev, next) => {
    el.props[key] = next
  },
  querySelector: () => null,
  setScopeId: () => {},
}

const { createApp: createAppWithRenderer } = createRenderer(ops)

/**
 * 构造桩组件：按给定 prop 类型声明渲染同名元素。
 * 目的是让 prop 走**真实的解析流程**（Boolean 类型的空串属性 → true），
 * 而非把原始属性值直接暴露出来。
 */
export function stubComponent(name, propDefs = {}) {
  return defineComponent({
    name,
    props: propDefs,
    setup(props, { slots }) {
      return () => h(`<${name}>`, { ...props }, slots.default ? slots.default() : undefined)
    },
  })
}

const invisible = (node) =>
  node.tag === '#comment' || (node.tag === '#text' && !node.text)

/**
 * 渲染组件并返回可遍历的结果树。
 * @param comp 组件
 * @param options.props 传入 props
 * @param options.slots 具名插槽 `{ default: () => [...] }`
 * @param options.stubs 桩组件数组（见 stubComponent）
 * @param options.plugins 需 `app.use` 的插件（如 i18n —— D-12 移除后即可不再传）
 * @param options.globalProperties 挂到 globalProperties 上的属性（如 `$t`）
 * @param options.silenceWarnings 是否在挂载期间静音 console.warn，默认 true。
 *   🔴 断言**挂载期告警**的用例必须传 false：静音发生在 renderSFC 内部，
 *   在调用方包一层 console.warn 是拦不到的（挂载结束后才还原成调用方那层）。
 */
export async function renderSFC(comp, options = {}) {
  const {
    props = {},
    slots = {},
    stubs = [],
    plugins = [],
    globalProperties = {},
    silenceWarnings = true,
  } = options
  const container = mkEl('#root')
  const App = defineComponent({
    setup: () => () =>
      h(comp, props, Object.fromEntries(Object.entries(slots).map(([k, fn]) => [k, fn]))),
  })
  const app = createAppWithRenderer(App)
  for (const p of plugins) app.use(p)
  for (const [k, v] of Object.entries(globalProperties)) app.config.globalProperties[k] = v
  for (const s of stubs) app.component(s.name, s)

  // 组件库的缺失告警会把测试输出淹掉，此处静音；真错误仍会抛出
  const warned = console.warn
  if (silenceWarnings) console.warn = () => {}
  try {
    app.mount(container)
  } finally {
    console.warn = warned
  }
  return container.children.filter((c) => !invisible(c))
}

/** 深度优先铺平结果树为文本行，便于断言与人工阅读 */
export function dumpTree(nodes, out = [], depth = 0) {
  for (const node of nodes) {
    if (invisible(node)) continue
    const keep = {}
    for (const k of Object.keys(node.props ?? {}).sort()) {
      if (k === 'class' || k === 'style' || k.startsWith('data-v-')) continue
      if (typeof node.props[k] === 'function') continue
      keep[k] = node.props[k]
    }
    const attrs = Object.keys(keep).length ? ` ${JSON.stringify(keep)}` : ''
    const text = node.tag === '#text' ? ` "${node.text}"` : ''
    out.push(`${'  '.repeat(depth)}${node.tag}${attrs}${text}`)
    dumpTree(node.children ?? [], out, depth + 1)
  }
  return out
}

/**
 * 在真实组件实例中运行一个组合式函数并取其返回值。
 * 必须 mount：`onMounted` 在没有活动实例时不会触发，而 useTable 的首屏自动加载依赖它
 * （不 mount 直接调，会拿到一条 Vue 警告且 `immediate` 路径根本没跑）。
 */
export async function mountComposable(factory) {
  let api
  const container = mkEl('#root')
  const app = createAppWithRenderer(
    defineComponent({
      setup() {
        api = factory()
        return () => h('div')
      },
    }),
  )
  app.mount(container)
  // 让 onMounted 里未 await 的异步链跑完（微任务先于 setTimeout 的宏任务）
  await new Promise((r) => setTimeout(r, 0))
  return api
}

/** 深度优先查找满足条件的节点 */
export function findNode(nodes, predicate) {
  for (const node of nodes) {
    if (predicate(node)) return node
    const hit = findNode(node.children ?? [], predicate)
    if (hit) return hit
  }
  return null
}

/**
 * 断言树中**没有**满足条件的节点。
 *
 * <p>🔴 不要写成 `assert.equal(findNode(tree, …), null)`。断言失败时 node 会 inspect
 * actual/expected 并做 Myers diff，而渲染树节点带 `parent` 回指、序列化后动辄两万字符，
 * 两个差异极大的大字符串做 diff 是 O(N·D)：实测直接把测试进程挂死 40 秒以上，
 * 表现为「整个文件超时失败」而不是一条断言失败——既没有可读的错误信息，也拖垮 CI。
 * 走到这里（真的存在该节点）说明被测代码已回归，那时最该看到的就是这条消息本身。</p>
 */
export function assertNoNode(nodes, predicate, message) {
  const hit = findNode(nodes, predicate)
  if (hit) assert.fail(`${message}（实际命中节点 ${String(hit.tag)}）`)
}

/** 取出所有匹配节点的 tag（用于「某元素是否存在」这类断言） */
export const tagsOf = (nodes) => dumpTree(nodes)
  .map((l) => l.trim().split(/[\s{]/)[0])
