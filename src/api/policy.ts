// 保单相关接口
import http from './http'
import type { PolicyVO } from '@/types/business.d'
import type { PageParams, PageResult } from '@/types/api.d'

/** 查询保单列表（包装后端List响应为PageResult） */
export async function getPolicyList(params?: Partial<PageParams> & Record<string, unknown>): Promise<PageResult<PolicyVO>> {
  const list = await http.get<PolicyVO[]>('/web/v1/proxy/policies', { params })
  // 后端返回纯List，前端包装成PageResult
  return {
    list: Array.isArray(list) ? list : [],
    total: Array.isArray(list) ? list.length : 0,
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 20,
  }
}

/** 获取保单详情 */
export function getPolicyDetail(id: string): Promise<PolicyVO> {
  return http.get(`/web/v1/proxy/policies/${id}`)
}

/** 根据保单号查询 */
export function getPolicyByNo(policyNo: string): Promise<PolicyVO> {
  return http.get(`/web/v1/proxy/policies/by-no/${policyNo}`)
}

/** 导出保单列表 */
export function exportPolicies(params?: Record<string, unknown>): Promise<Blob> {
  return http.get('/web/v1/proxy/policies/export', { params, responseType: 'blob' })
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
export function terminatePolicy(id: string, data: { reason: string; terminationReason?: string }): Promise<void> {
  return http.put(`/web/v1/proxy/policies/${id}/terminate`, data) as Promise<void>
}

/** 撤销保单（犹豫期退保） */
export function cancelPolicy(id: string, reason: string): Promise<void> {
  return http.put(`/web/v1/proxy/policies/${id}/cancel`, { reason }) as Promise<void>
}

/** 保费豁免（寿险重疾豁免） */
export function waivePremium(id: string, data: { waiverReason: string; effectiveDate?: string }): Promise<void> {
  return http.put(`/web/v1/proxy/policies/${id}/waive-premium`, data) as Promise<void>
}

/** 红利派发（分红型寿险） */
export function distributeDividend(id: string, data: {
  dividendYear: number
  dividendAmount: number
  currency?: string
  distributionOption?: string
}): Promise<void> {
  return http.post(`/web/v1/proxy/policies/${id}/dividend`, data) as Promise<void>
}

/** 启动年金给付 */
export function startAnnuityPayout(id: string, data: {
  startDate: string
  frequency?: string
  amount?: number
}): Promise<void> {
  return http.post(`/web/v1/proxy/policies/${id}/annuity-payout/start`, data) as Promise<void>
}

/** 执行年金给付（单次） */
export function payAnnuityBenefit(id: string): Promise<void> {
  return http.post(`/web/v1/proxy/policies/${id}/annuity-payout/pay`) as Promise<void>
}

/** 满期给付 */
export function maturePolicy(id: string, data: { maturityAmount?: number }): Promise<void> {
  return http.put(`/web/v1/proxy/policies/${id}/mature`, data) as Promise<void>
}

/** 申请批改 */
export function applyEndorsement(id: string, data: {
  endorsementType: string
  changeDescription: string
  effectiveDate?: string
}): Promise<{ endorsementId: string }> {
  return http.post(`/web/v1/proxy/policies/${id}/endorsement`, data) as Promise<{ endorsementId: string }>
}
