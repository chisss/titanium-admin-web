import http from './http'

/**
 * 费率行。
 *
 * 🔴 `dimensionHash` 是后端算好的**业务维度键**（维度字段的组合摘要，见下游 `RateTableRowVO`），
 * 版本对比必须以它为匹配键：它正是为「同一维度组合」而存在的。
 * 用 `rowId` 匹配会在两个版本间全部落空（rowId 逐版本重生成）⇒ 每一行都被报成「新增 + 删除」，
 * 差异报告被噪声淹没，与「没有对比功能」等价。
 */
export interface RateTableRow {
  rowId?: string
  ageFrom?: number
  ageToExclusive?: number
  gender?: string
  paymentTermYears?: number
  coverageTermYears?: number
  rate: number
  minimumPremium?: number
  maximumPremium?: number
  /** 职业类别（RATE_DIMENSION 的可选维度之一） */
  occupationClass?: string
  /** 地区 */
  region?: string
  /** 车型 */
  vehicleType?: string
  /** 业务维度键（维度字段的组合摘要，由后端计算） */
  dimensionHash?: string
}

export interface RateTable {
  tableId: string
  productId: string
  tableCode: string
  tableVersion: string
  status: string
  rateUnit: string
  currency: string
  effectiveFrom: string
  effectiveTo?: string
  dimensionKeys: string[]
  rowCount: number
  contentHash?: string
  rows: RateTableRow[]
}

export interface PricingPlan {
  planId: string
  productId: string
  productVersion: string
  planVersion: string
  pricingMode: string
  status: string
  currency: string
  effectiveFrom: string
  effectiveTo?: string
  rateTableCode?: string
  rateTableVersion?: string
  artifactCode?: string
  artifactVersion?: string
  inputSchemaVersion?: string
  artifactHash?: string
  calculationModelCode?: string
  calculationModelVersion?: string
  calculationModelHash?: string
  roundingScale: number
  roundingMode: string
  contentHash?: string
  testCases: PricingTestCase[]
  taxPolicyRefs: TaxPolicyRef[]
  commissionSchemeRefs: CommissionSchemeRef[]
  dynamicFactorRefs: DynamicFactorRef[]
}

export interface DynamicFactorRef {
  factorCode: string
  factorVersion: string
  contentHash: string
}

/** 定价包固定引用的 Channel 已发布佣金方案。 */
export interface CommissionSchemeRef {
  channelId: string
  schemeCode: string
  schemeVersion: string
  contentHash: string
}

/** 定价包固定引用的已发布税费策略版本及内容哈希。 */
export interface TaxPolicyRef {
  policyCode: string
  policyVersion: string
  contentHash: string
}

export interface PricingTestCase {
  caseId?: string
  caseCode: string
  description?: string
  businessTime: string
  sumInsured: number
  age: number
  gender: string
  paymentTermYears: number
  coverageTermYears: number
  paymentPeriods: number
  requestSnapshot?: Record<string, unknown> & { channelId?: string; policyYear?: number }
  expectedPremium: number
  tolerance?: number
}

/**
 * 单条试算用例的门禁结果。
 * <p>🔴 D-501-37：后端 `PricingTestCaseResultVO` 一直完整返回 6 个字段，此前前端接口标注为
 * `Record<string, unknown>` 且只取两个计数 ⇒ 明细整包丢弃，用户面对「0/2 通过」无处可查。</p>
 */
export interface PricingTestCaseResult {
  caseCode: string
  passed: boolean
  expectedPremium: number | null
  actualPremium: number | null
  difference: number | null
  /** 失败原因：稳定错误码（如 `60000104`）或可读文案；通过时为 null */
  failureReason: string | null
}

/** 定价包发布门禁结果（`test-cases:run` 出参，对应后端 `PricingPlanValidationVO`） */
export interface PricingPlanValidation {
  planContentHash: string
  totalCases: number
  passedCases: number
  caseResults: PricingTestCaseResult[]
}

export const listRateTables = (productId: string, status?: string) =>
  http.get<unknown, RateTable[]>(`/web/v1/proxy/products/${productId}/rate-tables`, { params: { status } })

export const getRateTable = (productId: string, tableId: string) =>
  http.get<unknown, RateTable>(`/web/v1/proxy/products/${productId}/rate-tables/${tableId}`)

export const createRateTable = (productId: string, body: Record<string, unknown>) =>
  http.post<unknown, string>(`/web/v1/proxy/products/${productId}/rate-tables`, body)

export const replaceRateTableRows = (productId: string, tableId: string, rows: RateTableRow[]) =>
  http.put(`/web/v1/proxy/products/${productId}/rate-tables/${tableId}/rows`, { rows })

export const validateRateTable = (productId: string, tableId: string) =>
  http.post<unknown, Record<string, unknown>>(`/web/v1/proxy/products/${productId}/rate-tables/${tableId}/validate`)

export const publishRateTable = (productId: string, tableId: string) =>
  http.post<unknown, Record<string, unknown>>(`/web/v1/proxy/products/${productId}/rate-tables/${tableId}/publish`)

export const retireRateTable = (productId: string, tableId: string) =>
  http.post(`/web/v1/proxy/products/${productId}/rate-tables/${tableId}/retire`)

export const listPricingPlans = (productId: string, status?: string) =>
  http.get<unknown, PricingPlan[]>(`/web/v1/proxy/products/${productId}/pricing-plans`, { params: { status } })

export const getPricingPlan = (productId: string, planId: string) =>
  http.get<unknown, PricingPlan>(`/web/v1/proxy/products/${productId}/pricing-plans/${planId}`)

export const createPricingPlan = (productId: string, body: Record<string, unknown>) =>
  http.post<unknown, string>(`/web/v1/proxy/products/${productId}/pricing-plans`, body)

export const replacePricingTestCases = (productId: string, planId: string, testCases: PricingTestCase[]) =>
  http.put(`/web/v1/proxy/products/${productId}/pricing-plans/${planId}/test-cases`, { testCases })

export const approvePricingPlan = (productId: string, planId: string) =>
  http.post<unknown, string>(`/web/v1/proxy/products/${productId}/pricing-plans/${planId}/approve`)

export const runPricingTests = (productId: string, planId: string) =>
  http.post<unknown, PricingPlanValidation>(`/web/v1/proxy/products/${productId}/pricing-plans/${planId}/test-cases:run`)

export const publishPricingPlan = (productId: string, planId: string) =>
  http.post<unknown, Record<string, unknown>>(`/web/v1/proxy/products/${productId}/pricing-plans/${planId}/publish`)

export const retirePricingPlan = (productId: string, planId: string) =>
  http.post(`/web/v1/proxy/products/${productId}/pricing-plans/${planId}/retire`)
