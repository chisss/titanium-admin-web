import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

// 列表页首屏加载契约（🔴 D-501-43）
// 形态说明：源码文本断言。该缺陷的现场是「页面已就绪但从不发请求」——
// 运行期表现为「暂无数据」，无报错、无加载残留，无法从后端或网络断言单点覆盖，
// 故此处锁定「首屏加载是 Hook 的默认行为 + 无一页遗漏」这条结构性事实。
const useTableSource = await readFile(new URL('../src/composables/useTable.ts', import.meta.url), 'utf8')

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

test('useTable 默认在挂载时自动加载首屏数据（把「忘记调用」变为不会发生的设计）', () => {
  // 默认开启：调用方不传 options 时也加载
  assert.match(useTableSource, /options\?\.immediate !== false/)
  assert.match(useTableSource, /onMounted\(\(\) => \{/)
  // 已由调用方发起过请求时不得重复发起（保证存量页面恰好一次首屏请求）
  assert.match(useTableSource, /let firstLoadStarted = false/)
  assert.match(useTableSource, /if \(options\?\.immediate !== false && !firstLoadStarted\)/)
  assert.match(useTableSource, /const fetchData = async \(\) => \{\n\s*firstLoadStarted = true/)
})

test('全部列表页均在首屏加载数据，无一页依赖「用户手动点搜索」', async () => {
  const views = await collectViews(new URL('../src/views/', import.meta.url))
  const offline = []
  const selfControlled = []
  for (const file of views) {
    const source = await readFile(file, 'utf8')
    if (!/useTable</.test(source)) continue
    // 显式关闭自动加载的页面必须自行调用 fetchData（否则与缺陷同型）
    if (/immediate: false/.test(source)) {
      selfControlled.push(file.pathname)
      if (!/fetchData\(\)/.test(source)) offline.push(file.pathname)
      continue
    }
    // 其余页面由 useTable 自动加载兜底，无需再手写调用
  }
  assert.deepEqual(offline, [], `以下页面关闭了自动加载却从未加载数据：${offline.join(', ')}`)
  // 自行控制首屏的页面须是可枚举的少数，新增时应显式声明理由
  assert.ok(selfControlled.length <= 3, `自行控制首屏加载的页面增多了：${selfControlled.join(', ')}`)

  // 核保工单列表页（缺陷现场）不再需要手写调用即可加载 —— 该页必须保持不含手写 fetchData 调用
  const underwriting = await readFile(new URL('../src/views/underwriting/list/index.vue', import.meta.url), 'utf8')
  assert.match(underwriting, /useTable</)
  assert.doesNotMatch(underwriting, /fetchData\(\)/)
})
