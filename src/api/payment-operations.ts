import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

export type PaymentResultStatus = 'SUCCESS' | 'FAILED'
export type PaymentCallbackStatus = 'RECEIVED' | 'APPLIED' | 'REJECTED'
export type CollectionOrderStatus = 'PENDING' | 'PAID' | 'FAILED'
export type CallbackSecurityEventType =
  | 'INVALID_METADATA'
  | 'UNKNOWN_CREDENTIAL'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED'
  | 'FUTURE_TIME'
  | 'NONCE_REPLAY'

/** 支付渠道回调审计，不包含签名或渠道密钥。 */
export interface PaymentCallbackAuditVO {
  callbackId: string
  paymentId: string
  channelCode?: string
  keyVersion?: string
  securityMode: 'LEGACY' | 'VERSIONED_NONCE'
  channelTransactionId: string
  resultStatus: PaymentResultStatus
  amount: number
  currency: string
  status: PaymentCallbackStatus
  failureMessage?: string
  occurredAt: string
  updatedAt: string
}

/** 支付回调安全事件，不包含 nonce 摘要、签名或密钥。 */
export interface PaymentCallbackSecurityEventVO {
  eventId: string
  callbackId: string
  paymentId: string
  channelCode?: string
  keyVersion?: string
  eventType: CallbackSecurityEventType
  severity: 'MEDIUM' | 'HIGH'
  alertTriggered: boolean
  message: string
  createdAt: string
}

/** Billing 追加应收收款订单。 */
export interface PremiumCollectionOrderVO {
  orderId: string
  postingId: string
  paymentId: string
  policyId: string
  customerId: string
  amount: number
  currency: string
  paymentMethod: string
  status: CollectionOrderStatus
  paymentStatus: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CallbackAuditQuery extends PageParams {
  callbackId?: string
  paymentId?: string
  channelCode?: string
  keyVersion?: string
  securityMode?: 'LEGACY' | 'VERSIONED_NONCE'
  channelTransactionId?: string
  resultStatus?: PaymentResultStatus
  status?: PaymentCallbackStatus
  occurredAtStart?: string
  occurredAtEnd?: string
}

export interface CollectionOrderQuery extends PageParams {
  orderId?: string
  postingId?: string
  paymentId?: string
  policyId?: string
  customerId?: string
  status?: CollectionOrderStatus
  paymentStatus?: string
  updatedAtStart?: string
  updatedAtEnd?: string
}

export interface CallbackSecurityEventQuery extends PageParams {
  callbackId?: string
  paymentId?: string
  channelCode?: string
  keyVersion?: string
  eventType?: CallbackSecurityEventType
  alertTriggered?: boolean
  createdAtStart?: string
  createdAtEnd?: string
}

export function getPaymentCallbackAudits(
  params: CallbackAuditQuery,
): Promise<PageResult<PaymentCallbackAuditVO>> {
  return http.get('/web/v1/proxy/payment-operations/callbacks', { params }) as Promise<
    PageResult<PaymentCallbackAuditVO>
  >
}

export function getPremiumCollectionOrders(
  params: CollectionOrderQuery,
): Promise<PageResult<PremiumCollectionOrderVO>> {
  return http.get('/web/v1/proxy/payment-operations/collection-orders', { params }) as Promise<
    PageResult<PremiumCollectionOrderVO>
  >
}

export function getPaymentCallbackSecurityEvents(
  params: CallbackSecurityEventQuery,
): Promise<PageResult<PaymentCallbackSecurityEventVO>> {
  return http.get('/web/v1/proxy/payment-operations/callback-security-events', { params }) as Promise<
    PageResult<PaymentCallbackSecurityEventVO>
  >
}

export function reconcilePremiumCollectionOrder(
  orderId: string,
): Promise<PremiumCollectionOrderVO> {
  return http.post(
    `/web/v1/proxy/payment-operations/collection-orders/${encodeURIComponent(orderId)}/reconcile`,
  ) as Promise<PremiumCollectionOrderVO>
}
