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

/** 刷新 Token */
export function refreshToken(refreshToken: string): Promise<LoginResult> {
  return http.post('/web/v1/auth/refresh', { refreshToken })
}
