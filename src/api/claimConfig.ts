// 理赔配置中心接口（端点与 admin BFF ClaimConfigProxyController 一一对应）
import http from './http'

/**
 * 解析配置列表响应：admin BFF 的 ProxyResponseBodyAdvice 会把 list* 方法归一化为
 * PageVO {list,total}，同时兼容下游裸数组形态。
 */
async function resolveList<T>(url: string): Promise<T[]> {
  const payload = await http.get<unknown, T[] | { list?: T[]; records?: T[] }>(url)
  if (Array.isArray(payload)) return payload
  return payload?.list ?? payload?.records ?? []
}

/** 流程模板配置 VO */
export interface FlowTemplateVO {
  templateId: string
  insuranceLine: string
  claimType: string
  stageSequence: string[]
  stageTimeLimitHours?: Record<string, number>
  responsibleRole?: string
  mandatoryCheckpoints?: string[]
}

/** 赔付规则配置 VO */
export interface PayoutRuleVO {
  ruleId: string
  insuranceLine: string
  claimType: string
  deductible?: number
  payoutRatio?: number
  perClaimLimit?: number
  annualLimit?: number
  hospitalTierRatios?: Record<string, number>
  exclusions?: string[]
}

/** 快赔规则配置 VO */
export interface QuickPayRuleVO {
  ruleId: string
  claimType: string
  enabled: boolean
  amountThreshold?: number
}

/** 单证模板配置 VO */
export interface DocumentTemplateVO {
  templateId: string
  insuranceLine: string
  claimType: string
  requiredDocuments: string[]
  optionalDocuments?: string[]
}

/** 时限规则配置 VO */
export interface TimeLimitRuleVO {
  ruleId: string
  insuranceLine: string
  claimStage: string
  limitHours?: number
  alertHours?: number
}

/** 医院网络配置 VO */
export interface HospitalNetworkVO {
  hospitalId: string
  hospitalName: string
  hospitalLevel?: string
  agreementStatus: string
  payoutRatio?: number
  directSettlement?: boolean
  address?: string
  contactPhone?: string
}

/** 黑名单配置 VO */
export interface BlacklistVO {
  blacklistId: string
  subjectType: string
  subjectId: string
  subjectName: string
  reasonCode?: string
  status: string
  effectiveTime?: string
}

/** 医院协议状态中文映射（与 HospitalAgreementStatus 枚举对齐） */
export const HOSPITAL_STATUS_LABELS: Record<string, string> = {
  ACTIVE: '合作中',
  SUSPENDED: '已暂停',
  TERMINATED: '已终止',
}

/** 黑名单状态中文映射（与 BlacklistStatus 枚举对齐） */
export const BLACKLIST_STATUS_LABELS: Record<string, string> = {
  ACTIVE: '生效中',
  REVOKED: '已撤销',
}

// ==================== 流程模板 ====================

export function saveFlowTemplate(data: Partial<FlowTemplateVO>): Promise<string> {
  return http.post('/web/v1/proxy/claim-config/flow-templates', data) as Promise<string>
}

export function listFlowTemplates(): Promise<FlowTemplateVO[]> {
  return resolveList<FlowTemplateVO>('/web/v1/proxy/claim-config/flow-templates')
}

export function deleteFlowTemplate(templateId: string): Promise<void> {
  return http.delete(`/web/v1/proxy/claim-config/flow-templates/${templateId}`) as Promise<void>
}

// ==================== 赔付规则 ====================

export function savePayoutRule(data: Partial<PayoutRuleVO>): Promise<string> {
  return http.post('/web/v1/proxy/claim-config/payout-rules', data) as Promise<string>
}

export function listPayoutRules(): Promise<PayoutRuleVO[]> {
  return resolveList<PayoutRuleVO>('/web/v1/proxy/claim-config/payout-rules')
}

export function deletePayoutRule(ruleId: string): Promise<void> {
  return http.delete(`/web/v1/proxy/claim-config/payout-rules/${ruleId}`) as Promise<void>
}

// ==================== 快赔规则 ====================

export function saveQuickPayRule(data: Partial<QuickPayRuleVO>): Promise<string> {
  return http.post('/web/v1/proxy/claim-config/quick-pay-rules', data) as Promise<string>
}

export function listQuickPayRules(): Promise<QuickPayRuleVO[]> {
  return resolveList<QuickPayRuleVO>('/web/v1/proxy/claim-config/quick-pay-rules')
}

export function deleteQuickPayRule(ruleId: string): Promise<void> {
  return http.delete(`/web/v1/proxy/claim-config/quick-pay-rules/${ruleId}`) as Promise<void>
}

// ==================== 单证模板 ====================

export function saveDocumentTemplate(data: Partial<DocumentTemplateVO>): Promise<string> {
  return http.post('/web/v1/proxy/claim-config/document-templates', data) as Promise<string>
}

export function listDocumentTemplates(): Promise<DocumentTemplateVO[]> {
  return resolveList<DocumentTemplateVO>('/web/v1/proxy/claim-config/document-templates')
}

export function deleteDocumentTemplate(templateId: string): Promise<void> {
  return http.delete(`/web/v1/proxy/claim-config/document-templates/${templateId}`) as Promise<void>
}

// ==================== 时限规则 ====================

export function saveTimeLimitRule(data: Partial<TimeLimitRuleVO>): Promise<string> {
  return http.post('/web/v1/proxy/claim-config/time-limit-rules', data) as Promise<string>
}

export function listTimeLimitRules(): Promise<TimeLimitRuleVO[]> {
  return resolveList<TimeLimitRuleVO>('/web/v1/proxy/claim-config/time-limit-rules')
}

export function deleteTimeLimitRule(ruleId: string): Promise<void> {
  return http.delete(`/web/v1/proxy/claim-config/time-limit-rules/${ruleId}`) as Promise<void>
}

// ==================== 医院网络 ====================

export function saveHospitalNetwork(data: Partial<HospitalNetworkVO>): Promise<string> {
  return http.post('/web/v1/proxy/claim-config/hospital-networks', data) as Promise<string>
}

export function listHospitalNetworks(): Promise<HospitalNetworkVO[]> {
  return resolveList<HospitalNetworkVO>('/web/v1/proxy/claim-config/hospital-networks')
}

export function suspendHospital(hospitalId: string): Promise<void> {
  return http.put(`/web/v1/proxy/claim-config/hospital-networks/${hospitalId}/suspend`) as Promise<void>
}

export function activateHospital(hospitalId: string): Promise<void> {
  return http.put(`/web/v1/proxy/claim-config/hospital-networks/${hospitalId}/activate`) as Promise<void>
}

export function terminateHospital(hospitalId: string): Promise<void> {
  return http.put(`/web/v1/proxy/claim-config/hospital-networks/${hospitalId}/terminate`) as Promise<void>
}

export function deleteHospitalNetwork(hospitalId: string): Promise<void> {
  return http.delete(`/web/v1/proxy/claim-config/hospital-networks/${hospitalId}`) as Promise<void>
}

// ==================== 黑名单 ====================

export function saveBlacklist(data: Partial<BlacklistVO>): Promise<string> {
  return http.post('/web/v1/proxy/claim-config/blacklists', data) as Promise<string>
}

export function listBlacklists(): Promise<BlacklistVO[]> {
  return resolveList<BlacklistVO>('/web/v1/proxy/claim-config/blacklists')
}

export function revokeBlacklist(blacklistId: string): Promise<void> {
  return http.post(`/web/v1/proxy/claim-config/blacklists/${blacklistId}/revoke`) as Promise<void>
}

export function deleteBlacklist(blacklistId: string): Promise<void> {
  return http.delete(`/web/v1/proxy/claim-config/blacklists/${blacklistId}`) as Promise<void>
}
