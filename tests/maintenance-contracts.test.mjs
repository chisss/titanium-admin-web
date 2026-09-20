import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const maintenanceApiSource = await readFile(new URL('../src/api/maintenance.ts', import.meta.url), 'utf8')
const maintenanceListSource = await readFile(
  new URL('../src/views/maintenance/list/index.vue', import.meta.url),
  'utf8',
)
const dynamicRoutesSource = await readFile(new URL('../src/router/dynamicRoutes.ts', import.meta.url), 'utf8')
const maintenanceCreateSource = await readFile(
  new URL('../src/views/maintenance/create/index.vue', import.meta.url),
  'utf8',
)
const maintenanceConfigurationSource = await readFile(
  new URL('../src/views/maintenance/configuration/index.vue', import.meta.url),
  'utf8',
)
const maintenanceConfigurationEditorSource = await readFile(
  new URL('../src/views/maintenance/configuration/MaintenanceConfigurationEditor.vue', import.meta.url),
  'utf8',
)
const maintenanceWorkbenchSource = await readFile(
  new URL('../src/views/maintenance/workbench/index.vue', import.meta.url),
  'utf8',
)

test('保全列表和工作台使用 Maintenance 真实字段', () => {
  // 保全列表已按下游真实字段对齐（`caseId` 为案件主键、`maintenanceNo` 为保全号、
  // `policyNumber` 为保单号）；此前的 `id`/`policyId` 是下游不存在的臆造字段
  for (const field of ['caseId', 'maintenanceNo', 'policyNumber', 'customerId', 'itemCodes', 'effectStatus', 'createdAt']) {
    assert.match(maintenanceApiSource, new RegExp(`\\b${field}[?:]`))
  }
  assert.doesNotMatch(maintenanceApiSource, /\bworkOrderNo:/)
  assert.doesNotMatch(maintenanceApiSource, /\bpolicyNo:/)
  assert.doesNotMatch(maintenanceListSource, /prop="workOrderNo"|prop="policyNo"|prop="holderName"/)
  assert.match(maintenanceListSource, /prop="maintenanceNo"\s+label="保全号"/)
  assert.match(maintenanceListSource, /prop="policyNumber"\s+label="保单号"/)
  assert.match(maintenanceListSource, /row\.itemCodes/)
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
  assert.match(maintenanceWorkbenchSource, /保全收退费与资金凭证/)
  assert.match(maintenanceWorkbenchSource, /Billing 单号/)
  assert.match(maintenanceWorkbenchSource, /Payment 单号/)
})

test('POSTED 明确表示余额事实登记而非资金已结算', () => {
  assert.match(maintenanceApiSource, /premiumSettlementStatus/)
  assert.match(maintenanceApiSource, /fundSettlementEvidence/)
  assert.doesNotMatch(maintenanceWorkbenchSource, /POSTED[^\n]*(已退款|已收款)/)
})

test('费用工作区展示退款与佣金调整证据', () => {
  for (const field of ['refundInstructionId', 'refundOrderId', 'refundStatus', 'commissionAdjustmentCount']) {
    assert.match(maintenanceApiSource, new RegExp(field))
  }
  assert.match(maintenanceWorkbenchSource, /fundSettlementEvidence/)
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
  }
})

test('费用冲正使用独立入口并提示已退款场景转追加应收', () => {
  assert.match(maintenanceApiSource, /reversal-settlements/)
  assert.match(maintenanceApiSource, /sourceAdjustmentId/)
})

test('保全项配置为独立菜单且旧版详情入口已移除', () => {
  assert.match(dynamicRoutesSource, /title: '保全项配置', permission: 'maintenance:config:view'/)
  assert.doesNotMatch(dynamicRoutesSource, /MaintenanceDetail|maintenance\/detail/)
  assert.doesNotMatch(maintenanceListSource, /旧版详情|maintenance\/detail|保全项配置/)
  assert.doesNotMatch(maintenanceApiSource, /getMaintenanceDetail/)
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

test('保全配置提交人不能看到审批动作', () => {
  assert.match(maintenanceConfigurationSource, /useUserStore/)
  assert.match(maintenanceConfigurationSource, /lastAuditOperator\(row, 'SUBMITTED'\)/)
  assert.match(maintenanceConfigurationSource, /const isCurrentSubmitter =/)
  assert.match(maintenanceConfigurationSource, /需其他审批人/)
  assert.match(maintenanceConfigurationSource, /v-else-if="actionsFor\(configurationRow\(row\)\)\.length"/)
})

test('保全配置移动端固定操作列不遮挡业务字段', () => {
  // 🔴 原断言字面量 600px。该值已并入移动端档 $breakpoint-mobile(767)：JS 侧
  // useMediaQuery 一直按 767 判定，CSS 只在 ≤600 取消固定列，601–767 区间里
  // 固定操作列仍然遮挡业务字段——收敛后该规则生效范围才与 JS 判定对齐（范围变大，非变小）。
  assert.match(maintenanceConfigurationSource, /@media \(max-width: \$breakpoint-mobile\)/)
  assert.match(maintenanceConfigurationSource, /\.el-table-fixed-column--right/)
  assert.match(maintenanceConfigurationSource, /position: static !important/)
})

test('保全配置编辑器克隆数据前移除 Vue 响应式代理', () => {
  assert.match(maintenanceConfigurationEditorSource, /structuredClone\(toRaw\(value\)\)/)
  assert.match(maintenanceConfigurationEditorSource, /emit\('save', cloneRaw\(form\)\)/)
  assert.doesNotMatch(maintenanceConfigurationEditorSource, /structuredClone\(form\)/)
})

test('人工工作台按后端任务状态和领取事实展示操作', () => {
  assert.match(maintenanceWorkbenchSource, /task\.status === 'READY' && !task\.assignment/)
  assert.match(maintenanceWorkbenchSource, /task\.assignment\?\.assignee === userStore\.userInfo\?\.id/)
  assert.match(maintenanceWorkbenchSource, /task\.status === 'READY' && isAssignedToCurrentUser\(task\)/)
  assert.match(maintenanceWorkbenchSource, /status === 'IN_PROGRESS'/)
  assert.match(maintenanceWorkbenchSource, /isOwnedInProgress\(row\) && isReview\(row\)/)
  assert.match(maintenanceWorkbenchSource, /const isCreatorReviewTask =/)
  assert.match(maintenanceWorkbenchSource, /!isCreatorReviewTask\(task\)/)
  assert.doesNotMatch(maintenanceWorkbenchSource, /status === 'CLAIMED'|status === 'PROCESSING'/)
})

test('人工工作台展示约定生效时间并标明租户时区', () => {
  assert.match(maintenanceWorkbenchSource, /label="约定生效时间"/)
  assert.match(maintenanceWorkbenchSource, /const formatCaseEffectiveTime =/)
  assert.match(maintenanceWorkbenchSource, /detail\.value\.specificEffectiveDate/)
  assert.match(maintenanceWorkbenchSource, /detail\.value\.effectiveTimeType === 'IMMEDIATE'/)
  assert.match(maintenanceWorkbenchSource, /effectSchedule\?\.tenantZoneId \|\| 'Asia\/Shanghai'/)
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

test('人工工作台为受益人集合字段提供稳定对象上下文', () => {
  assert.match(maintenanceWorkbenchSource, /getPolicyBeneficiaries\(caseDetail\.policyId\)/)
  assert.match(maintenanceWorkbenchSource, /beneficiary\.beneficiaryId/)
  assert.match(maintenanceWorkbenchSource, /crypto\.randomUUID\(\)\.replaceAll\('-', ''\)/)
  assert.match(maintenanceWorkbenchSource, /fieldCode\.startsWith\('policy\.beneficiary\.'\)/)
  assert.match(maintenanceWorkbenchSource, /row\.objectId \|\| '保单主体'/)
})
