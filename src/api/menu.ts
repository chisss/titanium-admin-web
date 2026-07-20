// 菜单相关接口
import http from './http'
import type { MenuNode } from '@/types/menu.d'

/** 获取当前用户菜单树 */
export function getUserMenuTree(): Promise<MenuNode[]> {
  return http.get('/web/v1/menus/user-tree')
}

/** 获取全量菜单树（系统管理用） */
export function getMenuTree(): Promise<MenuNode[]> {
  return http.get('/web/v1/menus/tree')
}

/** 新增菜单 */
export function createMenu(data: Partial<MenuNode>): Promise<void> {
  return http.post('/web/v1/menus', data)
}

/** 更新菜单 */
export function updateMenu(id: string, data: Partial<MenuNode>): Promise<void> {
  return http.put(`/web/v1/menus/${id}`, data)
}

/** 删除菜单 */
export function deleteMenu(id: string): Promise<void> {
  return http.delete(`/web/v1/menus/${id}`)
}
