// 用户相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 用户列表项 */
export interface UserListItem {
  id: string
  username: string
  nickname: string
  email?: string
  mobile?: string
  status: 'ACTIVE' | 'INACTIVE'
  roleIds: string[]  // 改名与后端对齐
  tenantId: string
  deptId?: string    // 新增
  createdAt: string
}

/** 查询用户列表 */
export function getUserList(params?: Partial<PageParams> & Record<string, unknown>): Promise<PageResult<UserListItem>> {
  return http.get('/web/v1/users', { params })
}

/** 新增用户 */
export function createUser(data: Partial<UserListItem> & { password: string }): Promise<UserListItem> {
  return http.post('/web/v1/users', data)
}

/** 更新用户 */
export function updateUser(id: string, data: Partial<UserListItem>): Promise<void> {
  return http.put(`/web/v1/users/${id}`, data)
}

/** 重置密码 */
export function resetPassword(id: string, newPassword: string): Promise<void> {
  return http.patch(`/web/v1/users/${id}/password`, { newPassword })
}

/** 启用/禁用用户 */
export function toggleUserStatus(id: string, status: string): Promise<void> {
  return http.patch(`/web/v1/users/${id}/status`, { status })
}

/** 删除用户 */
export function deleteUser(id: string): Promise<void> {
  return http.delete(`/web/v1/users/${id}`)
}

/** 分配角色 */
export function assignRoles(userId: string, roleIds: string[]): Promise<void> {
  return http.put(`/web/v1/users/${userId}/roles`, { roleIds })
}
