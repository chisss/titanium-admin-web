// 投保单与意向单相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

// ==================== 投保单（Insurance Application）====================

/** 投保单视图对象 */
export interface InsuranceVO {
  insuranceId: string
  insuranceNo: string
  proposalId?: string
  policyForm?: string
  insuranceType?: string
  productId?: string
  sumInsured?: number
  paymentFrequency?: string
  premiumPaymentYears?: number
  collectionMode?: string
  channelId?: string
  bizNo?: string
  marketPackageId?: string
  lineCount?: number
  holderId?: string
  insuredCount?: number
  status: string
  exactPremium?: number
  currency?: string
  insurancePeriodStart?: string
  insurancePeriodEnd?: string
  underwritingResultCode?: string
  underwritingId?: string
  issuedTime?: string
  createTime?: string
  updateTime?: string
}

/** 查询投保单列表 */
export async function getInsuranceList(
  params?: Partial<PageParams> & {
    insuranceNo?: string
    holderId?: string
    productId?: string
    status?: string
  },
): Promise<PageResult<InsuranceVO>> {
  const { pageNum, pageSize, ...filters } = params ?? {}
  const payload = await http.get<unknown, InsuranceVO[] | PageResult<InsuranceVO>>('/web/v1/proxy/insurances', {
    params: {
      ...filters,
      page: Math.max(Number(pageNum ?? 1) - 1, 0),
      size: pageSize ?? 20,
    },
  })
  const list = Array.isArray(payload) ? payload : payload?.list
  return {
    list: Array.isArray(list) ? list : [],
    total: Array.isArray(payload) ? payload.length : payload?.total ?? list?.length ?? 0,
    pageNum: Number(pageNum ?? 1),
    pageSize: Number(pageSize ?? 20),
  }
}

/** 获取投保单详情 */
export async function getInsuranceDetail(id: string): Promise<InsuranceVO> {
  return http.get(`/web/v1/proxy/insurances/${id}`)
}

/** 提交核保 */
export async function submitInsuranceUnderwriting(id: string): Promise<void> {
  return http.put(`/web/v1/proxy/insurances/${id}/underwriting`)
}

// ==================== 意向单（Proposal）====================

/** 意向单视图对象 */
export interface ProposalVO {
  proposalId: string
  proposalNo: string
  policyForm?: string
  channel?: string
  customerId?: string
  intendedSumInsured?: number
  intendedPremium?: number
  insurancePeriodStart?: string
  insurancePeriodEnd?: string
  expectedProductCode?: string
  insuranceType?: string
  bizNo?: string
  channelId?: string
  marketPackageId?: string
  lineCount?: number
  status: string
  createTime?: string
  updateTime?: string
}

/** 查询意向单列表 */
export async function getProposalList(
  params?: Partial<PageParams> & {
    proposalNo?: string
    customerId?: string
    productCode?: string
    status?: string
  },
): Promise<PageResult<ProposalVO>> {
  const { pageNum, pageSize, ...filters } = params ?? {}
  const payload = await http.get<unknown, ProposalVO[] | PageResult<ProposalVO>>('/web/v1/proxy/proposals', {
    params: {
      ...filters,
      page: Math.max(Number(pageNum ?? 1) - 1, 0),
      size: pageSize ?? 20,
    },
  })
  const list = Array.isArray(payload) ? payload : payload?.list
  return {
    list: Array.isArray(list) ? list : [],
    total: Array.isArray(payload) ? payload.length : payload?.total ?? list?.length ?? 0,
    pageNum: Number(pageNum ?? 1),
    pageSize: Number(pageSize ?? 20),
  }
}

/** 获取意向单详情 */
export async function getProposalDetail(id: string): Promise<ProposalVO> {
  return http.get(`/web/v1/proxy/proposals/${id}`)
}

/** 创建意向单 */
export interface CreateProposalForm {
  customerId: string
  productCode: string
  sourceChannel?: string
  expectedPremium?: number
  remark?: string
}

export async function createProposal(data: CreateProposalForm): Promise<string> {
  return http.post('/web/v1/proxy/proposals', data)
}

/** 提交意向单 */
export async function submitProposal(id: string): Promise<void> {
  return http.put(`/web/v1/proxy/proposals/${id}/submit`)
}
