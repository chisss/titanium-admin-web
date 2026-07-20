// usePermission 组合式函数 - 权限判断
import { useUserStore } from '@/stores/user'

/**
 * 权限判断 Hook
 */
export function usePermission() {
  const userStore = useUserStore()

  /**
   * 判断是否拥有指定权限
   * @param permission 权限标识，支持单个字符串或数组（数组时任一匹配即通过）
   */
  const hasPermission = (permission: string | string[]): boolean => {
    if (Array.isArray(permission)) {
      return permission.some((p) => userStore.hasPermission(p))
    }
    return userStore.hasPermission(permission)
  }

  /**
   * 判断是否拥有所有指定权限（AND 逻辑）
   */
  const hasAllPermissions = (permissions: string[]): boolean => {
    return permissions.every((p) => userStore.hasPermission(p))
  }

  return {
    hasPermission,
    hasAllPermissions,
  }
}
