// 通知相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 通知信息 */
export interface NotificationVO {
  id: string
  customerId?: string
  customerName?: string
  channel: 'SMS' | 'EMAIL' | 'IN_APP'
  title?: string
  content: string
  status: 'PENDING' | 'SENT' | 'FAILED' | 'READ'
  sentAt?: string
  createdAt: string
}

/** 查询通知列表 */
export function getNotificationList(params?: Partial<{
  customerId: string; channel: string; status: string
}> & PageParams): Promise<PageResult<NotificationVO>> {
  return http.get('/web/v1/proxy/notifications', { params }) as Promise<PageResult<NotificationVO>>
}

/** 获取通知详情 */
export function getNotificationDetail(id: string): Promise<NotificationVO> {
  return http.get(`/web/v1/proxy/notifications/${id}`) as Promise<NotificationVO>
}

/** 发送通知 */
export function sendNotification(data: Partial<NotificationVO>): Promise<void> {
  return http.post('/web/v1/proxy/notifications', data) as Promise<void>
}

/** 批量标记已读 */
export function batchMarkRead(ids: string[]): Promise<void> {
  return http.put('/web/v1/proxy/notifications/batch-read', { ids }) as Promise<void>
}
