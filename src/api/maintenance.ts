// 保全相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 保全工单 VO */
export interface MaintenanceVO {
  id: string
  workOrderNo: string
  policyNo: string
  holderName: string
  maintenanceType: string
  maintenanceTypeLabel?: string
  status: string
  applicantName: string
  applyTime: string
  effectiveTime?: string
  remark?: string
}

/** 保全工单列表 */
export function getMaintenanceList(
  params?: Partial<{
    workOrderNo: string
    policyNo: string
    maintenanceType: string
    status: string
    dateRange: string[]
  }> &
    PageParams,
): Promise<PageResult<MaintenanceVO>> {
  return http.get('/web/v1/proxy/policies/maintenance', { params }) as Promise<PageResult<MaintenanceVO>>
}

/** 保全工单详情 */
export function getMaintenanceDetail(id: string): Promise<MaintenanceVO> {
  return http.get(`/web/v1/proxy/policies/maintenance/${id}`) as Promise<MaintenanceVO>
}

/** 审核通过 */
export function approveMaintenance(id: string, remark?: string): Promise<void> {
  return http.post(`/web/v1/proxy/policies/maintenance/${id}/approve`, { remark }) as Promise<void>
}

/** 审核驳回 */
export function rejectMaintenance(id: string, reason: string): Promise<void> {
  return http.post(`/web/v1/proxy/policies/maintenance/${id}/reject`, { reason }) as Promise<void>
}
