// 渠道相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 渠道信息 */
export interface ChannelVO {
  id: string
  channelCode: string
  channelName: string
  channelType: string
  status: 'ACTIVE' | 'INACTIVE'
  contactName?: string
  contactPhone?: string
  commissionRate?: number
  createdAt: string
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
