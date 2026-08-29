// 保全相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 保全工单 VO，与 Maintenance Web 出参保持一致。 */
export interface MaintenanceVO {
  maintenanceNo?: string
  id: string
  policyId: string
  customerId: string
  maintenanceType: string
  totalAmount?: number
  refundAmount?: number
  premiumSettlementStatus?: string
  originalCalculationId?: string
  replacementCalculationId?: string
  premiumAdjustmentId?: string
  premiumAdjustmentResultHash?: string
  billingPostingId?: string
  refundInstructionId?: string
  refundOrderId?: string
  refundStatus?: string
  commissionAdjustmentCount?: number
  balanceDirection?: string
  balanceAmount?: number
  balanceCurrency?: string
  surrenderPolicyCode?: string
  surrenderPolicyVersion?: string
  surrenderPolicyContentHash?: string
  surrenderPolicyYear?: number
  coolingOffDays?: number
  surrenderRefundType?: string
  withinCoolingOff?: boolean
  cashValueRate?: number
  retainedCustomerAmount?: number
  internalCostRetentionRate?: number
  effectiveTimeType?: string
  specificEffectiveDate?: string
  description?: string
  status: string
  createdAt: string
  createdBy?: string
  updatedAt?: string
  updatedBy?: string
  tenantId?: string
}

/** Product 重算使用的核保调整。 */
export interface UnderwritingAdjustmentInput {
  adjustmentCode: string
  type: string
  value: number
  reason?: string
  ruleVersion?: string
}

/** 发起保全费用重算和余额事实登记请求。 */
export interface PremiumSettlementRequest {
  originalCalculationId: string
  productId: string
  productVersion: string
  businessTime: string
  currency: string
  sumInsured: number
  age: number
  gender: string
  paymentTermYears: number
  coverageTermYears: number
  paymentPeriods: number
  requestSnapshot: Record<string, unknown>
  underwritingAdjustments: UnderwritingAdjustmentInput[]
  channelId?: string
  policyYear: number
  reason: string
}

/** Product 差额事实与 Billing 余额事实登记结果。 */
export interface PremiumSettlementVO {
  maintenanceId: string
  premiumSettlementStatus: string
  originalCalculationId: string
  replacementCalculationId?: string
  adjustmentId?: string
  adjustmentResultHash?: string
  billingPostingId?: string
  billingPostingStatus?: string
  refundInstructionId?: string
  refundOrderId?: string
  refundStatus?: string
  commissionAdjustmentCount?: number
  direction?: string
  amount?: number
  currency?: string
}

/** 发起退保现金价值计算和退款结算请求。 */
export interface SurrenderSettlementRequest {
  originalCalculationId: string
  surrenderDate: string
  policyYear: number
  businessTime: string
  reason: string
  updatedBy: string
}

/** 退保价值策略证据和资金结算结果。 */
export interface SurrenderSettlementVO {
  settlement: PremiumSettlementVO
  policyCode: string
  policyVersion: string
  policyContentHash: string
  policyYear: number
  coolingOffDays: number
  refundType: string
  withinCoolingOff: boolean
  cashValueRate: number
  retainedCustomerAmount: number
  internalCostRetentionRate: number
}

export interface MaintenanceListParams extends PageParams {
  policyId?: string
  policyNumber?: string
  customerId?: string
  maintenanceType?: string
  status?: string
}

/** 独立保全案件列表摘要。 */
export interface MaintenanceCaseSummary {
  maintenanceNo?: string
  caseId: string
  policyId: string
  policyNumber?: string
  customerId: string
  itemCodes: string[]
  source: 'API' | 'MANUAL'
  status: string
  effectStatus?: string
  operatorId?: string
  createdAt: string
  updatedAt?: string
}

export interface MaintenanceCasePage {
  list: MaintenanceCaseSummary[]
  total: number
  page: number
  size: number
  totalPages?: number
}

export interface MaintenanceCaseItem {
  itemCode: string
  itemName?: string
  itemCategory?: string
  configurationId?: string
  configurationVersion?: string
  configurationContentHash?: string
  offeringId?: string
  offeringVersion?: string
  offeringContentHash?: string
  withdrawalStatus?: string
  withdrawalReason?: string
  withdrawalAmount?: number
  withdrawalCurrency?: string
}

export interface MaintenanceWorkflowTask {
  taskId: string
  itemCode: string
  itemOrder: number
  sequence: number
  stepType: string
  mode: string
  conditionRuleCode?: string
  status: string
  assignment?: { assignee: string; claimedAt?: string }
  retryCount?: number
  failure?: { failureCode?: string; failureReason?: string }
  reviewEvidence?: { decision?: string; policyCode?: string; policyVersion?: string; comment?: string }
  underwritingEvidence?: { conclusion?: string; ruleVersion?: string; modelVersion?: string; summary?: string }
  premiumQuoteEvidence?: {
    status?: string; quoteId?: string; quoteVersion?: string; pricingPlanVersion?: string
    detailSummary?: string; direction?: string; amount?: number; currency?: string; resultHash?: string
  }
  billingPostingEvidence?: {
    postingId?: string; adjustmentId?: string; status?: string; direction?: string
    amount?: number; currency?: string; resultHash?: string
  }
  fundSettlementEvidence?: {
    type?: string; status?: string; sourcePostingId?: string; instructionId?: string
    orderId?: string; externalStatus?: string; amount?: number; currency?: string
    failureCode?: string; failureMessage?: string
  }
  effectEvidence?: { request?: { requestId?: string; expectedPolicyVersion?: number; effectiveTimeType?: string }; application?: { endorsementNo?: string; actualPolicyVersion?: number; applicationHash?: string } }
  lastOperation?: { operationId?: string; action?: string; reason?: string; operatedAt?: string; operatedBy?: string }
}

export interface MaintenanceFieldChange {
  itemCode: string
  objectId?: string
  fieldCode: string
  labelKey?: string
  dataType?: string
  baseValue?: string
  currentValue?: string
  proposedValue?: string
  appliedValue?: string
  conflictStatus?: string
  resolutionCode?: string
  resolutionReason?: string
  resolvedBy?: string
  resolvedAt?: string
  sensitivity?: string
  maskingPolicy?: string
  changeTypeCode?: string
}

export interface MaintenanceSnapshotReference {
  storageKey?: string
  contentHash?: string
  policyVersion?: number
  capturedAt?: string
}

export interface MaintenanceCaseDetail {
  caseId: string
  policyId: string
  policyNumber?: string
  customerId: string
  productId?: string
  productVersion?: string
  planVersion?: string
  policyBaselineVersion?: number
  businessEffectiveAt?: string
  source: 'API' | 'MANUAL'
  status: string
  effectStatus?: string
  effectCompensation?: Record<string, unknown>
  effectSchedule?: {
    scheduleId?: string; status?: string; tenantZoneId?: string; nextExecutionAt?: string
    attemptCount?: number; lastAttemptId?: string; lastAttemptAt?: string
    lastErrorCode?: string; lastErrorMessage?: string
  }
  retroactiveImpactAnalysis?: { analysisId?: string; status?: string; itemCount?: number; blockingItemCount?: number; pendingItemCount?: number; resultHash?: string; scopeFrom?: string; scopeTo?: string }
  retroactivePeriodRecalculation?: { periodRecalculationId?: string; status?: string; periodCount?: number; direction?: string; amount?: number; currency?: string; billingBatchId?: string; failureMessage?: string }
  effectiveTimeType?: string
  specificEffectiveDate?: string
  description?: string
  createdBy?: string
  createdAt?: string
  updatedBy?: string
  updatedAt?: string
  items: MaintenanceCaseItem[]
  workflowTasks: MaintenanceWorkflowTask[]
  fieldChanges: MaintenanceFieldChange[]
  snapshots?: { before?: MaintenanceSnapshotReference; proposed?: MaintenanceSnapshotReference; applied?: MaintenanceSnapshotReference }
}

export interface CreateMaintenanceCaseRequest {
  policyId: string
  itemCodes: string[]
  effectiveTimeType: string
  specificEffectiveDate?: string
  description?: string
  clientRequestKey: string
}

export interface MaintenanceConfigurationFieldRule {
  fieldCode: string
  required: boolean
  visible: boolean
  editable: boolean
  allowClear: boolean
  expectedValueType?: string
  validationType?: MaintenanceFieldValidationType
  validationPattern?: string
  validationMessage?: string
}

export type MaintenanceFieldValidationType =
  | 'NONE'
  | 'EMAIL'
  | 'MOBILE_CN'
  | 'GENDER'
  | 'ID_CARD_CN'
  | 'POSTAL_CODE_CN'
  | 'CUSTOM_REGEX'

export interface MaintenanceConfigurationStep {
  sequence: number
  stepType: string
  mode: string
  conditionRuleCode?: string
}

export interface MaintenanceConfigurationPayload {
  definition: {
    itemCode: string
    version: string
    name: string
    category: string
    channels: string[]
    fieldRules: MaintenanceConfigurationFieldRule[]
    steps: MaintenanceConfigurationStep[]
    feeMode: string
    effectiveRule: {
      allowedModes: string[]
      defaultMode: string
      maxRetroactiveDays: number
      maxFutureDays: number
    }
    incompatibleItemCodes: string[]
    atomicOnly: boolean
    controls: {
      channelCapabilities: Array<{ channel: string; autoApprovalAllowed: boolean }>
      materialRequirements: Array<{ materialCode: string; required: boolean; conditionRuleCode?: string }>
      crossFieldRuleCodes: string[]
      approvalPolicyCode?: string
      feeRule: { formulaCode?: string; settlementGateRuleCode?: string; recalculationTiming: string }
      accessRule: { operationPermissionCodes: string[]; viewPermissionCodes: string[] }
      outputRule: { voucherTemplateCode?: string; notificationTemplateCodes: string[]; archiveTemplateCode?: string }
    }
  }
  validFrom: string
  validTo?: string
}

export interface MaintenanceConfigurationSummary {
  configurationId: string
  itemCode?: string
  configurationVersion?: string
  name?: string
  revisionOfConfigurationId?: string
  status: string
  validFrom: string
  validTo?: string
  contentHash?: string
  rowVersion?: number
  etag?: string
  stepCount?: number
  feeMode?: string
  updatedAt?: string
  definition?: {
    itemCode: string
    version: string
    name: string
    category?: string
    channels?: string[]
    fieldRules?: MaintenanceConfigurationFieldRule[]
    steps?: MaintenanceConfigurationStep[]
    feeMode?: string
    effectiveRule?: { allowedModes?: string[]; defaultMode?: string; maxRetroactiveDays?: number; maxFutureDays?: number }
    incompatibleItemCodes?: string[]
    controls?: MaintenanceConfigurationPayload['definition']['controls']
  }
  publicationEvidence?: { catalogVersion?: string; catalogHash?: string; validatedAt?: string }
  lifecycleAudits?: Array<{ action: string; operatorId: string; occurredAt: string; detail?: string }>
}

export function getMaintenanceCaseList(params: Partial<MaintenanceListParams>): Promise<MaintenanceCasePage> {
  const { pageNum = 1, pageSize = 20, ...filters } = params
  return http.get('/web/v1/proxy/maintenance/cases', {
    params: { ...filters, page: Math.max(pageNum - 1, 0), size: pageSize },
  }) as Promise<MaintenanceCasePage>
}

export function getMaintenanceCaseDetail(caseId: string): Promise<MaintenanceCaseDetail> {
  return http.get(`/web/v1/proxy/maintenance/cases/${caseId}`) as Promise<MaintenanceCaseDetail>
}

export function createMaintenanceCase(request: CreateMaintenanceCaseRequest): Promise<{ maintenanceId: string }> {
  return http.post('/web/v1/proxy/maintenance/cases', request) as Promise<{ maintenanceId: string }>
}

export function operateMaintenanceTask(caseId: string, taskId: string, action: string, body: Record<string, unknown>): Promise<unknown> {
  return http.post(`/web/v1/proxy/maintenance/cases/${caseId}/tasks/${taskId}/${action}`, body)
}

export function recordMaintenanceFieldChanges(caseId: string, itemCode: string, proposals: Array<Record<string, unknown>>): Promise<void> {
  return http.put(`/web/v1/proxy/maintenance/cases/${caseId}/items/${itemCode}/changes`, { proposals }) as Promise<void>
}

export function operateMaintenanceCase(caseId: string, action: string, body: Record<string, unknown>): Promise<unknown> {
  return http.post(`/web/v1/proxy/maintenance/cases/${caseId}/${action}`, body)
}

export async function getMaintenanceConfigurations(params: { itemCode?: string; status?: string; pageNum?: number; pageSize?: number } = {}): Promise<{ list: MaintenanceConfigurationSummary[]; total: number; page: number; size: number }> {
  const { pageNum = 1, pageSize = 20, ...filters } = params
  const result = await http.get('/web/v1/proxy/maintenance/configurations', {
    params: { ...filters, page: Math.max(pageNum - 1, 0), size: pageSize },
  }) as unknown as { items?: MaintenanceConfigurationSummary[]; list?: MaintenanceConfigurationSummary[]; total: number; page: number; size: number }
  return { ...result, list: result.items || result.list || [] }
}

export function getMaintenanceConfiguration(id: string): Promise<MaintenanceConfigurationSummary> {
  return http.get(`/web/v1/proxy/maintenance/configurations/${id}`) as Promise<MaintenanceConfigurationSummary>
}

export function createMaintenanceConfiguration(
  body: MaintenanceConfigurationPayload,
): Promise<MaintenanceConfigurationSummary> {
  return http.post('/web/v1/proxy/maintenance/configurations', body) as Promise<MaintenanceConfigurationSummary>
}

export function replaceMaintenanceConfiguration(
  id: string,
  etag: string,
  body: MaintenanceConfigurationPayload,
): Promise<MaintenanceConfigurationSummary> {
  return http.put(`/web/v1/proxy/maintenance/configurations/${id}`, body, {
    headers: { 'If-Match': etag },
  }) as Promise<MaintenanceConfigurationSummary>
}

export function createMaintenanceConfigurationRevision(
  id: string,
  etag: string,
  body: { version: string; validFrom: string; validTo?: string },
): Promise<MaintenanceConfigurationSummary> {
  return operateMaintenanceConfiguration(id, 'revisions', etag, body)
}

export function operateMaintenanceConfiguration(id: string, action: string, ifMatch?: string, body: Record<string, unknown> = {}): Promise<MaintenanceConfigurationSummary> {
  return http.post(`/web/v1/proxy/maintenance/configurations/${id}/${action}`, body, {
    headers: ifMatch ? { 'If-Match': ifMatch } : undefined,
  }) as Promise<MaintenanceConfigurationSummary>
}

/** 保全工单列表。 */
export function getMaintenanceList(params: MaintenanceListParams): Promise<PageResult<MaintenanceVO>> {
  const { pageNum, pageSize, ...filters } = params
  return http.get('/web/v1/proxy/policies/maintenance', {
    params: { ...filters, page: Math.max(pageNum - 1, 0), size: pageSize },
  }) as Promise<PageResult<MaintenanceVO>>
}

/** 审核通过。 */
export function approveMaintenance(id: string, changeReason?: string): Promise<void> {
  return http.put(`/web/v1/proxy/policies/maintenance/${id}/approve`, { changeReason }) as Promise<void>
}

/** 审核驳回。 */
export function rejectMaintenance(id: string, changeReason: string): Promise<void> {
  return http.put(`/web/v1/proxy/policies/maintenance/${id}/reject`, { changeReason }) as Promise<void>
}

/** 发起 Product 替代计算，并将客户余额差额登记到 Billing。 */
export function createPremiumSettlement(
  id: string,
  request: PremiumSettlementRequest,
): Promise<PremiumSettlementVO> {
  return http.post(`/web/v1/proxy/policies/maintenance/${id}/premium-settlements`, request) as Promise<PremiumSettlementVO>
}

/** 按 Product 退保价值策略计算现金价值，并登记 Billing/Payment 退款。 */
export function createSurrenderSettlement(
  id: string,
  request: SurrenderSettlementRequest,
): Promise<SurrenderSettlementVO> {
  return http.post(
    `/web/v1/proxy/policies/maintenance/${id}/surrender-settlements`,
    request,
  ) as Promise<SurrenderSettlementVO>
}

/** 基于既有生命周期差额发起冲正并登记反向余额事实。 */
export interface ReversalSettlementRequest {
  sourceAdjustmentId: string
  businessTime: string
  reason: string
}

export function createReversalSettlement(
  id: string,
  request: ReversalSettlementRequest,
): Promise<PremiumSettlementVO> {
  return http.post(
    `/web/v1/proxy/policies/maintenance/${id}/reversal-settlements`,
    request,
  ) as Promise<PremiumSettlementVO>
}
