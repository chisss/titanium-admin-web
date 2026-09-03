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

    // 下载文件直接返回
    if (response.config.responseType === 'blob') {
      return response
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
      return Promise.reject(new Error('登录已过期'))
    }

    if (res.code === 403) {
      ElMessage.error('无权限访问该资源')
      return Promise.reject(new Error('无权限'))
    }

    ElMessage.error(res.message || '请求失败')
    return Promise.reject(new Error(res.message))
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('ti_token')
      localStorage.removeItem('ti_tenant_id')
      window.location.href = '/login'
      return Promise.reject(error)
    }
    if (error.response?.status === 403) {
      ElMessage.error('无权限访问该资源')
    } else if (error.code === 'ECONNABORTED') {
      ElMessage.error('请求超时，请重试')
    } else {
      ElMessage.error(error.response?.data?.message || '网络异常，请稍后重试')
    }
    return Promise.reject(error)
  },
)

export default http
