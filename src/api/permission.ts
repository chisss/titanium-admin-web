// 权限相关接口
import http from './http'

/** 权限树节点 */
export interface PermissionTreeNode {
  id: string
  label: string
  permCode?: string
  type: 'DIR' | 'MENU' | 'BUTTON'
  children?: PermissionTreeNode[]
}

/** 获取权限树（菜单树+关联权限，用于角色权限分配） */
export function getPermissionTree(): Promise<PermissionTreeNode[]> {
  return http.get('/web/v1/menus/permissions/tree')
}
