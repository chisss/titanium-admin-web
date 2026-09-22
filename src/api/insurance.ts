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

// ==================== 出单进度（三张单据的唯一公共键 bizNo 的桥）====================

/** 已产出保单（下游 IssuanceResponse.IssuedPolicy） */
export interface IssuedPolicyVO {
  policyId?: string
  policyNo?: string
  policyStatus?: string
  lineCount?: number
  totalPremium?: number
}

/** 出单进度视图对象 */
export interface IssuanceProgressVO {
  success?: boolean
  bizNo?: string
  issuanceMode?: string
  issuanceStrategy?: string
  currentStage?: string
  proposalId?: string
  proposalNo?: string
  insuranceId?: string
  insuranceNo?: string
  policies?: IssuedPolicyVO[]
  underwritingId?: string
  rejectCode?: string
  rejectReason?: string
}

/**
 * 查询出单进度。
 *
 * <p>用于「意向单 → 投保单 → 保单」的跳转：三张单据在读模型里**互缺外键**
 * （意向单视图无 insurance_id、投保单视图无 policy_id、保单视图的 insurance_id 被 VO 层丢弃），
 * `bizNo` 是唯一公共键，出单进度表把三者记在同一行。</p>
 *
 * <p>🔴 返回 `null` 是**正常结果**而非错误：下游在流水号不存在时返回 204，
 * BFF 包成成功信封的 `data: null`。调用方必须容忍，且**不得**据此弹错误提示。</p>
 */
export async function getIssuanceProgress(bizNo: string): Promise<IssuanceProgressVO | null> {
  // 🔴 置 silentError：本请求是「打开详情时顺带补下游单据 ID」的**辅助请求**，
  // 调用方已就地兜底（拿不到只意味着不显示跳转入口，页面主体照常渲染）。
  // 不置的话，一次与用户操作无关的失败会弹全局红条，把「优雅降级」显示成「页面出错」（D-501-58）。
  return http.get(`/web/v1/proxy/issuances/${bizNo}`, { silentError: true })
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
