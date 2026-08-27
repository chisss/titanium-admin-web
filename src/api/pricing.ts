import http from './http'

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
  http.post<unknown, Record<string, unknown>>(`/web/v1/proxy/products/${productId}/pricing-plans/${planId}/test-cases:run`)

export const publishPricingPlan = (productId: string, planId: string) =>
  http.post<unknown, Record<string, unknown>>(`/web/v1/proxy/products/${productId}/pricing-plans/${planId}/publish`)

export const retirePricingPlan = (productId: string, planId: string) =>
  http.post(`/web/v1/proxy/products/${productId}/pricing-plans/${planId}/retire`)
