// 理赔相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 理赔案件 VO */
export interface ClaimCaseVO {
  id: string
  claimNo: string
  policyNo: string
  insuredName: string
  claimType: string
  reportDate: string
  occurrenceDate: string
  claimAmount?: number
  paidAmount?: number
  status: string
  processNote?: string
}

/** 赔付结案入参 */
export interface SettleRequest {
  paidAmount: number
  note?: string
}

/** 理赔案件列表 */
export function getClaimList(
  params?: Partial<{
    claimNo: string
    policyNo: string
    insuredName: string
    claimType: string
    status: string
    dateRange: string[]
  }> &
    PageParams,
): Promise<PageResult<ClaimCaseVO>> {
  return http.get('/web/v1/proxy/claims', { params }) as Promise<PageResult<ClaimCaseVO>>
}

/** 理赔案件详情 */
export function getClaimDetail(id: string): Promise<ClaimCaseVO> {
  return http.get(`/web/v1/proxy/claims/${id}`) as Promise<ClaimCaseVO>
}

/** 处理案件（流转） */
export function processClaim(id: string, action: string, note?: string): Promise<void> {
  return http.post(`/web/v1/proxy/claims/${id}/process`, { action, note }) as Promise<void>
}

/** 赔付结案 */
export function settleClaim(id: string, data: SettleRequest): Promise<void> {
  return http.post(`/web/v1/proxy/claims/${id}/settle`, data) as Promise<void>
}
