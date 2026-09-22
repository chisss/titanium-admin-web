import http from './http'
import type { AxiosRequestConfig } from 'axios'
import type { PageResult } from '@/types/api.d'

export interface RuleDefinition {
  ruleId?: string
  ruleName: string
  priority: number
  condition?: string
  action: string
  actionParams?: Record<string, unknown>
  computeExpression?: string
}

export interface RuleSet {
  ruleSetId: string
  ruleSetCode: string
  ruleSetVersion?: string
  inputSchemaVersion?: string
  ruleSetName: string
  ruleSetType: string
  description?: string
  status: string
  artifactHash?: string
  rules?: RuleDefinition[]
}

/**
 * 查询规则集列表。
 *
 * <p>`config` 与既有的 `params` 合并下发（`params` 在前、`config` 在后，
 * 故调用方可覆盖 type）—— 当前唯一传参方 `product/detail` 用它带 `silentError: true`：
 * 核保规则集只是产品详情页的**名称映射附属数据**，取不到不影响主信息，
 * 调用方已就地 `.catch(() => {})`，不该再弹全局红条。</p>
 */
export const listRuleSets = (type = 'PRICING', config?: AxiosRequestConfig) =>
  http.get<unknown, PageResult<RuleSet>>('/web/v1/proxy/rules', { params: { type }, ...config })

export const getRuleSet = (code: string) =>
  http.get<unknown, RuleSet>(`/web/v1/proxy/rules/${encodeURIComponent(code)}`)

export const createRuleSet = (body: Record<string, unknown>) =>
  http.post<unknown, string>('/web/v1/proxy/rules', body)

export const addRule = (ruleSetId: string, body: Record<string, unknown>) =>
  http.post(`/web/v1/proxy/rules/${ruleSetId}/rules`, body)

export const activateRuleSet = (ruleSetId: string) =>
  http.post(`/web/v1/proxy/rules/${ruleSetId}/activate`)

export const deactivateRuleSet = (ruleSetId: string) =>
  http.post(`/web/v1/proxy/rules/${ruleSetId}/deactivate`)
