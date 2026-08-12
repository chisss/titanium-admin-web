// 菜单相关接口
import http from './http'
import type { MenuNode, MenuType } from '@/types/menu.d'

/** 后端菜单 VO 原始结构（与前端 MenuNode 字段命名不同，需在边界处适配） */
interface RawMenuVO {
  id: string
  parentId?: string
  /** 菜单名称 */
  menuName?: string
  /** 图标 */
  icon?: string
  /** 路由路径 */
  routePath?: string
  /** 组件路径 */
  component?: string
  /** 菜单类型：M-目录 C-菜单 F-按钮 */
  menuType?: string
  /** 显示顺序 */
  orderNum?: number
  /** 是否可见：0-显示 1-隐藏 */
  visible?: string
  /** 权限标识 */
  permCode?: string
  children?: RawMenuVO[]
}

/** 后端菜单类型码 → 前端菜单类型 */
const CODE_TO_TYPE: Record<string, MenuType> = { M: 'DIRECTORY', C: 'MENU', F: 'BUTTON' }
/** 前端菜单类型 → 后端菜单类型码 */
const TYPE_TO_CODE: Record<MenuType, string> = { DIRECTORY: 'M', MENU: 'C', BUTTON: 'F' }

/**
 * 拼接完整路由路径：后端子菜单 routePath 是相对片段（如 `list`），
 * 需与父级路径拼成前端注册的嵌套全路径（如 `/product/list`），否则菜单导航 404。
 */
function joinPath(parentPath: string, childPath?: string): string {
  if (!childPath) return parentPath
  if (childPath.startsWith('/')) return childPath // 已是绝对路径（如顶级菜单 /dashboard）
  const base = parentPath.endsWith('/') ? parentPath.slice(0, -1) : parentPath
  return `${base}/${childPath}`
}

/**
 * 后端 VO → 前端 MenuNode（递归适配子树）
 * @param joinFullPath true 时逐层累积父路径拼成导航全路径（侧栏用）；
 *                     false 时保留后端原始相对 routePath（菜单管理页编辑回写用，避免破坏相对片段）。
 */
function toMenuNode(vo: RawMenuVO, joinFullPath: boolean, parentPath = ''): MenuNode {
  const path = joinFullPath ? joinPath(parentPath, vo.routePath) : vo.routePath || ''
  return {
    id: vo.id,
    parentId: vo.parentId,
    name: vo.menuName ?? '',
    title: vo.menuName ?? '',
    icon: vo.icon || undefined,
    path: path || undefined,
    component: vo.component || undefined,
    type: CODE_TO_TYPE[vo.menuType ?? ''] ?? 'MENU',
    sort: vo.orderNum ?? 0,
    hidden: vo.visible === '1',
    permission: vo.permCode || undefined,
    children: vo.children?.length
      ? vo.children.map((c) => toMenuNode(c, joinFullPath, path))
      : undefined,
  }
}

/** 前端 MenuNode → 后端创建/更新请求参数 */
function toMenuRequest(data: Partial<MenuNode>): Record<string, unknown> {
  return {
    parentId: data.parentId,
    menuType: data.type ? TYPE_TO_CODE[data.type] : undefined,
    menuName: data.title,
    icon: data.icon,
    routePath: data.path,
    component: data.component,
    permCode: data.permission,
    orderNum: data.sort,
    visible: data.hidden ? '1' : '0',
  }
}

/** 获取当前用户菜单树（侧栏导航用，拼全路径） */
export function getUserMenuTree(): Promise<MenuNode[]> {
  return http
    .get<unknown, RawMenuVO[]>('/web/v1/menus/user-tree')
    .then((list) => list.map((vo) => toMenuNode(vo, true)))
}

/** 获取全量菜单树（系统管理页用，保留相对 routePath 以便编辑回写） */
export function getMenuTree(): Promise<MenuNode[]> {
  return http
    .get<unknown, RawMenuVO[]>('/web/v1/menus/tree')
    .then((list) => list.map((vo) => toMenuNode(vo, false)))
}

/** 新增菜单 */
export function createMenu(data: Partial<MenuNode>): Promise<void> {
  return http.post('/web/v1/menus', toMenuRequest(data))
}

/** 更新菜单 */
export function updateMenu(id: string, data: Partial<MenuNode>): Promise<void> {
  return http.put(`/web/v1/menus/${id}`, toMenuRequest(data))
}

/** 删除菜单 */
export function deleteMenu(id: string): Promise<void> {
  return http.delete(`/web/v1/menus/${id}`)
}
