// 保单相关接口
import http from './http'
import type { PolicyVO } from '@/types/business.d'
import type { PageParams, PageResult } from '@/types/api.d'

/** 按客户查询返回的保单读模型（字段与 policy-query 的 PolicyQueryResult 对齐） */
export interface CustomerPolicyVO {
  policyId: string
  policyNo?: string
  applicationId?: string
  policyForm?: string
  policyHolderId?: string
  policyHolderName?: string
  insuredId?: string
  insuredName?: string
  productCode?: string
  productName?: string
  sumInsured?: number
  premium?: number
  currency?: string
  effectiveDate?: string
  expiryDate?: string
  status?: string
  createTime?: string
  updateTime?: string
  tenantId?: string
}

/** 保单受益人读模型（字段与 policy-query 的 PolicyBeneficiaryQueryResult 对齐） */
export interface PolicyBeneficiaryVO {
  customerId?: string
  beneficiaryName?: string
  beneficiaryType?: string
  orderNo?: number
  shareRatio?: number
  policyId?: string
  tenantId?: string
}

/** 查询保单列表（兼容 Admin 代理分页对象与旧版裸数组响应） */
export async function getPolicyList(params?: Partial<PageParams> & Record<string, unknown>): Promise<PageResult<PolicyVO>> {
  const { pageNum, pageSize, policyHolderName, ...filters } = params ?? {}
  const payload = await http.get<unknown, PolicyVO[] | PageResult<PolicyVO>>('/web/v1/proxy/policies', {
    params: {
      ...filters,
      policyHolderName,
      page: Math.max(Number(pageNum ?? 1) - 1, 0),
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

/** 获取保单详情 */
export function getPolicyDetail(id: string): Promise<PolicyVO> {
  return http.get(`/web/v1/proxy/policies/${id}`)
}

/** 按客户及保险角色查询保单（后端 page 从 0 开始，响应为裸数组） */
export function getPoliciesByCustomer(
  customerId: string,
  params?: { role?: string; page?: number; size?: number },
): Promise<CustomerPolicyVO[]> {
  const query: Record<string, string | number> = {
    page: params?.page ?? 0,
    size: params?.size ?? 20,
  }
  if (params?.role) query.role = params.role
  return http.get(`/web/v1/proxy/policies/by-customer/${customerId}`, { params: query }) as unknown as Promise<CustomerPolicyVO[]>
}

/** 查询单张保单的全部受益人（响应为裸数组） */
export function getPolicyBeneficiaries(policyId: string): Promise<PolicyBeneficiaryVO[]> {
  return http.get(`/web/v1/proxy/policies/${policyId}/beneficiaries`) as unknown as Promise<PolicyBeneficiaryVO[]>
}

// ===== 寿险生命周期操作（通过 admin proxy 层调用）=====

/** 中止保单 */
export function suspendPolicy(id: string, reason: string): Promise<void> {
  return http.put(`/web/v1/proxy/policies/${id}/suspend`, { reason }) as Promise<void>
}

/** 恢复保单 */
export function resumePolicy(id: string, reason: string): Promise<void> {
  return http.put(`/web/v1/proxy/policies/${id}/resume`, { reason }) as Promise<void>
}

/** 终止/退保 */
export type TerminationReason = 'EXPIRATION' | 'FULL_PAYMENT' | 'WITHDRAWAL' | 'LAPSE' | 'CONTRACT_TERMINATION' | 'ANNIVERSARY_FINISHED'
export type PremiumWaiverReason = 'POLICY_HOLDER_DEATH' | 'POLICY_HOLDER_DISABILITY' | 'INSURED_CRITICAL_ILLNESS' | 'INSURED_DISABILITY'
export type DividendOption = 'CASH' | 'ACCUMULATE' | 'OFFSET_PREMIUM' | 'PAID_UP_ADDITION'
export type AnnuityPayoutFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY'
export type PolicyDataUpdateType =
  | 'HOLDER_CHANGE' | 'BENEFICIARY_CHANGE' | 'PAYMENT_METHOD_CHANGE' | 'COVERAGE_INCREASE'
  | 'COVERAGE_DECREASE' | 'ADDITIONAL_PAYMENT' | 'REDUCTION_PAYMENT' | 'POLICY_INFO_CHANGE'
  | 'POLICY_PERIOD_CHANGE' | 'COVERAGE_AMOUNT_CHANGE' | 'INSURED_INFO_CHANGE' | 'SUBJECT_CHANGE'
  | 'SMOKING_STATUS_CHANGE' | 'COVERAGE_CHANGE'

export function terminatePolicy(id: string, data: { reason: string; terminationReason: TerminationReason }): Promise<void> {
  return http.put(`/web/v1/proxy/policies/${id}/terminate`, data) as Promise<void>
}

/** 撤销保单（犹豫期退保） */
export function cancelPolicy(id: string, reason: string): Promise<void> {
  return http.put(`/web/v1/proxy/policies/${id}/cancel`, { reason }) as Promise<void>
}

/** 保费豁免（寿险重疾豁免） */
export function waivePremium(id: string, data: { reason: PremiumWaiverReason }): Promise<void> {
  return http.put(`/web/v1/proxy/policies/${id}/waive-premium`, data) as Promise<void>
}

/** 红利派发（分红型寿险） */
export function distributeDividend(id: string, data: {
  policyYear: number
  dividendAmount: number
  option: DividendOption
}): Promise<void> {
  return http.post(`/web/v1/proxy/policies/${id}/dividend`, data) as Promise<void>
}

/** 启动年金给付 */
export function startAnnuityPayout(id: string, data: {
  startDate: string
  frequency: AnnuityPayoutFrequency
  amountPerInstallment: number
  currency?: string
  totalInstallments?: number
}): Promise<void> {
  return http.post(`/web/v1/proxy/policies/${id}/annuity-payout/start`, data) as Promise<void>
}

/** 执行年金给付（单次） */
export function payAnnuityBenefit(id: string): Promise<void> {
  return http.post(`/web/v1/proxy/policies/${id}/annuity-payout/pay`) as Promise<void>
}

/** 满期给付 */
export function maturePolicy(id: string, data: { maturityBenefit: number }): Promise<void> {
  return http.put(`/web/v1/proxy/policies/${id}/mature`, data) as Promise<void>
}

/** 申请批改 */
export function applyEndorsement(id: string, data: {
  endorsementNo: string
  updateType: PolicyDataUpdateType
  endorsementEffectiveDate?: string
  changeSummary: string
  originalSnapshot?: string
  sourceMaintenanceId?: string
}): Promise<string> {
  return http.post(`/web/v1/proxy/policies/${id}/endorsement`, data) as Promise<string>
}
