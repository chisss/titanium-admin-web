// 用户相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 用户列表项（前端模型，字段名与页面绑定一致） */
export interface UserListItem {
  id: string
  username: string
  nickname: string
  email?: string
  mobile?: string
  status: 'ACTIVE' | 'INACTIVE'
  roleIds: string[]
  tenantId: string
  deptId?: string
  createdAt: string
}

/** 后端用户 VO 原始结构（字段名与前端模型不同，需在边界处适配） */
interface RawUserVO {
  id: string
  tenantId?: string
  username?: string
  realName?: string
  mobile?: string
  email?: string
  avatar?: string
  deptId?: string
  status?: string
  createTime?: string
  roleIds?: string[] | null
}

/** 后端状态码 → 前端状态（后端 0-正常 1-停用，见 UserStatus） */
const CODE_TO_STATUS: Record<string, UserListItem['status']> = { '0': 'ACTIVE', '1': 'INACTIVE' }
/** 前端状态 → 后端状态码 */
const STATUS_TO_CODE: Record<UserListItem['status'], string> = { ACTIVE: '0', INACTIVE: '1' }

/** 后端 VO → 前端模型（realName→nickname、createTime→createdAt、状态码→语义值） */
function toUserItem(raw: RawUserVO): UserListItem {
  return {
    id: raw.id,
    tenantId: raw.tenantId ?? '',
    username: raw.username ?? '',
    nickname: raw.realName ?? '',
    mobile: raw.mobile,
    email: raw.email,
    deptId: raw.deptId,
    status: CODE_TO_STATUS[raw.status ?? ''] ?? 'INACTIVE',
    // 列表接口的 roleIds 可能为 null，兜底为空数组，避免编辑弹窗对 null 取 length 崩溃
    roleIds: raw.roleIds ?? [],
    createdAt: raw.createTime ?? '',
  }
}

/** 前端模型 → 后端请求体（后端字段名为 realName；角色经独立端点分配） */
function toUserBody(data: Partial<UserListItem> & { password?: string }): Record<string, unknown> {
  return {
    username: data.username,
    realName: data.nickname,
    mobile: data.mobile,
    email: data.email,
    deptId: data.deptId,
    password: data.password,
  }
}

/** 查询用户列表 */
export function getUserList(
  params?: Partial<PageParams> & Record<string, unknown>,
): Promise<PageResult<UserListItem>> {
  return http.get<unknown, PageResult<RawUserVO>>('/web/v1/users', { params }).then((page) => ({
    ...page,
    list: (page?.list ?? []).map(toUserItem),
  }))
}

/** 新增用户 */
export function createUser(data: Partial<UserListItem> & { password: string }): Promise<UserListItem> {
  return http.post<unknown, RawUserVO>('/web/v1/users', toUserBody(data)).then(toUserItem)
}

/** 更新用户 */
export function updateUser(id: string, data: Partial<UserListItem>): Promise<void> {
  return http.put(`/web/v1/users/${id}`, toUserBody(data))
}

/** 重置密码（由管理员指定新密码，后端不再有「系统默认密码」语义） */
export function resetPassword(id: string, password: string): Promise<void> {
  return http.put(`/web/v1/users/${id}/reset-password`, { password })
}

/** 启用/禁用用户（状态值须按后端码 0-正常 / 1-停用 提交） */
export function toggleUserStatus(id: string, status: UserListItem['status']): Promise<void> {
  return http.put(`/web/v1/users/${id}/status`, { status: STATUS_TO_CODE[status] })
}

/** 分配角色 */
export function assignRoles(userId: string, roleIds: string[]): Promise<void> {
  return http.put(`/web/v1/users/${userId}/roles`, { roleIds })
}
