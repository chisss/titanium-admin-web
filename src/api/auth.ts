// 认证相关接口
import http from './http'
import type { LoginRequest, LoginResult, UserInfo } from '@/types/user.d'

/** 用户登录 */
export function login(data: LoginRequest): Promise<LoginResult> {
  return http.post('/web/v1/auth/login', data)
}

/** 退出登录 */
export function logout(): Promise<void> {
  return http.post('/web/v1/auth/logout')
}

/** 获取当前用户信息及权限 */
export function getUserInfo(): Promise<UserInfo> {
  return http.get('/web/v1/auth/user-info')
}

// 🔴 D-501-29：原先此处有 refreshToken(refreshToken: string): Promise<LoginResult>，
// 全前端**零调用点**，且其请求体 {refreshToken} 与服务端「刷新令牌经 Authorization 头承载、
// 响应 data 为 AccessToken 字符串」的契约不符 —— 即便被调用也换不到令牌，是双端死代码。
// 现已删除：续期契约统一由 http.ts 的 401 拦截链路负责（那里也是它的唯一使用场景），
// 避免同一契约存在两份不一致的定义。
