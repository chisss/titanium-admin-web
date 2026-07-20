// 菜单 Store - 管理菜单树和激活状态
import { defineStore } from 'pinia'
import { getUserMenuTree } from '@/api/menu'
import type { MenuNode } from '@/types/menu.d'

export const useMenuStore = defineStore('menu', {
  state: () => ({
    /** 用户菜单树 */
    menuTree: [] as MenuNode[],
    /** 当前激活菜单路径 */
    activeMenu: '',
    /** 是否已加载菜单 */
    loaded: false,
    /** 面包屑路径 */
    breadcrumbs: [] as { title: string; path?: string }[],
  }),

  actions: {
    /** 加载用户菜单树 */
    async loadMenuTree() {
      if (this.loaded) return
      const tree = await getUserMenuTree()
      this.menuTree = tree
      this.loaded = true
    },

    /** 重置菜单（用于退出登录） */
    resetMenu() {
      this.menuTree = []
      this.loaded = false
      this.activeMenu = ''
      this.breadcrumbs = []
    },

    /** 设置激活菜单 */
    setActiveMenu(path: string) {
      this.activeMenu = path
    },

    /** 设置面包屑 */
    setBreadcrumbs(crumbs: { title: string; path?: string }[]) {
      this.breadcrumbs = crumbs
    },
  },
})
