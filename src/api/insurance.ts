// 投保单与意向单相关接口
import http from './http'
import { toPageResult } from './pageResult'
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
  return toPageResult(payload, Number(pageNum ?? 1), Number(pageSize ?? 20))
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
  return toPageResult(payload, Number(pageNum ?? 1), Number(pageSize ?? 20))
}

/** 获取意向单详情 */
export async function getProposalDetail(id: string): Promise<ProposalVO> {
  return http.get(`/web/v1/proxy/proposals/${id}`)
}

// 🔴 原「创建意向单」`createProposal` / 「提交意向单」`submitProposal` 两个封装已按 D-501-01 删除，勿再恢复：
// ① 字段名与下游契约对不上（本封装 productCode/sourceChannel/expectedPremium/remark
//    ↔ 下游 CreateProposalRequest expectedProductCode/channel/intendedPremium/无 remark），
//    且 proposalId/proposalNo/policyForm/insurancePeriodStart/End 等必填项无处可填，调用必失败；
// ② 更根本的是该链路**无法承载参与方与标的**（下游 CreateProposalRequest 仅 12 个标量字段、
//    命令层兼容构造器把 insuredPartyList/proposalSubjects 置 null），而意向单提交要求
//    「至少一名申请人 + 至少一个标的」，故经此入口创建的意向单**恒不可提交**。
// 完整出单（含参与方/标的装配 + 自动提交）走统一出单入口 POST /api/v1/issuances（PolicyIssuanceApi）。
// 后台「意向单查询」页为只读，不提供新增/提交入口，与本删除一致。
