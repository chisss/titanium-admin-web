// 业务实体类型定义

/** 保险险种分类 */
export type InsuranceCategory = 'AUTO' | 'LIFE' | 'PET' | 'ACCIDENT' | 'HEALTH' | 'PROPERTY'

/** 产品状态 */
export type ProductStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'INACTIVE'

/** 保单状态（含寿险生命周期全状态） */
export type PolicyStatus =
  | 'PROPOSAL'
  | 'PENDING'
  | 'PENDING_PAYMENT'
  | 'ACTIVE'
  | 'EFFECTIVE'
  | 'SUSPENDED'
  | 'LAPSED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'TERMINATED'

/** 理赔状态 */
export type ClaimStatus = 'REPORTED' | 'INVESTIGATING' | 'APPROVING' | 'SETTLED' | 'REJECTED'

/** 保全工单状态 */
export type MaintenanceStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED'

/** 核保状态 */
export type UnderwritingStatus = 'PENDING' | 'AUTO_REVIEWING' | 'MANUAL_REVIEWING' | 'APPROVED' | 'DECLINED'

/** 产品信息 */
export interface ProductVO {
  id: string
  name: string
  code: string
  category: InsuranceCategory
  status: ProductStatus
  description?: string
  minPremium?: number
  maxCoverage?: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** 保单信息 */
export interface PolicyVO {
  id: string
  policyNo: string
  proposalNo?: string
  productName: string
  productCode: string
  holderName: string
  holderIdNo: string
  holderMobile: string
  insuredName: string
  status: PolicyStatus
  premium: number
  sumInsured: number
  effectiveDate: string
  expiryDate: string
  channel: string
  tenantId: string
  createdAt: string
}

/** 客户信息 */
export interface CustomerVO {
  id: string
  name: string
  idType: string
  idNo: string
  mobile: string
  email?: string
  gender?: string
  birthday?: string
  tenantId: string
  createdAt: string
}

/** 字典类型 */
export interface DictType {
  id: string
  code: string
  name: string
  description?: string
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
}

/** 字典数据 */
export interface DictData {
  id: string
  dictTypeId: string
  dictTypeCode: string
  value: string
  label: string
  i18nLabels?: Record<string, string>
  sort: number
  status: 'ACTIVE' | 'INACTIVE'
  remark?: string
  /** 扩展属性（如 color: 'success'|'warning' 等） */
  extra?: Record<string, string>
}

/** 租户信息 */
export interface TenantVO {
  id: string
  code: string
  name: string
  contactName: string
  contactMobile: string
  contactEmail?: string
  status: 'ACTIVE' | 'INACTIVE' | 'TRIAL'
  expireAt?: string
  createdAt: string
}

/** 操作日志 */
export interface OperationLog {
  id: string
  userId: string
  username: string
  module: string
  action: string
  targetId?: string
  requestIp: string
  status: 'SUCCESS' | 'FAIL'
  message?: string
  duration: number
  createdAt: string
}
