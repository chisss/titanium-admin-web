import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const billingListSource = await readFile(
  new URL('../src/views/billing/list/index.vue', import.meta.url),
  'utf8',
)
const billingApiSource = await readFile(new URL('../src/api/billing.ts', import.meta.url), 'utf8')
const billingDetailSource = await readFile(
  new URL('../src/views/billing/detail/index.vue', import.meta.url),
  'utf8',
)

test('账单列表在组件初始化时加载数据', () => {
  assert.match(
    billingListSource,
    /const\s*\{[^}]*\bfetchData\b[^}]*\}\s*=\s*\n?\s*useTable</s,
    '账单列表必须从 useTable 解构 fetchData',
  )
  assert.match(
    billingListSource,
    /\},\s*queryParams\)\s*\n\s*fetchData\(\)/,
    '账单列表必须在 useTable 初始化后立即调用 fetchData()',
  )
})

test('账单筛选使用下游支持的 policyId 参数', () => {
  assert.match(billingListSource, /label="保单ID"/)
  assert.match(billingListSource, /v-model="queryParams\.policyId"/)
  assert.match(billingListSource, /\bpolicyId:\s*''/)
  assert.doesNotMatch(billingListSource, /v-model="queryParams\.policyNo"/)

  assert.match(billingApiSource, /\bpolicyId:\s*string/)
  assert.doesNotMatch(billingApiSource, /\bpolicyNo:\s*string/)
})

test('账单页面以主键 billId 呈现账单号并移除无效投保人筛选', () => {
  // cc2c3a8 收敛了 ID 列的展示（保单ID/客户ID 列不再渲染），但筛选能力保留：
  // 账单号展示一律取主键 billId —— 遗留字段 billNo 在契约/响应/DB 三处皆无（D-501-47）
  assert.match(billingListSource, /prop="billId"\s+label="账单号"/)
  assert.doesNotMatch(billingListSource, /row\.billNo/)
  assert.doesNotMatch(billingListSource, /queryParams\.holderName/)
  assert.doesNotMatch(billingApiSource, /\bholderName:\s*string/)

  assert.match(billingDetailSource, /label="账单号">\{\{ bill\.billId \|\| '-' \}\}/)
  assert.match(billingDetailSource, /label="到期日">\{\{ formatDate\(bill\.dueDate\) \}\}/)
})

test('保单详情加载并展示险种专属标的信息', async () => {
  const policyApiSource = await readFile(new URL('../src/api/policy.ts', import.meta.url), 'utf8')
  const policyDetailSource = await readFile(
    new URL('../src/views/policy/detail/index.vue', import.meta.url),
    'utf8',
  )
  assert.match(policyApiSource, /getPolicySubjects\(policyId: string\)/)
  assert.match(policyApiSource, /\/web\/v1\/proxy\/policies\/\$\{policyId\}\/subjects/)
  assert.match(policyDetailSource, /getPolicySubjects\(route\.params\.id as string\)/)
  assert.match(policyDetailSource, /subjectFieldLabels/)
  assert.match(policyDetailSource, /licensePlate: '车牌号'/)
  assert.match(policyDetailSource, /subjectTypeLabel\(subject\.subjectType\)/)
  assert.match(policyDetailSource, /暂无被保标的信息/)
})
