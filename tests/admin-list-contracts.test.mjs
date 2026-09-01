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

test('账单页面准确标注ID字段并移除无效投保人筛选', () => {
  assert.match(billingListSource, /prop="policyId"\s+label="保单ID"/)
  assert.match(billingListSource, /prop="customerId"\s+label="客户ID"/)
  assert.doesNotMatch(billingListSource, /queryParams\.holderName/)
  assert.doesNotMatch(billingApiSource, /\bholderName:\s*string/)

  assert.match(billingDetailSource, /label="保单ID">\{\{ bill\.policyId \}\}/)
  assert.match(billingDetailSource, /label="客户ID">\{\{ bill\.customerId \|\| '-' \}\}/)
  assert.match(billingDetailSource, /label="到期日">\{\{ bill\.dueDate \|\| '-' \}\}/)
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
