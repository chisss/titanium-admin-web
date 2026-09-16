// Axios HTTP 封装 - 统一请求/响应处理
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import type { ApiResponse } from '@/types/api.d'

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

/** 构造「业务消息 + 已提示标记」的 Error：拦截器统一 reject 此形态，调用方据此避免重复弹窗。 */
const handledError = (message: string): Error => {
  const error = new Error(message)
  ;(error as Error & Record<string, unknown>)[HANDLED_FLAG] = true
  return error
}

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
    const token = localStorage.getItem('ti_token')
    const tenantId = localStorage.getItem('ti_tenant_id')

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    if (tenantId) {
      config.headers['X-Tenant-ID'] = tenantId
    }
    return config
  },
  (error) => Promise.reject(error),
)

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
      // Token 过期，清除本地状态并跳转登录
      localStorage.removeItem('ti_token')
      localStorage.removeItem('ti_tenant_id')
      window.location.href = '/login'
      return Promise.reject(handledError('登录已过期'))
    }

    if (res.code === 403) {
      ElMessage.error('无权限访问该资源')
      return Promise.reject(handledError('无权限'))
    }

    ElMessage.error(res.message || '请求失败')
    return Promise.reject(handledError(res.message))
  },
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('ti_token')
      localStorage.removeItem('ti_tenant_id')
      window.location.href = '/login'
      return Promise.reject(handledError('登录已过期'))
    }
    // 🔴 D-501-51：本分支的 reject 必须与成功分支（上方 `handledError(res.message)`）约定一致，
    // 即「reject 携带业务消息且已提示标记的 Error」。此前直接 reject 原始 AxiosError，
    // 调用方 `catch (e) { ElMessage.error(e.message) }` 取到的是 axios 裸技术文本
    // "Request failed with status code 400"，与拦截器已弹出的业务消息构成双重提示。
    let message: string
    if (error.response?.status === 403) {
      message = '无权限访问该资源'
      ElMessage.error(message)
    } else if (error.code === 'ECONNABORTED') {
      message = '请求超时，请重试'
      ElMessage.error(message)
    } else {
      message = (await resolveErrorMessage(error.response?.data)) || '网络异常，请稍后重试'
      ElMessage.error(message)
    }
    return Promise.reject(handledError(message))
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
