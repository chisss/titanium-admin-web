import http from './http'
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

export const listRuleSets = (type = 'PRICING') =>
  http.get<unknown, PageResult<RuleSet>>('/web/v1/proxy/rules', { params: { type } })

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
