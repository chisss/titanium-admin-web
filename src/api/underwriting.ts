// 核保相关接口（端点与 admin BFF UnderwritingProxyController 一一对应，字段与下游 UnderwritingVO 对齐）
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/**
 * 核保案件 VO（字段与 admin BFF UnderwritingMirror / 下游 UnderwritingVO 对齐）
 * 枚举字段均为枚举 code 字符串（如 status=MANUAL_REVIEW、underwritingType=NEW_BUSINESS）
 */
export interface UnderwritingCaseVO {
  /** 核保案件ID */
  underwritingId: string
  /** 核保案号（UW 前缀业务号，创建时由核保域发号生成） */
  caseNo?: string
  /** 保单ID */
  policyId?: string
  /** 客户ID */
  customerId?: string
  /** 核保金额 */
  amount?: number
  /** 核保类型（NEW_BUSINESS/RENEWAL/ENDORSEMENT/REINSTATEMENT） */
  underwritingType?: string
  /** 核保状态（PENDING/APPROVED/MANUAL_REVIEW/... 枚举 code） */
  status: string
  /** 拒保原因 */
  rejectReason?: string
  /** 复核意见 */
  reviewComments?: string
  /** 风险等级（STANDARD/SUB_STANDARD/HIGH_RISK/UNINSURABLE） */
  riskLevel?: string
  /** 结论类型（ACCEPT/MODIFY/REJECT/POSTPONE/EXCLUDED） */
  conclusionType?: string
  /** 审核类型（AUTOMATIC/MANUAL/HYBRID） */
  auditType?: string
  /** 核保员ID */
  underwriterId?: string
  /** 核保员姓名 */
  underwriterName?: string
  /** 风险因素（JSON 字符串） */
  riskFactors?: string
  /** 保费加费比例（%） */
  premiumSurchargeRate?: number
  /** 加费原因 */
  surchargeReason?: string
  /** 除外责任 */
  exclusions?: string
  /** 延期月数 */
  postponePeriodMonths?: number
  /** 延期原因 */
  postponeReason?: string
  /** 体检ID */
  medicalExamId?: string
  /** 体检状态 */
  medicalExamStatus?: string
  /** 调查结论 */
  investigationResult?: string
  /** 行业拒保记录 */
  industryDeclineRecord?: string
  /** 核保开始时间（ISO-8601 字符串） */
  underwritingStartTime?: string
  /** 核保完成时间（ISO-8601 字符串） */
  underwritingCompletedTime?: string
  /** 处理耗时（小时） */
  processingHours?: number
  /** 是否需要复核 */
  requiresReview?: boolean
  /** 复核人ID */
  reviewerId?: string
  /** 复核人意见 */
  reviewerComments?: string
  /** 基础保费 */
  basePremium?: number
  /** 加费金额 */
  additionalPremium?: number
  /** 最终保费 */
  finalPremium?: number
  /** 折扣金额 */
  discountAmount?: number
  /** 创建时间（ISO-8601 字符串） */
  createdAt?: string
  /** 创建人 */
  createdBy?: string
  /** 更新时间（ISO-8601 字符串） */
  updatedAt?: string
  /** 更新人 */
  updatedBy?: string
  /** 版本号 */
  version?: number
}

/** 核保决策入参（字段与下游 DecideUnderwritingDTO 对齐；decidedBy 由 BFF 按登录用户注入） */
export interface DecisionRequest {
  /** 审核类型（AUTOMATIC/MANUAL/HYBRID） */
  auditType: string
}

/** 核保案件列表（BFF 透传下游 search 端点，返回归一化 PageVO {list,total}） */
export async function getUnderwritingList(
  params?: Partial<{
    status: string
    underwritingType: string
    startTime: string
    endTime: string
  }> &
    PageParams,
): Promise<PageResult<UnderwritingCaseVO>> {
  const { pageNum, pageSize, ...filters } = params ?? {}
  const payload = await http.get<unknown, UnderwritingCaseVO[] | PageResult<UnderwritingCaseVO>>(
    '/web/v1/proxy/underwriting',
    {
      params: {
        ...filters,
        // 下游 Spring PageRequest 页码从 0 开始
        page: Math.max(Number(pageNum ?? 1) - 1, 0),
        size: pageSize ?? 10,
      },
    },
  )
  const list = Array.isArray(payload) ? payload : payload?.list
  return {
    list: Array.isArray(list) ? list : [],
    total: Array.isArray(payload) ? payload.length : payload?.total ?? list?.length ?? 0,
    pageNum: Number(pageNum ?? 1),
    pageSize: Number(pageSize ?? 10),
  }
}

/** 核保案件详情 */
export function getUnderwritingDetail(id: string): Promise<UnderwritingCaseVO> {
  return http.get(`/web/v1/proxy/underwriting/${id}`) as Promise<UnderwritingCaseVO>
}

/** 核保决策（下游 PUT /{id}/decide，decidedBy 由 BFF 注入当前登录用户） */
export function makeDecision(id: string, data: DecisionRequest): Promise<UnderwritingCaseVO> {
  return http.put(`/web/v1/proxy/underwriting/${id}/decision`, data) as Promise<UnderwritingCaseVO>
}
