// 条款相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'
import { CATEGORY_BY_INSURANCE_TYPE } from '@/constants/insurance'

/** 条款信息（前端视图模型，字段名对齐列表/编辑页） */
export interface ClauseVO {
  id: string
  code: string
  name: string
  category: string
  /** 后端持久化的具体险种枚举值 */
  insuranceType?: string
  clauseType?: string
  version: string
  content?: string
  description?: string
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'ARCHIVED'
  effectiveDate?: string
  createdAt?: string
  updatedAt?: string
}

function toCategory(insuranceType?: string): string | undefined {
  if (!insuranceType) return undefined
  return CATEGORY_BY_INSURANCE_TYPE[insuranceType] ?? insuranceType
}

/** 日期(YYYY-MM-DD) → 后端 LocalDateTime 可解析的 ISO 字符串 */
function toDateTime(date?: string): string | undefined {
  if (!date) return undefined
  return date.length > 10 ? date : `${date}T00:00:00`
}

/** 后端 ISO 时间 → 前端日期(YYYY-MM-DD) */
function toDate(dateTime?: string): string | undefined {
  if (!dateTime) return undefined
  return dateTime.slice(0, 10)
}

/** 前端视图模型 → 后端条款 DTO（字段名 + 枚举 + 时间对齐契约） */
function toClausePayload(data: Partial<ClauseVO>): Record<string, unknown> {
  return {
    clauseCode: data.code,
    clauseName: data.name,
    clauseType: data.clauseType ?? 'MAIN',
    insuranceType: data.insuranceType,
    content: data.content,
    description: data.description,
    effectiveDate: toDateTime(data.effectiveDate),
  }
}

/** 后端条款 VO → 前端视图模型 */
function fromClauseVO(vo: Record<string, any>): ClauseVO {
  const insuranceType = typeof vo.insuranceType === 'string'
    ? vo.insuranceType
    : vo.insuranceType?.name ?? vo.insuranceType?.code
  return {
    id: vo.clauseId ?? vo.id,
    code: vo.clauseCode ?? vo.code,
    name: vo.clauseName ?? vo.name,
    category: toCategory(insuranceType) ?? vo.category ?? '',
    insuranceType,
    clauseType: vo.clauseType,
    version: vo.version ?? 'V1.0',
    content: vo.content,
    description: vo.description,
    status: vo.status,
    effectiveDate: toDate(vo.effectiveDate),
    createdAt: toDate(vo.createdAt),
    updatedAt: toDate(vo.updatedAt),
  }
}

/** 查询条款列表 */
export async function getClauseList(
  params?: Partial<PageParams> & Record<string, unknown>,
): Promise<PageResult<ClauseVO>> {
  const res = await http.get<unknown, PageResult<Record<string, any>>>('/web/v1/proxy/clauses', { params })
  return { ...res, list: (res.list ?? []).map(fromClauseVO) }
}

/** 获取条款详情 */
export async function getClauseDetail(id: string): Promise<ClauseVO> {
  const vo = await http.get<unknown, Record<string, any>>(`/web/v1/proxy/clauses/${id}`)
  return fromClauseVO(vo)
}

/** 新增条款 */
export function createClause(data: Partial<ClauseVO>, createdBy: string): Promise<void> {
  return http.post('/web/v1/proxy/clauses', { ...toClausePayload(data), createdBy })
}

/** 更新条款 */
export function updateClause(id: string, data: Partial<ClauseVO>, updatedBy: string): Promise<void> {
  return http.put(`/web/v1/proxy/clauses/${id}`, { ...toClausePayload(data), updatedBy })
}

/** 条款审批类型（后端仅支持这三类） */
export type ClauseApprovalType = 'LEGAL' | 'ACTUARIAL' | 'MANAGEMENT'

/** 提交条款审批 */
export function submitApproval(id: string, submittedBy: string): Promise<void> {
  return http.put(`/web/v1/proxy/clauses/${id}/submit-approval`, { submittedBy })
}

/** 条款审批请求 */
export interface ClauseApprovalRequest {
  approvalType: ClauseApprovalType
  approverId: string
  approverName: string
  comment?: string
}

/** 审批通过条款 */
export function approve(id: string, data: ClauseApprovalRequest): Promise<void> {
  return http.put(`/web/v1/proxy/clauses/${id}/approve`, data)
}

/** 驳回条款 */
export function reject(id: string, data: ClauseApprovalRequest): Promise<void> {
  return http.put(`/web/v1/proxy/clauses/${id}/reject`, data)
}

/** 启用条款 */
export function activateClause(id: string, updatedBy: string): Promise<void> {
  return http.put(`/web/v1/proxy/clauses/${id}/activate`, { updatedBy })
}

/** 停用条款 */
export function deactivateClause(id: string, updatedBy: string): Promise<void> {
  return http.put(`/web/v1/proxy/clauses/${id}/inactivate`, { updatedBy })
}

// ==================== 保险责任（Coverage） ====================

/** 保险责任（前端扁平模型，与后端 CoverageVO/CoverageDTO 对称） */
export interface CoverageVO {
  coverageId?: string
  clauseId?: string
  coverageCode?: string
  coverageName?: string
  /** 责任类型：CRITICAL_ILLNESS/MEDICAL/ACCIDENT/DEATH */
  coverageType?: string
  /** 赔付触发类型：MEDICAL_EXPENSE/CRITICAL_ILLNESS/... */
  triggerType?: string
  /** 赔付类型：REIMBURSEMENT/PROPORTIONAL/ACTUAL_LOSS/FIXED/PERIODIC */
  payoutType?: string
  /** 最高保额 */
  coverageAmount?: number
  /** 单次/年度赔付上限 */
  maxPayout?: number
  /** 社保内报销比例 0-1 */
  reimbursementRatio?: number
  /** 社保外报销比例 0-1 */
  outSocialRatio?: number
  /** 比例赔付比例 0-1 */
  proportion?: number
  /** 年免赔额 */
  deductibleAmount?: number
  /** 等待期天数 */
  waitingPeriodDays?: number
  /** 日津贴金额（元/天） */
  dailyAmount?: number
  /** 免赔天数 */
  deductibleDays?: number
  /** 每次最高赔付天数 */
  maxDaysPerClaim?: number
  /** 累计最高赔付天数 */
  maxDaysTotal?: number
  /** 责任描述 */
  description?: string
  /** 是否附加责任 */
  isAdditional?: boolean
}

/** 查询条款下的保险责任列表（后端为 @PathVariable 子资源，返回裸数组） */
export function getCoverages(clauseId: string): Promise<CoverageVO[]> {
  return http.get(`/web/v1/proxy/clauses/${clauseId}/coverages`)
}

/** 为条款新增保险责任 */
export function addCoverage(clauseId: string, data: CoverageVO): Promise<void> {
  return http.post(`/web/v1/proxy/clauses/${clauseId}/coverages`, data)
}

/** 移除条款下的指定保险责任 */
export function removeCoverage(clauseId: string, coverageId: string): Promise<void> {
  return http.delete(`/web/v1/proxy/clauses/${clauseId}/coverages/${coverageId}`)
}
