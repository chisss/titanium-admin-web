// Axios HTTP 封装 - 统一请求/响应处理
import axios, { type AxiosInstance, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import type { ApiResponse } from '@/types/api.d'

/**
 * 请求级静默失败开关（🔴 D-501-58）。
 *
 * <p>响应拦截器默认对一切失败弹全局红条 —— 这对「用户主动发起的请求」是对的，
 * 但对「页面为补全信息顺带发的**辅助请求**」是错的：调用方已用 `.catch()` 兜了底
 * （如产品详情逐条取条款，缺一条不影响其余），用户仍会被一条与自己操作无关的红条打扰。
 * 更糟的是它把「页面其实已经优雅降级」显示成了一次失败。</p>
 *
 * <p>置 `silentError: true` 后拦截器不再弹提示，且 reject 的是**未打标记**的普通 Error，
 * 把「要不要提示」的决策权交还调用方（`showErrorIfUnhandled` 仍可正常兜底）。
 * 不传时行为与从前完全一致。</p>
 */
declare module 'axios' {
  export interface AxiosRequestConfig {
    silentError?: boolean
  }
}

// 创建 Axios 实例
const http: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json;charset=UTF-8',
  },
})

/** 拦截器已弹过提示的错误标记（D-501-51）。 */
const HANDLED_FLAG = 'tiErrorHandled'

/** AccessToken 本地存储键（请求拦截器注入 Authorization） */
const ACCESS_TOKEN_KEY = 'ti_token'
/** RefreshToken 本地存储键（🔴 D-501-29：登录时持久化，401 时用于续期） */
const REFRESH_TOKEN_KEY = 'ti_refresh_token'
/** 租户 ID 本地存储键 */
const TENANT_ID_KEY = 'ti_tenant_id'
/** 刷新端点：以服务端契约为准，刷新令牌经 Authorization 头承载，响应 data 即新 AccessToken */
const REFRESH_URL = '/web/v1/auth/refresh'

/** 构造「业务消息 + 已提示标记」的 Error：拦截器统一 reject 此形态，调用方据此避免重复弹窗。 */
const handledError = (message: string): Error => {
  const error = new Error(message)
  ;(error as Error & Record<string, unknown>)[HANDLED_FLAG] = true
  return error
}

/** 是否该弹全局提示：静默请求（调用方自行兜底）不弹，其余一律弹（默认行为不变）。 */
const shouldToast = (config?: AxiosRequestConfig): boolean => config?.silentError !== true

/**
 * 构造拦截器的 reject 值（🔴 D-501-51 / D-501-58）：
 * 非静默 → 「业务消息 + 已提示标记」的 Error，调用方据此避免重复弹窗；
 * 静默 → 未打标记的普通 Error，「要不要提示」的决策权交还调用方。
 */
const rejectError = (message: string, config?: AxiosRequestConfig): Error =>
  shouldToast(config) ? handledError(message) : new Error(message)

/**
 * 统一错误提示（D-501-51）：拦截器已提示过的不重复弹，未提示的按业务兜底文案提示。
 * <p>调用方在 `catch` 中使用，替代裸 `ElMessage.error(e.message)` ——
 * 后者会在响应拦截器已弹业务消息后，再弹一次 axios 技术文本，形成双重提示。</p>
 */
export function showErrorIfUnhandled(error: unknown, fallback = '操作失败'): void {
  if (error instanceof Error && (error as Error & Record<string, unknown>)[HANDLED_FLAG]) return
  ElMessage.error(error instanceof Error ? error.message : fallback)
}

// 请求拦截器：注入 Token 和租户ID
http.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    const tenantId = localStorage.getItem(TENANT_ID_KEY)

    // 显式声明的 Authorization 优先：刷新请求以**刷新令牌**作为凭据放在同一个头上，
    // 若无条件覆盖，刷新会拿着过期的 AccessToken 去换新令牌，永远换不到（🔴 D-501-29）
    if (token && !config.headers['Authorization']) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    if (tenantId) {
      config.headers['X-Tenant-ID'] = tenantId
    }
    return config
  },
  (error) => Promise.reject(error),
)

/** 已重放过一次的请求标记：新令牌仍被拒时不得再次刷新，否则刷新↔401 互相触发形成死循环 */
type RetriableConfig = InternalAxiosRequestConfig & { tiRetried?: boolean }

/** 在途刷新：多个请求同时 401 时只发起一次刷新，其余等待同一结果（单飞，避免刷新风暴） */
let refreshInFlight: Promise<string> | null = null

/** 清空本地会话并跳转登录（刷新不可用或失败时的收尾，与 store 的 clearSession 同口径） */
const forceLogout = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(TENANT_ID_KEY)
  window.location.href = '/login'
}

/**
 * 请求新 AccessToken。
 * <p>刷新凭据走 Authorization 头（服务端契约），响应 {@code data} 即新令牌；
 * 刷新成功后立即落盘，使后续并发请求的请求拦截器能取到新值。</p>
 */
const requestNewAccessToken = async (refreshToken: string): Promise<string> => {
  const accessToken = await http.post<unknown, string>(REFRESH_URL, null, {
    headers: { Authorization: `Bearer ${refreshToken}` },
  })
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  return accessToken
}

/** 单飞刷新：并发 401 共享同一次刷新请求 */
const ensureRefreshedToken = (refreshToken: string): Promise<string> => {
  if (!refreshInFlight) {
    refreshInFlight = requestNewAccessToken(refreshToken).finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/**
 * 401 统一处置（🔴 D-501-29）：**先刷新 → 重放原请求 → 刷新不可用或失败才登出**。
 *
 * <p>此前的行为是「收到 401 立即清 token + 硬跳登录」：AccessToken 一到期，用户就被强制登出，
 * 即便本地持有仍然有效的刷新令牌也无从使用 —— 因为刷新链路两端都是死代码：前端
 * {@code refreshToken()} 零调用点，且其请求体 {@code {refreshToken}} 与服务端要求的
 * Authorization 头不符，即便被调用也换不到令牌。</p>
 *
 * <p>失败收尾仍为登出（刷新令牌也无效时用户确实需要重新登录），但这条路径现在只在
 * **真的无法续期**时才走到。</p>
 */
const handleUnauthorized = async (config?: RetriableConfig): Promise<unknown> => {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
  const isRefreshCall = !!config?.url?.includes(REFRESH_URL)

  // 无原请求配置或无刷新令牌，或刷新请求自身 401（说明刷新令牌已失效）⇒ 直接登出，不再刷新；
  // 已重放过一次的请求同样不再刷新（否则「刷新 ↔ 401」互相触发形成死循环）
  if (!config || !refreshToken || isRefreshCall || config.tiRetried) {
    forceLogout()
    return Promise.reject(handledError('登录已过期'))
  }

  try {
    await ensureRefreshedToken(refreshToken)
  } catch {
    forceLogout()
    return Promise.reject(handledError('登录已过期'))
  }

  // 续期成功：重放原请求（请求拦截器会带上刚写入的新 AccessToken），用户无感
  config.tiRetried = true
  return http.request(config)
}

// 响应拦截器：统一处理业务状态码
// eslint-disable-next-line @typescript-eslint/no-explicit-any
http.interceptors.response.use(
  (response): any => {
    const res = response.data as ApiResponse

    // 下载文件：拦截器统一剥壳，返回 Blob 本体（调用方按 Promise<Blob> 消费）
    if (response.config.responseType === 'blob') {
      return response.data
    }

    // 成功判定：兼容旧数字信封 200 与 metadata ApiResponse 的 String 成功码 "00000000"
    if (res.code === 200 || res.code === '00000000') {
      const etag = response.headers.etag as string | undefined
      if (etag && res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
        return { ...res.data, etag }
      }
      return res.data
    }

    if (res.code === 401) {
      // Token 过期 → 先尝试续期并重放，续期不可用才登出（🔴 D-501-29）
      return handleUnauthorized(response.config as RetriableConfig)
    }

    if (res.code === 403) {
      if (shouldToast(response.config)) ElMessage.error('无权限访问该资源')
      return Promise.reject(rejectError('无权限', response.config))
    }

    // 提示与 reject 复用同一条消息：此前提示走 `res.message || '请求失败'`、reject 走裸 `res.message`，
    // 后端未给 message 时调用方拿到空字符串，兜底文案在 `showErrorIfUnhandled` 那道防线上失效
    const message = res.message || '请求失败'
    if (shouldToast(response.config)) ElMessage.error(message)
    return Promise.reject(rejectError(message, response.config))
  },
  async (error) => {
    if (error.response?.status === 401) {
      // Token 过期 → 先尝试续期并重放，续期不可用才登出（🔴 D-501-29）
      return handleUnauthorized(error.config as RetriableConfig)
    }
    // 🔴 D-501-51：本分支的 reject 必须与成功分支（上方 `rejectError(message, ...)`）约定一致，
    // 即「reject 携带业务消息且已提示标记的 Error」。此前直接 reject 原始 AxiosError，
    // 调用方 `catch (e) { ElMessage.error(e.message) }` 取到的是 axios 裸技术文本
    // "Request failed with status code 400"，与拦截器已弹出的业务消息构成双重提示。
    // 🔴 D-501-58：静默请求既不弹提示、也 reject 未打标记的 Error —— 提示决策权交还调用方。
    // 提示收敛为出口处一处：三条分支原各写一次 `ElMessage.error`，加静默开关时会各漏一次。
    const config = error.config as AxiosRequestConfig | undefined
    let message: string
    if (error.response?.status === 403) {
      message = '无权限访问该资源'
    } else if (error.code === 'ECONNABORTED') {
      message = '请求超时，请重试'
    } else {
      message = (await resolveErrorMessage(error.response?.data)) || '网络异常，请稍后重试'
    }
    if (shouldToast(config)) ElMessage.error(message)
    return Promise.reject(rejectError(message, config))
  },
)

/**
 * 解析错误响应体中的业务消息。
 * <p>`responseType: 'blob'` 的请求失败时，错误体仍是 JSON，但被 axios 包成 Blob，
 * 直接读 `.message` 恒为 undefined ⇒ 真实语义（如「资源不存在」）被兜底文案「网络异常」覆盖，
 * 排查方向被误导。此处先读文本再解析，还原后端原始 message。</p>
 */
async function resolveErrorMessage(data: unknown): Promise<string | undefined> {
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string }
      return parsed.message
    } catch {
      return undefined
    }
  }
  return (data as { message?: string } | undefined)?.message
}

export default http
