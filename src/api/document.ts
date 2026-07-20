// 文档档案相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 文档信息 */
export interface DocumentVO {
  id: string
  documentNo: string
  documentType: string
  policyId?: string
  policyNo?: string
  customerId?: string
  customerName?: string
  status: 'PENDING_SIGN' | 'SIGNED' | 'ARCHIVED'
  createdAt: string
}

/** 查询文档列表 */
export function getDocumentList(params?: Partial<{
  policyId: string; customerId: string; documentType: string; status: string
}> & PageParams): Promise<PageResult<DocumentVO>> {
  return http.get('/web/v1/proxy/documents', { params }) as Promise<PageResult<DocumentVO>>
}

/** 获取文档详情 */
export function getDocumentDetail(id: string): Promise<DocumentVO> {
  return http.get(`/web/v1/proxy/documents/${id}`) as Promise<DocumentVO>
}

/** 下载文档 */
export function downloadDocument(id: string): Promise<unknown> {
  return http.get(`/web/v1/proxy/documents/${id}/download`) as Promise<unknown>
}

/** 获取文档模板列表 */
export function getDocumentTemplates(params?: PageParams): Promise<PageResult<unknown>> {
  return http.get('/web/v1/proxy/documents/templates', { params }) as Promise<PageResult<unknown>>
}
