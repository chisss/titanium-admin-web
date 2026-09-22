// 业务实体类型定义

/** 保险险种分类 */
export type InsuranceCategory = 'AUTO' | 'LIFE' | 'PET' | 'ACCIDENT' | 'HEALTH' | 'PROPERTY'

/** 产品状态（对齐产品域状态机 ProductEnum.ProductStatus：草稿→审核中→已生效→已下架，无独立"发布/上架"态） */
export type ProductStatus = 'DRAFT' | 'AUDITING' | 'EFFECTIVE' | 'INVALID'

/** 保单状态（含寿险生命周期全状态） */
/**
 * 保单状态码 —— 与**读侧** `PolicyEnum.PolicyStatus` 枚举**逐一对应**（7 个）。
 *
 * 🔴 2026-09-21 二次收敛：前一轮把真源认成了**写侧** `PolicyStatusCode`，于是这里写着
 * `NOT_EFFECTIVE` —— 而 `PolicyVO.status` 来自查询侧投影，写侧码在投影时已被映射为读侧码
 * （`NOT_EFFECTIVE` → `PENDING_EFFECTIVE`，见 `PolicyProjectionEventHandler.java:284-292`），
 * 读侧数据里根本没有 `NOT_EFFECTIVE`。直接后果：保单详情页「撤销保单」判 `NOT_EFFECTIVE`
 * ⇒ 该功能全站不可达（详见 `constants/policy.ts` 的 cancel 条目）。
 * 类型域必须与**实际流通的**值域一致，否则类型检查对这类缺陷完全无感——幻码在编译期是合法字符串。
 */
export type PolicyStatus =
  | 'PENDING_EFFECTIVE'
  | 'EFFECTIVE'
  | 'SUSPENDED'
  | 'TERMINATED'
  | 'EXPIRED'
  | 'LAPSED'
  | 'CANCELLED'

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

/** 核保配置（详情展示，对齐后端 UnderwritingConfigResponse） */
export interface UnderwritingConfigView {
  /** 核保模式 AUTO/MANUAL/SMART/HYBRID */
  underwritingMode?: string
  /** 自动核保通过条件描述 */
  autoApprovalCondition?: string
  /** 转人工核保的保额阈值 */
  manualReviewAmountThreshold?: number
  /** 核保必需材料清单 */
  requiredDocuments?: string[]
  /** 核保时效要求（天） */
  underwritingSLADays?: number
  /** 是否支持加费承保 */
  surchargeAcceptable?: boolean
  /** 是否支持特别约定 */
  specialAgreementAcceptable?: boolean
  /** 关联的规则引擎规则集编码（为空表示未接入规则引擎） */
  ruleSetCode?: string
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
  /** 核保配置（产品级核保策略与规则集绑定） */
  underwritingConfig?: UnderwritingConfigView
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
  /**
   * 总保费（各险种段保费之和）。
   * 🔴 与上面的 `premium`（年缴保费）**不同口径**，二者不可互相替代：
   * `premium` 是年缴口径、`totalPremium` 是整单保费合计。分期缴费的保单两者可以不等。
   */
  totalPremium?: number
  /** 险种段数量 */
  lineCount?: number
  /** 收费方式（policy 域 `PremiumCollectionMode`：OFFLINE/ONLINE/FREE/PAY_AFTER_USE/WITHHOLD） */
  collectionMode?: string
  /**
   * 保费收讫状态（policy 域 `PremiumCollectionStatus`：UNCOLLECTED/PARTIALLY_COLLECTED/COLLECTED/DEFERRED/OVERDUE）。
   * 🔴 **不是** billing 域的单笔缴费流水状态（PAID/PENDING/FAILED）——同名不同义，
   * 库中 `PAYMENT_COLLECTION_STATUS` 字典与真实数据只有 `PENDING` 一个值重合，误用会裸显英文码。
   */
  collectionStatus?: string
  /** 已收讫金额（对应 `totalPremium` 口径的实收数） */
  collectedAmount?: number
  /** 销售渠道（走 `SALES_CHANNEL` 字典，与意向单页同源） */
  salesChannel?: string
  /** 等待期止期 */
  waitingPeriodEndDate?: string
  /** 犹豫期止期 */
  hesitationPeriodEndDate?: string
  /** 意向单 ID（后端 PolicyDetailVO 已返回，用于「保单 → 意向单」跳转；🔴 投保单 ID 后端不返回） */
  proposalId?: string
  /** 核保单 ID（后端 PolicyDetailVO 已返回，用于「保单 → 核保单」跳转） */
  underwritingId?: string
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
  /** 请求地址（后端字段 requestUrl，用于溯源具体接口） */
  requestUrl?: string
  requestIp: string
  status: 'SUCCESS' | 'FAIL'
  duration: number
  createdAt: string
}
