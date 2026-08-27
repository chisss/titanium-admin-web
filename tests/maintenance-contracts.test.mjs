import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const maintenanceApiSource = await readFile(new URL('../src/api/maintenance.ts', import.meta.url), 'utf8')
const maintenanceListSource = await readFile(
  new URL('../src/views/maintenance/list/index.vue', import.meta.url),
  'utf8',
)
const maintenanceDetailSource = await readFile(
  new URL('../src/views/maintenance/detail/index.vue', import.meta.url),
  'utf8',
)
const maintenanceCreateSource = await readFile(
  new URL('../src/views/maintenance/create/index.vue', import.meta.url),
  'utf8',
)
const maintenanceConfigurationSource = await readFile(
  new URL('../src/views/maintenance/configuration/index.vue', import.meta.url),
  'utf8',
)
const maintenanceWorkbenchSource = await readFile(
  new URL('../src/views/maintenance/workbench/index.vue', import.meta.url),
  'utf8',
)

test('保全列表和详情使用 Maintenance 真实字段', () => {
  for (const field of ['id', 'policyId', 'customerId', 'createdAt', 'premiumSettlementStatus']) {
    assert.match(maintenanceApiSource, new RegExp(`\\b${field}[?:]`))
  }
  assert.doesNotMatch(maintenanceApiSource, /\bworkOrderNo:/)
  assert.doesNotMatch(maintenanceApiSource, /\bpolicyNo:/)
  assert.doesNotMatch(maintenanceListSource, /prop="workOrderNo"|prop="policyNo"|prop="holderName"/)
  assert.match(maintenanceListSource, /prop="id"\s+label="保全ID"/)
  assert.match(maintenanceListSource, /prop="policyId"\s+label="保单ID"/)
  assert.match(maintenanceListSource, /prop="customerId"\s+label="客户ID"/)
})

test('保全列表将前端分页转换为 Maintenance search 参数', () => {
  assert.match(maintenanceApiSource, /page:\s*Math\.max\(pageNum\s*-\s*1,\s*0\)/)
  assert.match(maintenanceApiSource, /size:\s*pageSize/)
  assert.match(maintenanceListSource, /\bfetchData\(\)/)
  assert.match(maintenanceApiSource, /Promise<PageResult<MaintenanceVO>>/)
})

test('审核方法与 Admin PUT 路由保持一致', () => {
  assert.match(maintenanceApiSource, /http\.put\(`\/web\/v1\/proxy\/policies\/maintenance\/\$\{id\}\/approve`/)
  assert.match(maintenanceApiSource, /http\.put\(`\/web\/v1\/proxy\/policies\/maintenance\/\$\{id\}\/reject`/)
})

test('费用计算使用平铺结构化输入并展示完整证据链', () => {
  for (const field of [
    'originalCalculationId',
    'productId',
    'productVersion',
    'businessTime',
    'sumInsured',
    'paymentTermYears',
    'underwritingAdjustments',
  ]) {
    assert.match(maintenanceApiSource, new RegExp(`\\b${field}:`))
  }
  assert.doesNotMatch(maintenanceApiSource, /recalculationInput/)
  assert.match(maintenanceApiSource, /premium-settlements/)
  assert.match(maintenanceDetailSource, /Product 差额ID/)
  assert.match(maintenanceDetailSource, /Billing 登记ID/)
  assert.match(maintenanceDetailSource, /余额方向/)
})

test('POSTED 明确表示余额事实登记而非资金已结算', () => {
  assert.match(maintenanceDetailSource, /余额事实已登记\/待结算/)
  assert.match(maintenanceDetailSource, /余额事实已登记\/资金已结算/)
  assert.match(maintenanceDetailSource, /premiumSettlementStatus === 'SETTLED'/)
  assert.match(maintenanceDetailSource, /不表示已完成收款或退款/)
  assert.doesNotMatch(maintenanceDetailSource, /POSTED[^\n]*(已退款|已收款)/)
})

test('费用工作区展示退款与佣金调整证据', () => {
  for (const field of ['refundInstructionId', 'refundOrderId', 'refundStatus', 'commissionAdjustmentCount']) {
    assert.match(maintenanceApiSource, new RegExp(field))
    assert.match(maintenanceDetailSource, new RegExp(field))
  }
  assert.match(maintenanceDetailSource, /SETTLEMENT_PENDING/)
  assert.match(maintenanceDetailSource, /SETTLEMENT_FAILED/)
  assert.match(maintenanceDetailSource, /SETTLED/)
})

test('退保使用专用现金价值接口和输入，不复用普通费用重算', () => {
  for (const field of [
    'surrenderDate',
    'policyYear',
    'businessTime',
    'reason',
    'updatedBy',
  ]) {
    assert.match(maintenanceApiSource, new RegExp(`\\b${field}:`))
  }
  assert.match(maintenanceApiSource, /surrender-settlements/)
  assert.match(maintenanceDetailSource, /maintenanceType === 'POLICY_TERMINATION'/)
  assert.match(maintenanceDetailSource, /退保价值输入/)
  assert.match(maintenanceDetailSource, /handleSurrenderSettlement/)
})

test('退保详情展示可审计的策略版本和现金价值证据', () => {
  for (const field of [
    'surrenderPolicyCode',
    'surrenderPolicyVersion',
    'surrenderPolicyContentHash',
    'coolingOffDays',
    'surrenderRefundType',
    'withinCoolingOff',
    'cashValueRate',
    'retainedCustomerAmount',
    'internalCostRetentionRate',
  ]) {
    assert.match(maintenanceApiSource, new RegExp(field))
    assert.match(maintenanceDetailSource, new RegExp(field))
  }
  assert.match(maintenanceDetailSource, /现金价值率/)
  assert.match(maintenanceDetailSource, /退保策略哈希/)
  assert.match(maintenanceDetailSource, /犹豫期结论/)
})

test('费用冲正使用独立入口并提示已退款场景转追加应收', () => {
  assert.match(maintenanceApiSource, /reversal-settlements/)
  assert.match(maintenanceApiSource, /sourceAdjustmentId/)
  assert.match(maintenanceDetailSource, /maintenanceType === 'POLICY_REVERSAL'/)
  assert.match(maintenanceDetailSource, /handleReversalSettlement/)
  assert.match(maintenanceDetailSource, /已退款金额转为追加应收/)
})

test('保全配置列表摘要使用顶层字段并兼容详情结构', () => {
  for (const field of ['itemCode', 'configurationVersion', 'name']) {
    assert.match(maintenanceApiSource, new RegExp(`\\b${field}\\?:`))
  }
  assert.match(maintenanceCreateSource, /item\.itemCode \|\| item\.definition\?\.itemCode/)
  assert.match(maintenanceCreateSource, /item\.name \|\| item\.definition\?\.name/)
  assert.match(maintenanceConfigurationSource, /row\.itemCode \|\| row\.definition\?\.itemCode/)
  assert.match(maintenanceConfigurationSource, /row\.name \|\| row\.definition\?\.name/)
  assert.match(maintenanceConfigurationSource, /row\.configurationVersion \|\| row\.definition\?\.version/)
})

test('保全配置摘要缺少流程详情时不展示虚假的零步骤', () => {
  assert.match(maintenanceConfigurationSource, /const workflowLabel =/)
  assert.match(maintenanceConfigurationSource, /row\.definition\s*\n\s*\?/)
  assert.doesNotMatch(maintenanceConfigurationSource, /row\.definition\?\.steps\?\.length \|\| 0/)
})

test('保全配置移动端固定操作列不遮挡业务字段', () => {
  assert.match(maintenanceConfigurationSource, /@media \(max-width: 600px\)/)
  assert.match(maintenanceConfigurationSource, /\.el-table-fixed-column--right/)
  assert.match(maintenanceConfigurationSource, /position: static !important/)
})

test('人工工作台按后端任务状态和领取事实展示操作', () => {
  assert.match(maintenanceWorkbenchSource, /task\.status === 'READY' && !task\.assignment/)
  assert.match(maintenanceWorkbenchSource, /task\.assignment\?\.assignee === userStore\.userInfo\?\.id/)
  assert.match(maintenanceWorkbenchSource, /task\.status === 'READY' && isAssignedToCurrentUser\(task\)/)
  assert.match(maintenanceWorkbenchSource, /status === 'IN_PROGRESS'/)
  assert.match(maintenanceWorkbenchSource, /isOwnedInProgress\(row\) && isReview\(row\)/)
  assert.doesNotMatch(maintenanceWorkbenchSource, /status === 'CLAIMED'|status === 'PROCESSING'/)
})

test('人工工作台从冻结配置生成首录字段并使用正式生效入口', () => {
  assert.match(maintenanceWorkbenchSource, /getMaintenanceConfiguration\(item\.configurationId!\)/)
  assert.match(maintenanceWorkbenchSource, /fieldRulesByItem/)
  assert.match(maintenanceWorkbenchSource, /:data="fieldEntryRows"/)
  assert.match(maintenanceWorkbenchSource, /objectId: row\.objectId \|\| null/)
  assert.match(maintenanceWorkbenchSource, /task\.taskId, 'effect'/)
  assert.match(maintenanceWorkbenchSource, /v-if="detail\.effectSchedule\?\.scheduleId"/)
  assert.match(maintenanceWorkbenchSource, /await refreshAfterMutation\(\)/)
})
