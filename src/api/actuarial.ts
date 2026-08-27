import http from './http'

export type ActuarialStatus = 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'RETIRED'

export interface ChargeComponent {
  componentId: string
  productId: string
  componentCode: string
  componentVersion: string
  componentName: string
  description?: string
  category: string
  amountChannel: string
  direction: string
  payerType: string
  calculationSource: string
  accountingClass: string
  customerVisible: boolean
  effectiveFrom: string
  effectiveTo?: string
  status: ActuarialStatus
  contentHash?: string
}

export interface CalculationNode {
  nodeCode: string
  nodeName: string
  nodeType: 'INPUT' | 'COMPUTE' | 'OUTPUT'
  operator: 'STANDARD_PREMIUM' | 'FIXED_AMOUNT' | 'PERCENTAGE_OF' | 'SUM'
  componentCode?: string
  componentVersion?: string
  parameterValue?: number
  executionOrder: number
}

export interface CalculationEdge {
  fromNodeCode: string
  toNodeCode: string
}

export interface CalculationModel {
  modelId: string
  productId: string
  modelCode: string
  modelVersion: string
  modelName: string
  description?: string
  currency: string
  nodes: CalculationNode[]
  edges: CalculationEdge[]
  effectiveFrom: string
  effectiveTo?: string
  status: ActuarialStatus
  contentHash?: string
}

export interface ActuarialMaskingPolicy {
  maskInternalAmount: boolean
  maskInternalFields: boolean
}

export interface CalculationLine {
  lineId: string
  componentCode: string
  componentVersion: string
  category: string
  amountChannel: 'CUSTOMER_PRICE' | 'INTERNAL_COST'
  direction: string
  payerType: string
  accountingClass: string
  currency: string
  baseAmount?: number
  rate?: number
  calculatedAmount?: number
  nodeCode: string
  customerVisible: boolean
  description?: string
  affectsCustomerPayable?: boolean
  jurisdictionCode?: string
  regulatoryReferenceId?: string
  taxPriceMode?: 'EXCLUSIVE' | 'INCLUSIVE'
  taxPolicyHash?: string
  taxExempt?: boolean
}

export interface TaxPolicy {
  policyId: string
  productId: string
  policyCode: string
  policyVersion: string
  policyName: string
  description?: string
  jurisdictionCode: string
  category: 'TAX' | 'STAMP_DUTY' | 'REGULATORY_LEVY'
  payerType: 'POLICYHOLDER'
  priceMode: 'EXCLUSIVE' | 'INCLUSIVE'
  taxRate: number
  baseComponentCodes: string[]
  accountingClass: string
  regulatoryReferenceId: string
  exemptionFeatureCode?: string
  effectiveFrom: string
  effectiveTo?: string
  status: ActuarialStatus
  contentHash?: string
}

export interface DynamicFactor {
  factorId: string
  productId: string
  factorCode: string
  factorVersion: string
  factorName: string
  description?: string
  featureCode: string
  featureDefinitionVersion: string
  sourceType: 'REQUEST' | 'DOMAIN_API' | 'DERIVED' | 'EXTERNAL_REALTIME'
  valueTimePolicy: 'REQUEST_TIME' | 'BUSINESS_TIME' | 'OBSERVED_AT'
  lowerBound?: number
  upperBound?: number
  missingPolicy: 'REJECT' | 'USE_DEFAULT' | 'SKIP'
  defaultValue?: number
  transformType: 'IDENTITY' | 'LINEAR'
  multiplier: number
  offset: number
  replayable: boolean
  effectiveFrom: string
  effectiveTo?: string
  status: ActuarialStatus
  contentHash?: string
}

export interface PremiumCalculation {
  calculationId: string
  calculationRequestId: string
  bizNo: string
  status: string
  productId: string
  currency: string
  totalPremium: number
  calculationTotals: {
    premiumSubtotal: number
    taxAndLevyTotal: number
    customerPayable: number
    internalCostTotal?: number
  }
  calculationLines: CalculationLine[]
  pricingPlanVersion: string
  pricingPlanContentHash: string
  calculationModelCode?: string
  calculationModelVersion?: string
  calculationModelHash?: string
}

const base = (productId: string) => `/web/v1/proxy/products/${productId}/actuarial`

export const listChargeComponents = (productId: string, status?: string) =>
  http.get<unknown, ChargeComponent[]>(`${base(productId)}/charge-components`, { params: { status } })

export const getChargeComponent = (productId: string, componentId: string) =>
  http.get<unknown, ChargeComponent>(`${base(productId)}/charge-components/${componentId}`)

export const createChargeComponent = (productId: string, body: Record<string, unknown>) =>
  http.post<unknown, string>(`${base(productId)}/charge-components`, body)

export const approveChargeComponent = (productId: string, componentId: string) =>
  http.post<unknown, string>(`${base(productId)}/charge-components/${componentId}/approve`)

export const publishChargeComponent = (productId: string, componentId: string) =>
  http.post(`${base(productId)}/charge-components/${componentId}/publish`)

export const retireChargeComponent = (productId: string, componentId: string) =>
  http.post(`${base(productId)}/charge-components/${componentId}/retire`)

export const listCalculationModels = (productId: string, status?: string) =>
  http.get<unknown, CalculationModel[]>(`${base(productId)}/calculation-models`, { params: { status } })

export const getCalculationModel = (productId: string, modelId: string) =>
  http.get<unknown, CalculationModel>(`${base(productId)}/calculation-models/${modelId}`)

export const createCalculationModel = (productId: string, body: Record<string, unknown>) =>
  http.post<unknown, string>(`${base(productId)}/calculation-models`, body)

export const approveCalculationModel = (productId: string, modelId: string) =>
  http.post<unknown, string>(`${base(productId)}/calculation-models/${modelId}/approve`)

export const publishCalculationModel = (productId: string, modelId: string) =>
  http.post(`${base(productId)}/calculation-models/${modelId}/publish`)

export const retireCalculationModel = (productId: string, modelId: string) =>
  http.post(`${base(productId)}/calculation-models/${modelId}/retire`)

export const listTaxPolicies = (productId: string, status?: string) =>
  http.get<unknown, TaxPolicy[]>(`${base(productId)}/tax-policies`, { params: { status } })

export const getTaxPolicy = (productId: string, policyId: string) =>
  http.get<unknown, TaxPolicy>(`${base(productId)}/tax-policies/${policyId}`)

export const createTaxPolicy = (productId: string, body: Record<string, unknown>) =>
  http.post<unknown, string>(`${base(productId)}/tax-policies`, body)

export const approveTaxPolicy = (productId: string, policyId: string) =>
  http.post<unknown, string>(`${base(productId)}/tax-policies/${policyId}/approve`)

export const publishTaxPolicy = (productId: string, policyId: string) =>
  http.post(`${base(productId)}/tax-policies/${policyId}/publish`)

export const retireTaxPolicy = (productId: string, policyId: string) =>
  http.post(`${base(productId)}/tax-policies/${policyId}/retire`)

export const listDynamicFactors = (productId: string, status?: string) =>
  http.get<unknown, DynamicFactor[]>(`${base(productId)}/dynamic-factors`, { params: { status } })

export const getDynamicFactor = (productId: string, factorId: string) =>
  http.get<unknown, DynamicFactor>(`${base(productId)}/dynamic-factors/${factorId}`)

export const createDynamicFactor = (productId: string, body: Record<string, unknown>) =>
  http.post<unknown, string>(`${base(productId)}/dynamic-factors`, body)

export const approveDynamicFactor = (productId: string, factorId: string) =>
  http.post<unknown, string>(`${base(productId)}/dynamic-factors/${factorId}/approve`)

export const publishDynamicFactor = (productId: string, factorId: string) =>
  http.post(`${base(productId)}/dynamic-factors/${factorId}/publish`)

export const retireDynamicFactor = (productId: string, factorId: string) =>
  http.post(`${base(productId)}/dynamic-factors/${factorId}/retire`)

export const getActuarialMaskingPolicy = () =>
  http.get<unknown, ActuarialMaskingPolicy>('/web/v1/proxy/actuarial/display-policy')

export const updateActuarialMaskingPolicy = (body: ActuarialMaskingPolicy) =>
  http.put<unknown, ActuarialMaskingPolicy>('/web/v1/proxy/actuarial/display-policy', body)

export const getPremiumCalculation = (calculationId: string) =>
  http.get<unknown, PremiumCalculation>(`/web/v1/proxy/actuarial/premium-calculations/${calculationId}`)
