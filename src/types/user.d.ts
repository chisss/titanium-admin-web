// 用户相关类型定义

/** 用户信息 */
export interface UserInfo {
  /** 用户ID */
  id: string
  /** 用户名 */
  username: string
  /** 昵称 */
  nickname: string
  /** 头像 */
  avatar?: string
  /** 邮箱 */
  email?: string
  /** 手机号 */
  mobile?: string
  /** 租户ID */
  tenantId: string
  /** 租户名称 */
  tenantName?: string
  /** 角色列表 */
  roles: string[]
  /** 权限标识列表 */
  permissions: string[]
}

/** 登录请求 */
export interface LoginRequest {
  /** 用户名 */
  username: string
  /** 密码 */
  password: string
  /** 租户编码（可选） */
  tenantCode?: string
  /** 记住我 */
  rememberMe?: boolean
}

/** 登录响应 */
export interface LoginResult {
  /** 访问令牌 */
  accessToken: string
  /** 刷新令牌 */
  refreshToken?: string
  /** 过期时间（秒） */
  expiresIn?: number
}
