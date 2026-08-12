// 计费相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 账单 VO */
export interface BillVO {
  id: string
  billNo: string
  policyNo: string
  holderName: string
  amount: number
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED'
  dueDate: string
  paidDate?: string
  createdAt: string
}

/** 缴费计划条目 */
export interface PremiumScheduleVO {
  period: number
  dueDate: string
  amount: number
  status: 'PENDING' | 'PAID' | 'OVERDUE'
}

/** 账单列表 */
export function getBillList(
  params?: Partial<{
    billNo: string
    policyNo: string
    holderName: string
    status: string
    dateRange: string[]
  }> &
    PageParams,
): Promise<PageResult<BillVO>> {
  return http.get('/web/v1/proxy/billing', { params }) as Promise<PageResult<BillVO>>
}

/** 账单详情 */
export function getBillDetail(id: string): Promise<BillVO> {
  return http.get(`/web/v1/proxy/billing/${id}`) as Promise<BillVO>
}

/** 缴费计划 */
export function getPremiumSchedule(policyId: string): Promise<PremiumScheduleVO[]> {
  return http.get(`/web/v1/proxy/billing/${policyId}/premium-schedule`) as Promise<PremiumScheduleVO[]>
}
