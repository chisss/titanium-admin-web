// 渠道相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 渠道信息 */
export interface ChannelVO {
  channelId: string
  channelCode: string
  channelName: string
  channelType: string
  status: 'ACTIVE' | 'INACTIVE'
  contactPerson?: string
  contactPhone?: string
  defaultCommissionRate?: number
  createdAt: string
}

export type CommissionSchemeStatus = 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'RETIRED'

export interface CommissionTier {
  lowerInclusive: number
  upperExclusive?: number
  rate?: number
  fixedAmount?: number
}

export interface CommissionSplit {
  beneficiaryType: string
  beneficiaryId: string
  splitRate: number
  sortOrder: number
}

/** 渠道合同下的版本化佣金方案。 */
export interface CommissionScheme {
  schemeId: string
  channelId: string
  productId: string
  schemeCode: string
  schemeVersion: string
  schemeName: string
  description?: string
  currency: string
  calculationMethod: 'PERCENTAGE' | 'FIXED' | 'TIERED'
  rate?: number
  fixedAmount?: number
  capAmount?: number
  baseComponentCodes: string[]
  tiers: CommissionTier[]
  splits: CommissionSplit[]
  policyYearFrom: number
  policyYearTo: number
  installmentCount: number
  clawbackMonths: number
  effectiveFrom: string
  effectiveTo?: string
  status: CommissionSchemeStatus
  contentHash?: string
}

/** 查询渠道列表 */
export function getChannelList(params?: Partial<{
  channelName: string; channelCode: string; channelType: string; status: string
}> & PageParams): Promise<PageResult<ChannelVO>> {
  return http.get('/web/v1/proxy/channels', { params }) as Promise<PageResult<ChannelVO>>
}

/** 获取渠道详情 */
export function getChannelDetail(id: string): Promise<ChannelVO> {
  return http.get(`/web/v1/proxy/channels/${id}`) as Promise<ChannelVO>
}

/** 新建渠道 */
export function createChannel(data: Partial<ChannelVO>): Promise<void> {
  return http.post('/web/v1/proxy/channels', data) as Promise<void>
}

/** 更新渠道 */
export function updateChannel(id: string, data: Partial<ChannelVO>): Promise<void> {
  return http.put(`/web/v1/proxy/channels/${id}`, data) as Promise<void>
}

/** 激活渠道 */
export function activateChannel(id: string): Promise<void> {
  return http.put(`/web/v1/proxy/channels/${id}/activate`) as Promise<void>
}

/** 停用渠道 */
export function deactivateChannel(id: string): Promise<void> {
  return http.put(`/web/v1/proxy/channels/${id}/deactivate`) as Promise<void>
}

/** 获取渠道关联产品 */
export function getChannelProducts(id: string): Promise<unknown[]> {
  return http.get(`/web/v1/proxy/channels/${id}/products`) as Promise<unknown[]>
}

/** 查询某渠道、产品下的佣金方案版本。 */
export function getCommissionSchemeList(params: {
  channelId: string
  productId: string
  status?: CommissionSchemeStatus
  pageNum?: number
  pageSize?: number
}): Promise<PageResult<CommissionScheme>> {
  return http.get('/web/v1/proxy/commission-schemes', { params }) as Promise<PageResult<CommissionScheme>>
}

export function getCommissionScheme(schemeId: string): Promise<CommissionScheme> {
  return http.get(`/web/v1/proxy/commission-schemes/${schemeId}`) as Promise<CommissionScheme>
}

export function createCommissionScheme(data: Omit<CommissionScheme, 'schemeId' | 'status' | 'contentHash'>): Promise<CommissionScheme> {
  return http.post('/web/v1/proxy/commission-schemes', data) as Promise<CommissionScheme>
}

export function approveCommissionScheme(schemeId: string): Promise<CommissionScheme> {
  return http.put(`/web/v1/proxy/commission-schemes/${schemeId}/approve`) as Promise<CommissionScheme>
}

export function publishCommissionScheme(schemeId: string): Promise<CommissionScheme> {
  return http.put(`/web/v1/proxy/commission-schemes/${schemeId}/publish`) as Promise<CommissionScheme>
}

export function retireCommissionScheme(schemeId: string): Promise<CommissionScheme> {
  return http.put(`/web/v1/proxy/commission-schemes/${schemeId}/retire`) as Promise<CommissionScheme>
}
