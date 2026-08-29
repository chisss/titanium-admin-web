// 业务实体类型定义

/** 保险险种分类 */
export type InsuranceCategory = 'AUTO' | 'LIFE' | 'PET' | 'ACCIDENT' | 'HEALTH' | 'PROPERTY'

/** 产品状态（对齐产品域状态机 ProductEnum.ProductStatus：草稿→审核中→已生效→已下架，无独立"发布/上架"态） */
export type ProductStatus = 'DRAFT' | 'AUDITING' | 'EFFECTIVE' | 'INVALID'

/** 保单状态（含寿险生命周期全状态） */
export type PolicyStatus =
  | 'PROPOSAL'
  | 'PENDING'
  | 'PENDING_PAYMENT'
  | 'ACTIVE'
  | 'PENDING_EFFECTIVE'
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
  productNo?: string
  name: string
  code: string
  category: InsuranceCategory
  status: ProductStatus
  /** 二级险种（后端 InsuranceProductType 常量名，如 MEDICAL/WHOLE_LIFE） */
  insuranceType?: string
  /** 产品版本，用于定价包关联 */
  version?: string
  description?: string
  minPremium?: number
  maxCoverage?: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** 投保条件（详情展示） */
export interface InsureConditionView {
  minAge?: number
  maxAge?: number
  minGroupSize?: number
  maxGroupSize?: number
  minInsuredAmount?: number
  maxInsuredAmount?: number
  waitingPeriodDays?: number
  hesitationPeriodDays?: number
  healthNotice?: string
}

/** 定价基础规则（详情展示） */
export interface PricingBasicRuleView {
  pricingType?: string
  baseRate?: number
  minPremium?: number
  maxPremium?: number
}

/**
 * 产品详情视图：在列表 ProductVO 基础上补充后端 ProductResponse 返回的结构化配置，
 * 供详情页完整呈现产品形态、投保条件、费率规则等（列表页不消费这些字段，故独立扩展）。
 */
export interface ProductDetailVO extends ProductVO {
  /** 原始细分险种码（如 MEDICAL），用于展示补充 */
  insuranceType?: string
  /** 产品形态 GROUP/INDIVIDUAL */
  form?: string
  /** 产品类别 MAIN/RIDER */
  productCategory?: string
  /** 产品版本 */
  version?: string
  /** 所属模板ID */
  templateId?: string
  /** 定价模式 */
  pricingMode?: string
  /** 生效时间 */
  effectiveTime?: string
  /** 销售起止时间 */
  saleStartTime?: string
  saleEndTime?: string
  /** 投保条件 */
  insureCondition?: InsureConditionView
  /** 定价基础规则 */
  pricingBasicRule?: PricingBasicRuleView
}

/** 保单信息 */
export interface PolicyVO {
  policyId: string
  policyNo: string
  policyForm?: string
  productName: string
  productNo?: string
  productCode: string
  policyHolderId: string
  policyHolderName: string
  insuredId: string
  insuredName: string
  status: PolicyStatus
  premium: number
  sumInsured: number
  effectiveDate: string
  expiryDate: string
  createTime: string
  updateTime?: string
}

/** 客户信息 */
export interface CustomerVO {
  customerNo?: string
  customerId: string
  fullName: string
  customerType: string
  idType: string
  idNo: string
  gender?: string
  phoneNumber: string
  email?: string
  address?: string
  status: string
  createTime: string
  updateTime?: string
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
  /** 国家/地区代码（ISO 3166-1 alpha-2） */
  country?: string
  /** 默认语言（BCP 47 语言标签） */
  language?: string
  /** 默认币种（ISO 4217） */
  currency?: string
  /** 时区（IANA） */
  timezone?: string
  logo?: string
  themeColor?: string
  remark?: string
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
