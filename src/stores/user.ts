// 用户 Store - 管理用户信息、Token、权限
import { defineStore } from 'pinia'
import { login as loginApi, logout as logoutApi, getUserInfo } from '@/api/auth'
import type { UserInfo, LoginRequest } from '@/types/user.d'

/**
 * 「记住我」的持久化键。
 * 🔴 两键**必须成对**：只存标记不存用户名 ⇒ 下次打开登录页无从回填，勾选框形同虚设
 * （此前正是如此：唯一写入的 ti_remember_me 全仓零读取点）。
 */
const REMEMBER_FLAG_KEY = 'ti_remember_me'
const REMEMBER_USERNAME_KEY = 'ti_remember_username'

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
      // 🔴 D-501-29：刷新令牌由服务端随登录一并签发，此前被**直接丢弃** ⇒ AccessToken 一到期
      // 就只能强制登出（续期链路两端死代码）。持久化后由 http.ts 的 401 拦截链路在到期时续期。
      if (result.refreshToken) {
        localStorage.setItem('ti_refresh_token', result.refreshToken)
      }
      // 「记住我」：勾选则记下用户名供下次回填，未勾选则**主动清掉**上一次的记忆——
      // 否则用户取消勾选后仍会被回填，等于取消不掉。
      if (credentials.rememberMe) {
        localStorage.setItem(REMEMBER_FLAG_KEY, '1')
        localStorage.setItem(REMEMBER_USERNAME_KEY, credentials.username)
      } else {
        localStorage.removeItem(REMEMBER_FLAG_KEY)
        localStorage.removeItem(REMEMBER_USERNAME_KEY)
      }
    },

    /**
     * 读取「记住我」上次登录的用户名；未勾选（或从未登录过）时返回空串。
     *
     * 🔴 必须做成 **action，不能做成 getter**：Pinia 的 getter 会被编译成 computed，
     *    而这里读的是 localStorage——**不依赖任何响应式源**，computed 便把它当成常量
     *    只求值一次并永久缓存。实测症状：首次进登录页（此时尚无记忆）算得 ''，此后
     *    「登录 → 登出 → 回到登录页」永远拿到那份过期的 ''，回填看着像没写。
     *    action 每次调用都真正执行，不受缓存影响。
     */
    readRememberedUsername(): string {
      return localStorage.getItem(REMEMBER_FLAG_KEY) === '1'
        ? localStorage.getItem(REMEMBER_USERNAME_KEY) ?? ''
        : ''
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
      localStorage.removeItem('ti_refresh_token')
      localStorage.removeItem('ti_tenant_id')
      // 🔴 刻意**不删** REMEMBER_*_KEY：它记的是「本机偏好」而非会话数据。
      //    此前这里把 ti_remember_me 一并删掉，于是即便补上读取端，
      //    正常「登录 → 登出」这条路径也永远看不到回填效果——勾选框照样是空的。
    },

    /** 检查是否拥有指定权限 */
    hasPermission(permission: string): boolean {
      return this.permissions.includes(permission) || this.permissions.includes('*')
    },
  },
})
