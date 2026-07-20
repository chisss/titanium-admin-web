// 菜单相关类型定义

/** 菜单类型 */
export type MenuType = 'DIRECTORY' | 'MENU' | 'BUTTON'

/** 菜单节点 */
export interface MenuNode {
  /** 菜单ID */
  id: string
  /** 父菜单ID */
  parentId?: string
  /** 菜单名称（i18n key） */
  name: string
  /** 菜单标题（展示用） */
  title: string
  /** 图标 */
  icon?: string
  /** 路由路径 */
  path?: string
  /** 组件路径 */
  component?: string
  /** 菜单类型 */
  type: MenuType
  /** 排序 */
  sort: number
  /** 是否隐藏 */
  hidden?: boolean
  /** 权限标识 */
  permission?: string
  /** 子菜单 */
  children?: MenuNode[]
}
