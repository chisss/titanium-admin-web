// 条款相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 条款信息 */
export interface ClauseVO {
  id: string
  code: string
  name: string
  category: string
  version: string
  content?: string
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'
  effectiveDate?: string
  createdAt: string
  updatedAt: string
}

/** 查询条款列表 */
export function getClauseList(params?: Partial<PageParams> & Record<string, unknown>): Promise<PageResult<ClauseVO>> {
  return http.get('/web/v1/clauses', { params })
}

/** 获取条款详情 */
export function getClauseDetail(id: string): Promise<ClauseVO> {
  return http.get(`/web/v1/clauses/${id}`)
}

/** 新增条款 */
export function createClause(data: Partial<ClauseVO>): Promise<void> {
  return http.post('/web/v1/clauses', data)
}

/** 更新条款 */
export function updateClause(id: string, data: Partial<ClauseVO>): Promise<void> {
  return http.put(`/web/v1/clauses/${id}`, data)
}

/** 启用条款 */
export function activateClause(id: string): Promise<void> {
  return http.post(`/web/v1/clauses/${id}/activate`)
}

/** 停用条款 */
export function deactivateClause(id: string): Promise<void> {
  return http.post(`/web/v1/clauses/${id}/deactivate`)
}
