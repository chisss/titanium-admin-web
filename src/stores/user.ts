// 用户 Store - 管理用户信息、Token、权限
import { defineStore } from 'pinia'
import { login as loginApi, logout as logoutApi, getUserInfo } from '@/api/auth'
import type { UserInfo, LoginRequest } from '@/types/user.d'

export const useUserStore = defineStore('user', {
  state: () => ({
    /** 访问令牌 */
    token: localStorage.getItem('ti_token') || '',
    /** 租户ID */
    tenantId: localStorage.getItem('ti_tenant_id') || '',
    /** 用户信息 */
    userInfo: null as UserInfo | null,
    /** 权限标识列表 */
    permissions: [] as string[],
    /** 是否已加载用户信息 */
    loaded: false,
  }),

  getters: {
    /** 是否已登录 */
    isLoggedIn: (state) => !!state.token,
    /** 用户显示名 */
    displayName: (state) => state.userInfo?.nickname || state.userInfo?.username || '未知用户',
    /** 用户头像 */
    avatar: (state) => state.userInfo?.avatar,
  },

  actions: {
    /** 用户登录 */
    async login(credentials: LoginRequest) {
      const result = await loginApi(credentials)
      this.token = result.accessToken
      localStorage.setItem('ti_token', result.accessToken)
      if (credentials.rememberMe) {
        localStorage.setItem('ti_remember_me', '1')
      }
    },

    /** 加载用户信息及权限 */
    async loadUserInfo() {
      if (this.loaded) return
      const info = await getUserInfo()
      this.userInfo = info
      this.permissions = info.permissions || []
      this.tenantId = info.tenantId
      localStorage.setItem('ti_tenant_id', info.tenantId)
      this.loaded = true
    },

    /** 退出登录 */
    async logout() {
      try {
        await logoutApi()
      } finally {
        this.clearSession()
      }
    },

    /** 清除会话数据 */
    clearSession() {
      this.token = ''
      this.tenantId = ''
      this.userInfo = null
      this.permissions = []
      this.loaded = false
      localStorage.removeItem('ti_token')
      localStorage.removeItem('ti_tenant_id')
      localStorage.removeItem('ti_remember_me')
    },

    /** 检查是否拥有指定权限 */
    hasPermission(permission: string): boolean {
      return this.permissions.includes(permission) || this.permissions.includes('*')
    },
  },
})
