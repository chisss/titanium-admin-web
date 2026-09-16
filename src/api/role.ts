// 角色权限相关接口
import http from './http'
import type { PageParams } from '@/types/api.d'

/** 角色信息（前端模型，字段名与页面绑定一致） */
export interface RoleVO {
  id: string
  code: string
  name: string
  description?: string
  status: 'ACTIVE' | 'INACTIVE'
}

/** 后端角色 VO 原始结构（字段名与前端模型不同，需在边界处适配） */
interface RawRoleVO {
  id: string
  roleCode?: string
  roleName?: string
  description?: string
  status?: string
}

/** 后端状态码 → 前端状态（后端 0-正常 1-停用，见 UserStatus） */
const CODE_TO_STATUS: Record<string, RoleVO['status']> = { '0': 'ACTIVE', '1': 'INACTIVE' }
/** 前端状态 → 后端状态码 */
const STATUS_TO_CODE: Record<RoleVO['status'], string> = { ACTIVE: '0', INACTIVE: '1' }

/** 后端 VO → 前端模型 */
function toRoleVO(raw: RawRoleVO): RoleVO {
  return {
    id: raw.id,
    code: raw.roleCode ?? '',
    name: raw.roleName ?? '',
    description: raw.description,
    status: CODE_TO_STATUS[raw.status ?? ''] ?? 'INACTIVE',
  }
}

/** 前端模型 → 后端请求体（后端字段名为 roleCode / roleName） */
function toRoleBody(data: Partial<RoleVO>): Record<string, unknown> {
  return {
    roleCode: data.code,
    roleName: data.name,
    description: data.description,
    status: data.status ? STATUS_TO_CODE[data.status] : undefined,
  }
}

/** 查询角色列表（后端返回裸数组，无分页信封） */
export function getRoleList(params?: Partial<PageParams> & Record<string, unknown>): Promise<RoleVO[]> {
  return http
    .get<unknown, RawRoleVO[]>('/web/v1/roles', { params })
    .then((list) => (list ?? []).map(toRoleVO))
}

/** 获取角色详情 */
export function getRoleDetail(id: string): Promise<RoleVO> {
  return http.get<unknown, RawRoleVO>(`/web/v1/roles/${id}`).then(toRoleVO)
}

/** 查询角色已分配的权限ID列表（列表 VO 不含权限，分配弹窗回显须单独拉取） */
export function getRolePermissions(id: string): Promise<string[]> {
  return http.get<unknown, string[]>(`/web/v1/roles/${id}/permissions`).then((ids) => ids ?? [])
}

/** 新增角色 */
export function createRole(data: Partial<RoleVO>): Promise<void> {
  return http.post('/web/v1/roles', toRoleBody(data))
}

/** 更新角色 */
export function updateRole(id: string, data: Partial<RoleVO>): Promise<void> {
  return http.put(`/web/v1/roles/${id}`, toRoleBody(data))
}

/** 分配角色权限（后端字段名为 permissionIds，用 permissions 会被当作缺失而清空） */
export function assignPermissions(id: string, permissions: string[]): Promise<void> {
  return http.put(`/web/v1/roles/${id}/permissions`, { permissionIds: permissions })
}

/** 删除角色 */
export function deleteRole(id: string): Promise<void> {
  return http.delete(`/web/v1/roles/${id}`)
}
