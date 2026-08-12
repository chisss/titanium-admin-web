// 投保单与意向单相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

// ==================== 投保单（Insurance Application）====================

/** 投保单视图对象 */
export interface InsuranceVO {
  id: string
  insuranceNo: string
  productName?: string
  productCode?: string
  holderName?: string
  holderIdNo?: string
  status: string
  totalPremium?: number
  applicantName?: string
  createdAt?: string
  updatedAt?: string
}

/** 查询投保单列表 */
export async function getInsuranceList(
  params?: Partial<PageParams> & {
    insuranceNo?: string
    holderName?: string
    holderIdNo?: string
    productName?: string
    status?: string
  },
): Promise<PageResult<InsuranceVO>> {
  const res = await http.get<unknown, PageResult<InsuranceVO>>('/web/v1/proxy/insurances', { params })
  return res
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
  id: string
  proposalNo: string
  customerName: string
  mobile?: string
  productName?: string
  productCode?: string
  status: string
  sourceChannel?: string
  expectedPremium?: number
  followUpPerson?: string
  lastFollowTime?: string
  createdAt?: string
  updatedAt?: string
}

/** 查询意向单列表 */
export async function getProposalList(
  params?: Partial<PageParams> & {
    proposalNo?: string
    customerName?: string
    mobile?: string
    productName?: string
    status?: string
    sourceChannel?: string
  },
): Promise<PageResult<ProposalVO>> {
  const res = await http.get<unknown, PageResult<ProposalVO>>('/web/v1/proxy/proposals', { params })
  return res
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
