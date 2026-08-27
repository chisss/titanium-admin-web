import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const apiSource = await readFile(
  new URL('../src/api/payment-operations.ts', import.meta.url),
  'utf8',
)
const pageSource = await readFile(
  new URL('../src/views/billing/payment-operations/index.vue', import.meta.url),
  'utf8',
)

test('支付运营提供安全事件查询并保持分页契约', () => {
  assert.match(apiSource, /getPaymentCallbackSecurityEvents/)
  assert.match(apiSource, /\/web\/v1\/proxy\/payment-operations\/callback-security-events/)
  assert.match(apiSource, /interface CallbackSecurityEventQuery extends PageParams/)
})

test('安全告警页支持渠道版本、事件类型和告警状态筛选', () => {
  assert.match(pageSource, /label="安全告警" name="security-events"/)
  assert.match(pageSource, /v-model="securityQuery\.channelCode"/)
  assert.match(pageSource, /v-model="securityQuery\.keyVersion"/)
  assert.match(pageSource, /v-model="securityQuery\.eventType"/)
  assert.match(pageSource, /v-model="securityQuery\.alertTriggered"/)
})

test('回调审计展示安全模式但不暴露安全摘要或密钥', () => {
  assert.match(pageSource, /row\.securityMode/)
  assert.match(pageSource, /prop="keyVersion" label="密钥版本"/)
  assert.match(pageSource, /v-model="callbackQuery\.securityMode"/)
  assert.doesNotMatch(apiSource, /^\s*(signatureHash|nonceHash|secret)\??:/m)
  assert.doesNotMatch(pageSource, /row\.(signatureHash|nonceHash|secret)/)
})

test('安全事件接口模型不包含可重放凭据', () => {
  assert.match(apiSource, /interface PaymentCallbackSecurityEventVO/)
  assert.doesNotMatch(apiSource, /^\s*(nonce|signature|callbackSecret)\??:/m)
})
