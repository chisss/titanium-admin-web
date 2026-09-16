// 监管报告相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

// 🔴 字段名以下游 RegulatoryReportVO 为准（D-501-59）：主键是 reportId（无 id），
// 报告期间是 startDate/endDate（无 reportDate），响应无 reportNo / submittedAt。
/** 监管报告信息 */
export interface RegulatoryReportVO {
  reportId: string
  companyId: string
  reportType: string
  reportTypeLabel?: string
  /** 实际状态机只有 PENDING / SUBMITTED / APPROVED / REJECTED（字典中的 DRAFT 从未产生） */
  status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  startDate: string
  endDate: string
  totalAmount?: number
  createdBy?: string
  updatedBy?: string
  createdAt: string
  updatedAt?: string
}

/** 新建监管报告入参（companyId / reportType / startDate / endDate 为下游必填） */
export interface CreateRegulatoryReportParams {
  companyId: string
  reportType: string
  startDate: string
  endDate: string
  totalAmount?: number
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
export function createRegulatoryReport(data: CreateRegulatoryReportParams): Promise<void> {
  return http.post('/web/v1/proxy/regulatory/reports', data) as Promise<void>
}

// 提交 / 审批 / 驳回均为 POST：与 BFF 端点一致（D-501-03/05；BFF 侧此前为 PUT、且驳回端点整体缺失）
/** 提交监管报告 */
export function submitRegulatoryReport(id: string): Promise<void> {
  return http.post(`/web/v1/proxy/regulatory/reports/${id}/submit`) as Promise<void>
}

/** 审批通过监管报告 */
export function approveRegulatoryReport(id: string, data?: { comment?: string }): Promise<void> {
  return http.post(`/web/v1/proxy/regulatory/reports/${id}/approve`, data) as Promise<void>
}

/** 驳回监管报告 */
export function rejectRegulatoryReport(id: string, data?: { comment?: string }): Promise<void> {
  return http.post(`/web/v1/proxy/regulatory/reports/${id}/reject`, data) as Promise<void>
}
