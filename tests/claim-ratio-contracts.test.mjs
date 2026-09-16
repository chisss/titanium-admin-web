import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// 理赔金额量纲与权威来源契约（🔴 D-501-49 / D-501-50）
// 形态说明：源码文本断言。该缺陷的现场是**跨层**的（页面百分数录入 → HTTP 请求体 → 落库金额），
// 后端值对象单测结构上覆盖不到「前端到底发了什么」，此处锁定前端的契约遵守情况。
const claimApiSource = await readFile(new URL('../src/api/claim.ts', import.meta.url), 'utf8')
const claimDetailSource = await readFile(new URL('../src/views/claim/detail/index.vue', import.meta.url), 'utf8')

test('定损责任比例在提交前存在唯一量纲转换点（页面百分数 → 契约 0-1 小数）', () => {
  // 页面按百分数录入：`%` 后缀 + 上界 100
  assert.match(claimDetailSource, /:max="100"/)
  assert.match(claimDetailSource, /<span class="unit">%<\/span>/)

  // 契约口径是 0-1 小数，接口注释必须写明
  assert.match(claimApiSource, /liabilityRatio\?: number/)
  assert.match(claimApiSource, /\*\s*责任比例，\*\*0-1 小数\*\*/)

  // 转换点具名且只有一处
  assert.match(claimDetailSource, /const toLiabilityRatioDecimal = \(percent: number \| null \| undefined\)/)
  assert.match(claimDetailSource, /percent == null \? undefined : percent \/ 100/)
  assert.deepEqual(claimDetailSource.match(/\/ 100/g), ['/ 100'], '除以 100 的转换点必须唯一')

  // 提交时必须经过转换点，不得整体透传 percent 表单
  assert.match(claimDetailSource, /liabilityRatio: toLiabilityRatioDecimal\(assessmentForm\.liabilityRatio\)/)
  assert.doesNotMatch(claimDetailSource, /submitLossAssessment\(claimId, \{ \.\.\.assessmentForm \}\)/)
})

test('核赔结算预填以定损核定额为权威来源', () => {
  // 定损在案时聚合只认核定额，透传申报金额必被拒 —— 预填须优先取 assessedPayableAmount
  assert.match(claimApiSource, /assessedPayableAmount\?: number/)
  assert.match(
    claimDetailSource,
    /settleForm\.settledAmount = claim\.value\?\.assessedPayableAmount \?\? claim\.value\?\.claimAmount \?\? 0/,
  )

  // 详情页须向核赔员展示该权威金额，并在结算对话框中给出不可调提示
  assert.match(claimDetailSource, /v-if="claim\.assessedPayableAmount != null" label="定损核定"/)
  assert.match(claimDetailSource, /核定赔付金额须等于定损核定额/)
})
