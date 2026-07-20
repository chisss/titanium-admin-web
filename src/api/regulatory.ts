// 监管报告相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 监管报告信息 */
export interface RegulatoryReportVO {
  id: string
  reportNo: string
  reportType: string
  reportTypeLabel?: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  reportDate?: string
  submittedAt?: string
  createdAt: string
}

/** 查询监管报告列表 */
export function getRegulatoryReportList(params?: Partial<{
  reportType: string; status: string; startDate: string; endDate: string
}> & PageParams): Promise<PageResult<RegulatoryReportVO>> {
  return http.get('/web/v1/proxy/regulatory/reports', { params }) as Promise<PageResult<RegulatoryReportVO>>
}

/** 获取监管报告详情 */
export function getRegulatoryReportDetail(id: string): Promise<RegulatoryReportVO> {
  return http.get(`/web/v1/proxy/regulatory/reports/${id}`) as Promise<RegulatoryReportVO>
}

/** 新建监管报告 */
export function createRegulatoryReport(data: Partial<RegulatoryReportVO>): Promise<void> {
  return http.post('/web/v1/proxy/regulatory/reports', data) as Promise<void>
}

/** 提交监管报告 */
export function submitRegulatoryReport(id: string): Promise<void> {
  return http.put(`/web/v1/proxy/regulatory/reports/${id}/submit`) as Promise<void>
}

/** 审批通过监管报告 */
export function approveRegulatoryReport(id: string, data?: { comment?: string }): Promise<void> {
  return http.put(`/web/v1/proxy/regulatory/reports/${id}/approve`, data) as Promise<void>
}

/** 驳回监管报告 */
export function rejectRegulatoryReport(id: string, data?: { comment?: string }): Promise<void> {
  return http.put(`/web/v1/proxy/regulatory/reports/${id}/reject`, data) as Promise<void>
}
