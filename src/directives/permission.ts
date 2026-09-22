// v-permission 指令 - 权限控制，无权限则移除 DOM 元素
import type { DirectiveBinding, App } from 'vue'
import { useUserStore } from '@/stores/user'

/**
 * 权限指令
 * 使用方式（权限码必须取自后端 `AdminPermission`，全仓无此码即是从不生效的死门）：
 *   <el-button v-permission="'maintenance:create'">办理保全</el-button>
 *   <el-button v-permission="['policy:create', 'policy:edit']">操作</el-button>
 *
 * 🔴 选型：本指令只适用于**单个原生根元素**的场景。以下两类一律改用
 * `usePermission()` 的 `hasPermission()` 配 `v-if`：
 *   ① 元素同时有 `v-if` —— 指令在 mounted 时 `removeChild`，而 `v-if` 为假时元素根本没挂载，
 *      两条路径互相覆盖，结果取决于求值顺序，不是「按权限隐藏」而是「看运气」；
 *   ② 组件根是 Fragment（如 `el-dropdown-item` 渲染为多个节点）—— `el` 拿不到单一根元素，
 *      `parentNode?.removeChild(el)` 静默不生效，**元素照常渲染**。此时指令不报错、不生效，
 *      比 `v-if` 少的那点啰嗦危险得多（2026-09-20 实测：保单详情操作菜单曾据此假判为已受门控）。
 */
const permissionDirective = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string | string[]>) {
    const userStore = useUserStore()
    const required = binding.value

    let hasPermission: boolean
    if (Array.isArray(required)) {
      // 数组：任一权限满足即可
      hasPermission = required.some((p) => userStore.hasPermission(p))
    } else {
      hasPermission = userStore.hasPermission(required)
    }

    if (!hasPermission) {
      // 无权限则从 DOM 中移除该元素
      el.parentNode?.removeChild(el)
    }
  },
}

/** 注册全局权限指令 */
export function setupPermissionDirective(app: App) {
  app.directive('permission', permissionDirective)
}

export default permissionDirective
