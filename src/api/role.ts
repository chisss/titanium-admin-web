// 角色权限相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 角色信息 */
export interface RoleVO {
  id: string
  code: string
  name: string
  description?: string
  permissions: string[]
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
}

/** 查询角色列表 */
export function getRoleList(params?: Partial<PageParams> & Record<string, unknown>): Promise<PageResult<RoleVO>> {
  return http.get('/web/v1/roles', { params })
}

/** 获取角色详情（含权限列表） */
export function getRoleDetail(id: string): Promise<RoleVO> {
  return http.get(`/web/v1/roles/${id}`)
}

/** 新增角色 */
export function createRole(data: Partial<RoleVO>): Promise<void> {
  return http.post('/web/v1/roles', data)
}

/** 更新角色 */
export function updateRole(id: string, data: Partial<RoleVO>): Promise<void> {
  return http.put(`/web/v1/roles/${id}`, data)
}

/** 分配角色权限 */
export function assignPermissions(id: string, permissions: string[]): Promise<void> {
  return http.put(`/web/v1/roles/${id}/permissions`, { permissions })
}

/** 删除角色 */
export function deleteRole(id: string): Promise<void> {
  return http.delete(`/web/v1/roles/${id}`)
}
