// v-permission 指令 - 权限控制，无权限则移除 DOM 元素
import type { DirectiveBinding, App } from 'vue'
import { useUserStore } from '@/stores/user'

/**
 * 权限指令
 * 使用方式：
 *   <el-button v-permission="'policy:maintenance:apply'">办理保全</el-button>
 *   <el-button v-permission="['policy:create', 'policy:edit']">操作</el-button>
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
