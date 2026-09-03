// 理赔相关接口（端点与 admin BFF ClaimProxyController 一一对应，字段与下游 ClaimResponseVO 对齐）
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 理赔案件 VO（字段与 claim 域 ClaimResponseVO 对齐） */
export interface ClaimCaseVO {
  claimId: string
  customerId: string
  policyId: string
  claimNumber: string
  claimType: string
  incidentDate: string
  incidentDescription: string
  claimAmount?: number
  status: string
  /** 理赔处理阶段码（REPORT/SURVEY/LOSS_ASSESS/APPROVAL/...） */
  phase?: string
  /** 核定赔付金额（结算后填充） */
  settledAmount?: number
  /** 赔付状态码（PROCESSING/SUCCESS/FAILED/CLOSED/REJECTED_CLOSED） */
  paymentStatus?: string
  /** 赔付状态中文描述 */
  paymentStatusDescription?: string
  /** 支付单号 */
  paymentNo?: string
  /** 拒赔原因编码 */
  rejectionReason?: string
  /** 拒赔时间 */
  rejectedAt?: string
  /** 结案时间 */
  closedAt?: string
  createdAt: string
  updatedAt: string
}

/** 赔付结案入参（字段与 SettleClaimDTO 对齐） */
export interface SettleRequest {
  settledAmount: number
  payoutMethod: string
  payeeAccount?: string
  conclusion?: string
}

/** 查勘入参（字段与 SubmitSurveyDTO 对齐） */
export interface SurveyRequest {
  surveyorId: string
  surveyReport?: string
  photos?: string[]
  conclusion?: string
}

/** 定损入参（字段与 SubmitLossAssessmentDTO 对齐） */
export interface LossAssessmentRequest {
  assessedAmount: number
  liabilityRatio?: number
  assessorId: string
  items?: Array<{ itemName: string; amount: number }>
}

/** 拒赔入参（字段与 RejectClaimDTO 对齐，reasonCode 为枚举 code） */
export interface RejectRequest {
  reasonCode: string
  comment?: string
}

/** 身故/全残给付入参（字段与 SettleDeathBenefitDTO/SettleDisabilityBenefitDTO 对齐） */
export interface BenefitSettlementRequest {
  shares: Array<{ beneficiaryId: string; benefitRatio: number }>
  settledAmount: number
  payoutMethod?: string
  conclusion?: string
}

/** 创建理赔案件入参（字段与 CreateClaimDTO 对齐） */
export interface CreateClaimRequest {
  customerId: string
  policyId: string
  claimType: string
  incidentDate: string
  incidentDescription: string
  claimAmount: number
}

/** 理赔统计结果 */
export interface ClaimStatisticsVO {
  pendingCount?: number
  todayReportCount?: number
  totalCount?: number
  totalPaidAmount?: number
}

/** 理赔案件列表（Admin 代理分页对象 PageVO {list,total,page,size}） */
export async function getClaimList(
  params?: Partial<{
    claimNo: string
    policyId: string
    customerId: string
    claimType: string
    status: string
  }> &
    PageParams,
): Promise<PageResult<ClaimCaseVO>> {
  const { pageNum, pageSize, ...filters } = params ?? {}
  const payload = await http.get<unknown, ClaimCaseVO[] | PageResult<ClaimCaseVO>>('/web/v1/proxy/claims', {
    params: {
      ...filters,
      page: Number(pageNum ?? 1),
      size: pageSize ?? 20,
    },
  })
  const list = Array.isArray(payload) ? payload : payload?.list
  return {
    list: Array.isArray(list) ? list : [],
    total: Array.isArray(payload) ? payload.length : payload?.total ?? list?.length ?? 0,
    pageNum: Number(pageNum ?? 1),
    pageSize: Number(pageSize ?? 20),
  }
}

/** 理赔案件详情 */
export function getClaimDetail(id: string): Promise<ClaimCaseVO> {
  return http.get(`/web/v1/proxy/claims/${id}`)
}

/** 创建理赔案件（返回新案件ID） */
export function createClaim(data: CreateClaimRequest): Promise<string> {
  return http.post('/web/v1/proxy/claims', data) as Promise<string>
}

/** 理赔状态流转（下游 PUT /{id}/status?status=xxx） */
export function updateClaimStatus(id: string, status: string): Promise<void> {
  return http.put(`/web/v1/proxy/claims/${id}/status`, { newStatus: status }) as Promise<void>
}

/** 提交查勘 */
export function submitSurvey(id: string, data: SurveyRequest): Promise<void> {
  return http.post(`/web/v1/proxy/claims/${id}/survey`, data) as Promise<void>
}

/** 提交定损 */
export function submitLossAssessment(id: string, data: LossAssessmentRequest): Promise<void> {
  return http.post(`/web/v1/proxy/claims/${id}/loss-assessment`, data) as Promise<void>
}

/** 核赔结算（APPROVED → 赔付中） */
export function settleClaim(id: string, data: SettleRequest): Promise<void> {
  return http.post(`/web/v1/proxy/claims/${id}/settlement`, data) as Promise<void>
}

/** 身故给付结算 */
export function settleDeathBenefit(id: string, data: BenefitSettlementRequest): Promise<void> {
  return http.post(`/web/v1/proxy/claims/${id}/death-benefit`, data) as Promise<void>
}

/** 全残给付结算 */
export function settleDisabilityBenefit(id: string, data: BenefitSettlementRequest): Promise<void> {
  return http.post(`/web/v1/proxy/claims/${id}/disability-benefit`, data) as Promise<void>
}

/** 打标警示标记 */
export function flagClaimAlert(id: string, data: { alertTypes: string[]; reason?: string }): Promise<void> {
  return http.post(`/web/v1/proxy/claims/${id}/alert-flags`, data) as Promise<void>
}

/** 快赔自动核赔 */
export function quickPayClaim(id: string): Promise<void> {
  return http.post(`/web/v1/proxy/claims/${id}/quick-pay`) as Promise<void>
}

/** 拒赔 */
export function rejectClaim(id: string, data: RejectRequest): Promise<void> {
  return http.post(`/web/v1/proxy/claims/${id}/reject`, data) as Promise<void>
}

/** 结案归档 */
export function closeClaim(id: string): Promise<void> {
  return http.post(`/web/v1/proxy/claims/${id}/close`) as Promise<void>
}

/** 理赔统计（管理后台看板） */
export function getClaimStatistics(): Promise<ClaimStatisticsVO> {
  return http.get('/web/v1/proxy/claims/statistics')
}
