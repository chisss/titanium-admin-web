import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../src/', import.meta.url))
const read = (relativePath) => readFile(join(src, relativePath), 'utf8')

test('字典下拉支持按场景剔除取值，且剔除能力只有一份实现', async () => {
  const source = await read('components/TiDictSelect/index.vue')

  // 剔除在组件内统一实现：模板必须渲染过滤后的集合，而不是直接渲染原始字典
  assert.match(source, /v-for="item in selectableOptions"/)
  assert.doesNotMatch(source, /v-for="item in dictOptions"/)
  assert.match(source, /excludeValues\?: string\[\]/)
  assert.match(source, /!props\.excludeValues\.includes\(item\.value\)/)
})

test('试算用例性别只允许确定性别，通配值不得进选项也不得作默认值', async () => {
  const source = await read('views/product/pricing-plans/index.vue')

  // 字典 GENDER 有 M/F/UNKNOWN/ALL，而试算入口只放行 M/F —— 剔除必须挂在选择器上
  assert.match(source, /dict-type="GENDER"[^>]*:exclude-values="TEST_CASE_GENDER_EXCLUDED"/)
  assert.match(source, /const TEST_CASE_GENDER_EXCLUDED = \['UNKNOWN', 'ALL'\]/)

  // 默认值不得是通配值，否则新建用例必然失败
  const defaultGender = source.match(/gender: '([^']*)'/)
  assert.ok(defaultGender, '新增用例必须显式给出性别默认值')
  assert.ok(
    !['ALL', 'UNKNOWN', ''].includes(defaultGender[1]),
    `新增用例的默认性别不得为通配值，当前为 ${defaultGender[1]}`,
  )
})

test('运行测试必须展示逐条明细，而不是只回报计数', async () => {
  const source = await read('views/product/pricing-plans/index.vue')

  assert.match(source, /testResult\?\.caseResults \|\| \[\]/)
  assert.match(source, /row\.passed \? '通过' : '失败'/)
  // 失败原因是唯一可自查线索（稳定错误码或可读文案），不得只有计数
  assert.match(source, /row\.failureReason \|\| '-'/)
  assert.match(source, /:loading="testRunning"/)
})

test('试算门禁出参在前端是强类型，明细字段与后端 VO 对齐', async () => {
  const source = await read('api/pricing.ts')

  // 出参不得退化为 Record<string, unknown>，否则明细会在类型层被静默丢弃
  assert.match(source, /PricingPlanValidation>\(`[^`]*test-cases:run`\)/)
  assert.doesNotMatch(source, /test-cases:run[^\n]*Record<string, unknown>/)

  for (const field of ['planContentHash', 'totalCases', 'passedCases', 'caseResults']) {
    assert.match(source, new RegExp(`interface PricingPlanValidation[\\s\\S]*?\\b${field}\\b`))
  }
  for (const field of ['caseCode', 'passed', 'expectedPremium', 'actualPremium', 'difference', 'failureReason']) {
    assert.match(source, new RegExp(`interface PricingTestCaseResult[\\s\\S]*?\\b${field}\\b`))
  }
})
