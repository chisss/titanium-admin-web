// 通知相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/**
 * 通知读模型（D-501-63：字段名对齐下游 `NotificationQueryResult` / BFF `NotificationMirror`）。
 * 🔴 状态只有 PENDING/SENT/FAILED —— 后端**没有**「已读」状态，前端不得再臆造 `READ`。
 */
export interface NotificationVO {
  notificationId: string
  /** 通知渠道（SMS/EMAIL/PUSH/WECHAT/INTERNAL） */
  notificationType: 'SMS' | 'EMAIL' | 'PUSH' | 'WECHAT' | 'INTERNAL'
  templateCode?: string
  /** 接收方（手机号/邮箱/openId） */
  recipient?: string
  subject?: string
  content: string
  /** 业务触发场景 */
  businessType?: string
  /** 关联业务单据ID */
  businessId?: string
  status: 'PENDING' | 'SENT' | 'FAILED'
  sentAt?: string
  createTime?: string
  updateTime?: string
}

/** 发送通知入参（对齐下游 `SendNotificationRequest`） */
export interface SendNotificationPayload {
  notificationType: NotificationVO['notificationType']
  recipient: string
  subject?: string
  content: string
}

/** 查询通知列表 */
export function getNotificationList(params?: Partial<{
  customerId: string; channel: string; status: string
}> & PageParams): Promise<PageResult<NotificationVO>> {
  return http.get('/web/v1/proxy/notifications', { params }) as Promise<PageResult<NotificationVO>>
}

/** 获取通知详情 */
export function getNotificationDetail(notificationId: string): Promise<NotificationVO> {
  return http.get(`/web/v1/proxy/notifications/${notificationId}`) as Promise<NotificationVO>
}

/** 发送通知，返回下游生成的 notificationId */
export function sendNotification(data: SendNotificationPayload): Promise<string> {
  return http.post('/web/v1/proxy/notifications', data) as Promise<string>
}

/**
 * 批量确认送达（下游 `PUT /batch-read`）。
 * <p>⚠️ 后端语义为 PENDING → SENT（确认送达），**不是「已读」**（状态机无 READ）——
 * 按钮文案须与之一致，见 D-501-67。</p>
 * @returns 实际标记成功的条数（后端如实返回，可能小于入参条数）
 */
export function batchMarkRead(ids: string[]): Promise<number> {
  return http.put('/web/v1/proxy/notifications/batch-read', { ids }) as Promise<number>
}
