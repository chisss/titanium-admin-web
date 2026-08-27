// 计费相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/** 账单 VO */
export interface BillVO {
  billId: string
  billingAccountId?: string
  policyId: string
  customerId?: string
  billingType?: string
  amount: number
  paidAmount?: number
  unpaidAmount?: number
  penaltyAmount?: number
  status: 'ISSUED' | 'PAID' | 'OVERDUE' | 'CANCELLED'
  issueDate?: string
  dueDate?: string
  overdueDate?: string
  paymentMethod?: string
  transactionId?: string
  paymentDate?: string
  createdAt?: string
  updatedAt?: string
  /** 兼容旧版管理端聚合字段 */
  id?: string
  billNo?: string
  policyNo?: string
  holderName?: string
  paidDate?: string
}

/** 缴费计划条目 */
export interface PremiumScheduleVO {
  period: number
  dueDate: string
  amount: number
  currency: string
  status: 'PENDING' | 'PAID' | 'OVERDUE'
}

export interface ReceivableLineVO {
  calculationId: string
  lineId: string
  componentCode: string
  componentVersion: string
  category: string
  direction: string
  payerType: string
  accountingClass: string
  currency: string
  baseAmount?: number
  rate?: number
  amount: number
  nodeCode: string
  customerVisible: boolean
  description?: string
  affectsCustomerPayable: boolean
}

export interface TaxLedgerLineVO {
  calculationId: string
  lineId: string
  componentCode: string
  componentVersion: string
  category: string
  currency: string
  taxableBase: number
  taxRate: number
  taxAmount: number
  jurisdictionCode: string
  regulatoryReferenceId: string
  taxPriceMode: 'EXCLUSIVE' | 'INCLUSIVE'
  taxPolicyHash: string
  taxExempt: boolean
}

export interface BillingPricingFactVO {
  billId: string
  receivableLines: ReceivableLineVO[]
  taxLedgerLines: TaxLedgerLineVO[]
  commissionPayables: CommissionPayableVO[]
  invoiceReconciliation: {
    expectedTaxAmount: number
    invoicedTaxAmount: number
    difference: number
    status: 'NOT_APPLICABLE' | 'EXEMPT' | 'UNINVOICED' | 'MATCHED' | 'MISMATCH'
    effectiveInvoiceIds: string[]
  }
}

export type CommissionPayableStatus =
  | 'PENDING'
  | 'PARTIALLY_SETTLED'
  | 'SETTLED'
  | 'CLAWBACK_PENDING'
  | 'CLAWED_BACK'
  | 'CANCELLED'

/** Billing 按 Product 确认计算证据生成的佣金应付。 */
export interface CommissionPayableVO {
  payableId: string
  billId: string
  policyId: string
  calculationId: string
  sourceLineId: string
  resultHash: string
  productId: string
  channelId: string
  schemeCode: string
  schemeVersion: string
  schemeHash: string
  beneficiaryType: string
  beneficiaryId: string
  currency: string
  baseAmount?: number
  grossCommission?: number
  splitRate?: number
  payableAmount?: number
  installmentCount: number
  clawbackMonths: number
  status: CommissionPayableStatus
  settledAmount?: number
  clawbackAmount?: number
  createdAt: string
  updatedAt: string
}

/** 账单列表 */
export function getBillList(
  params?: Partial<{
    billNo: string
    policyId: string
    status: string
    dateRange: string[]
  }> &
    PageParams,
): Promise<PageResult<BillVO>> {
  return http.get('/web/v1/proxy/billing', { params }) as Promise<PageResult<BillVO>>
}

/** 账单详情 */
export function getBillDetail(id: string): Promise<BillVO> {
  return http.get(`/web/v1/proxy/billing/${id}`) as Promise<BillVO>
}

/** 查询 Product 确认计算影子入账后的应收、税务台账及发票勾稽。 */
export function getBillPricingFacts(id: string): Promise<BillingPricingFactVO> {
  return http.get(`/web/v1/proxy/billing/${id}/pricing-facts`) as Promise<BillingPricingFactVO>
}

/** 缴费计划 */
export function getPremiumSchedule(policyId: string): Promise<PremiumScheduleVO[]> {
  return http.get(`/web/v1/proxy/billing/${policyId}/premium-schedule`) as Promise<PremiumScheduleVO[]>
}

export function getCommissionPayableList(params?: Partial<{
  status: CommissionPayableStatus
  channelId: string
  beneficiaryId: string
}> & PageParams): Promise<PageResult<CommissionPayableVO>> {
  return http.get('/web/v1/proxy/commission-payables', { params }) as Promise<PageResult<CommissionPayableVO>>
}

export function getCommissionPayable(payableId: string): Promise<CommissionPayableVO> {
  return http.get(`/web/v1/proxy/commission-payables/${payableId}`) as Promise<CommissionPayableVO>
}

export function settleCommissionPayable(payableId: string, amount: number): Promise<CommissionPayableVO> {
  return http.post(`/web/v1/proxy/commission-payables/${payableId}/settlements`, { amount }) as Promise<CommissionPayableVO>
}

export function requestCommissionClawback(payableId: string, amount: number): Promise<CommissionPayableVO> {
  return http.post(`/web/v1/proxy/commission-payables/${payableId}/clawbacks`, { amount }) as Promise<CommissionPayableVO>
}

export function completeCommissionClawback(payableId: string): Promise<CommissionPayableVO> {
  return http.post(`/web/v1/proxy/commission-payables/${payableId}/clawbacks:complete`) as Promise<CommissionPayableVO>
}

export function cancelCommissionPayable(payableId: string): Promise<CommissionPayableVO> {
  return http.post(`/web/v1/proxy/commission-payables/${payableId}/cancel`) as Promise<CommissionPayableVO>
}
