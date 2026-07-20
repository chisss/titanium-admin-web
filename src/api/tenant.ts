// 租户相关接口
import http from './http'
import type { TenantVO } from '@/types/business.d'
import type { PageParams, PageResult } from '@/types/api.d'

/** 查询租户列表 */
export function getTenantList(params?: Partial<PageParams> & Record<string, unknown>): Promise<PageResult<TenantVO>> {
  return http.get('/web/v1/tenants', { params })
}

/** 获取租户详情 */
export function getTenantDetail(id: string): Promise<TenantVO> {
  return http.get(`/web/v1/tenants/${id}`)
}

/** 新增租户 */
export function createTenant(data: Partial<TenantVO>): Promise<void> {
  return http.post('/web/v1/tenants', data)
}

/** 更新租户 */
export function updateTenant(id: string, data: Partial<TenantVO>): Promise<void> {
  return http.put(`/web/v1/tenants/${id}`, data)
}

/** 启用/禁用租户 */
export function toggleTenantStatus(id: string, status: string): Promise<void> {
  return http.patch(`/web/v1/tenants/${id}/status`, { status })
}
