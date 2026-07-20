// 核保相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 核保案件 VO */
export interface UnderwritingCaseVO {
  id: string
  caseNo: string
  policyNo: string
  proposalNo: string
  insuredName: string
  productName: string
  sumInsured: number
  status: string
  applyTime: string
  decisionTime?: string
  decisionResult?: string
  decisionReason?: string
}

/** 核保决策入参 */
export interface DecisionRequest {
  decision: 'APPROVED' | 'RATED' | 'EXCLUDED' | 'POSTPONED' | 'DECLINED'
  reason?: string
  extraPremiumRate?: number
  exclusions?: string[]
}

/** 核保工单列表 */
export function getUnderwritingList(
  params?: Partial<{
    caseNo: string
    insuredName: string
    status: string
    dateRange: string[]
  }> &
    PageParams,
): Promise<PageResult<UnderwritingCaseVO>> {
  return http.get('/web/v1/proxy/underwriting', { params }) as Promise<PageResult<UnderwritingCaseVO>>
}

/** 核保详情 */
export function getUnderwritingDetail(id: string): Promise<UnderwritingCaseVO> {
  return http.get(`/web/v1/proxy/underwriting/${id}`) as Promise<UnderwritingCaseVO>
}

/** 核保决策 */
export function makeDecision(id: string, data: DecisionRequest): Promise<void> {
  return http.post(`/web/v1/proxy/underwriting/${id}/decision`, data) as Promise<void>
}
