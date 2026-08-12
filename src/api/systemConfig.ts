// 系统配置相关接口
import http from './http'

/** 全局参数配置 */
export interface GlobalConfig {
  defaultPageSize?: number
  maxFileSize?: string
  tokenExpiry?: string
}

/** 邮件服务配置 */
export interface EmailConfig {
  host?: string
  port?: number
  username?: string
  ssl?: boolean
}

/** 短信服务配置 */
export interface SmsConfig {
  provider?: string
  accessKey?: string
  signName?: string
}

/** 系统配置聚合 */
export interface SystemConfig {
  globalConfig?: GlobalConfig
  emailConfig?: EmailConfig
  smsConfig?: SmsConfig
}

/** 查询系统配置 */
export function getSystemConfigs(): Promise<SystemConfig> {
  return http.get('/web/v1/system/configs')
}

/** 全量保存系统配置 */
export function saveSystemConfigs(data: SystemConfig): Promise<void> {
  return http.put('/web/v1/system/configs', data)
}
