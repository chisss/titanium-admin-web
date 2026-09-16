import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// 分页总数契约（🔴 D-501-57）
// 形态说明：源码文本断言。该缺陷的现场是「显示的条数是一个未经证实的断言」——
// 下游只返回裸数组，代理层无从得知总数，于是拿当前页条数冒充：用户看到「共 20 条」（实际 34 条），
// 第 2 页起在 UI 永久不可达，且没有任何报错。运行期无法用「接口返回什么」断言覆盖，
// 故锁定「未知必须如实表达为未知，且全链路无一处回退成数字」这条结构性事实。
const read = (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8')

const pageResult = await read('src/api/pageResult.ts')
const useTable = await read('src/composables/useTable.ts')
const usePagination = await read('src/composables/usePagination.ts')
const apiTypes = await read('src/types/api.d.ts')
const tiTable = await read('src/components/TiTable/index.vue')

/** 消费 PageResult 的 api 模块：归一化必须走 toPageResult，不得各自实现 */
const pageResultConsumers = [
  'src/api/customer.ts',
  'src/api/claim.ts',
  'src/api/insurance.ts',
  'src/api/policy.ts',
  'src/api/underwriting.ts',
]

test('分页结果类型把「总数未知」表达为 null，与 0 区分', () => {
  assert.match(apiTypes, /total: number \| null/)
  assert.match(usePagination, /total: number \| null/)
  assert.match(usePagination, /const setTotal = \(total: number \| null\)/)
})

test('归一化只在一处实现：裸数组取全集条数，分页对象保留 null 不回退', () => {
  // 裸数组的 length 是全集条数（该形态由本层一次取回、不分页），属精确值 ⇒ 可采信
  assert.match(pageResult, /total: Array\.isArray\(payload\) \? payload\.length : payload\?\.total \?\? null/)
  // 不得回退为当前页条数冒充总数
  assert.doesNotMatch(pageResult, /list\?\.length/)
})

test('所有消费 PageResult 的 api 模块共用归一化，不再各自伪造 total', async () => {
  for (const rel of pageResultConsumers) {
    const source = await read(rel)
    assert.match(source, /import \{ toPageResult \} from '\.\/pageResult'/, `${rel} 应复用归一化`)
    assert.match(source, /return toPageResult\(payload,/, `${rel} 应经 toPageResult 返回`)
    assert.doesNotMatch(source, /\?\? list\?\.length \?\? 0/, `${rel} 不得回退为当前页条数`)
  }
})

test('useTable 把未知总数原样透传，不压成 0', () => {
  assert.match(useTable, /setTotal\(result\?\.total \?\? null\)/)
  assert.doesNotMatch(useTable, /setTotal\(result\?\.total \?\? 0\)/)
})

test('总数未知时表格渲染无总数的翻页控件，而不是消失', () => {
  // 未知分支必须存在：既有的 `total > 0` 判断在 total 为 null 时会让整个分页区消失
  assert.match(tiTable, /v-else-if="total === null && data\.length > 0"/)
  assert.match(tiTable, /t\('common\.prevPage'\)/)
  assert.match(tiTable, /t\('common\.nextPage'\)/)
  // 「下一页」只在有证据表明后面还有时可用：本页未满 ⇒ 必是末页
  assert.match(tiTable, /const hasNextPage = computed\(\(\) => props\.data\.length >= props\.pageSize\)/)
})

test('客户列表走携带真实总数的分页契约', async () => {
  const customer = await read('src/api/customer.ts')
  assert.match(customer, /'\/web\/v1\/proxy\/customers\/page'/)
})

test('列表页的条数文案区分「共 N 条」与「总数未知」', async () => {
  const views = [
    ['src/views/policy/list/index.vue', '保单'],
    ['src/views/policy/application/index.vue', '投保单'],
    ['src/views/policy/intention/index.vue', '意向单'],
    ['src/views/claim/list/index.vue', '案件'],
  ]
  for (const [rel, noun] of views) {
    const source = await read(rel)
    assert.match(source, /v-if="pagination\.total === null"/, `${rel} 缺少未知总数分支`)
    assert.match(source, new RegExp(`共 <b>\\{\\{ pagination\\.total \\}\\}</b> 条${noun}`), rel)
  }
})

test('局部翻页状态同样不得把未知总数写成 0', async () => {
  const paymentOps = await read('src/views/billing/payment-operations/index.vue')
  assert.doesNotMatch(paymentOps, /total: result\.total \|\| 0/)
  assert.match(paymentOps, /total: result\.total \?\? null/)

  const maintenance = await read('src/views/maintenance/configuration/index.vue')
  assert.doesNotMatch(maintenance, /total\.value = result\.total \|\| 0/)
  assert.match(maintenance, /total\.value = result\.total \?\? null/)
})
