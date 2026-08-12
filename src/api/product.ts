// 产品相关接口
import http from './http'
import type { ProductVO, ProductDetailVO } from '@/types/business.d'
import type { PageParams, PageResult } from '@/types/api.d'

/**
 * 前端险种分类字典(INSURANCE_CATEGORY: LIFE/HEALTH/ACCIDENT/PROPERTY) → 后端两套险种枚举的映射。
 * - 模板侧 InsuranceType（LIFE/MEDICAL/ACCIDENT/PROPERTY...）：按险种大类归一
 * - 产品侧 InsuranceProductType（细分险种，如 WHOLE_LIFE/MEDICAL/ACCIDENT_COMPREHENSIVE...）：取该大类代表性细分类型
 * 后端按枚举「常量名」反序列化，故必须落到合法常量名。
 */
const CATEGORY_TO_TEMPLATE_TYPE: Record<string, string> = {
  LIFE: 'LIFE',
  HEALTH: 'MEDICAL',
  ACCIDENT: 'ACCIDENT',
  PROPERTY: 'PROPERTY',
}
const CATEGORY_TO_PRODUCT_TYPE: Record<string, string> = {
  LIFE: 'WHOLE_LIFE',
  HEALTH: 'MEDICAL',
  ACCIDENT: 'ACCIDENT_COMPREHENSIVE',
  PROPERTY: 'HOUSEHOLD_PROPERTY',
}

/**
 * 产品侧 InsuranceProductType（细分险种常量名）→ 前端险种分类字典值（LIFE/HEALTH/ACCIDENT/PROPERTY）。
 * 后端返回细分类型（如 MEDICAL/WHOLE_LIFE），列表页按大类展示，故按常量名前缀归并到四大类。
 * 未命中前缀时原样返回，保证展示不丢值。
 */
function toCategoryFromProductType(insuranceType?: string): string | undefined {
  if (!insuranceType) return undefined
  const t = insuranceType.toUpperCase()
  if (t.includes('LIFE') || t === 'ENDOWMENT' || t === 'ANNUITY') return 'LIFE'
  if (['MEDICAL', 'CRITICAL_ILLNESS', 'DISABILITY_INCOME', 'LONG_TERM_CARE'].includes(t)) return 'HEALTH'
  if (t.includes('ACCIDENT')) return 'ACCIDENT'
  if (['AUTO', 'HOUSEHOLD_PROPERTY', 'ENTERPRISE_PROPERTY', 'AGRICULTURAL', 'MARINE_CARGO'].includes(t)) return 'PROPERTY'
  return insuranceType
}

/** 前端险种分类 → 模板险种类型（by-type 查询用） */
export function toTemplateInsuranceType(category?: string): string | undefined {
  if (!category) return undefined
  return CATEGORY_TO_TEMPLATE_TYPE[category] ?? category
}

/** 前端险种分类 → 产品险种类型（创建产品命令用） */
export function toProductInsuranceType(category?: string): string | undefined {
  if (!category) return undefined
  return CATEGORY_TO_PRODUCT_TYPE[category] ?? category
}

/**
 * 后端产品读模型（ProductResponse）→ 前端视图模型 ProductVO（字段名/险种分类/最低保费对齐）。
 * 后端返回 productName/productCode/insuranceType，且 category 表产品类别(MAIN/RIDER) 而非险种分类，
 * minPremium 嵌套在 pricingBasicRule 内；列表页按 name/code/category/minPremium 消费，此处做防腐转换。
 */
function fromProductVO(vo: Record<string, any>): ProductVO {
  return {
    id: vo.productId ?? vo.id,
    name: vo.productName ?? vo.name ?? '',
    code: vo.productCode ?? vo.code ?? '',
    category: (toCategoryFromProductType(vo.insuranceType) ?? '') as ProductVO['category'],
    insuranceType: vo.insuranceType,
    status: vo.status,
    description: vo.productDesc ?? vo.description,
    minPremium: vo.minPremium ?? vo.pricingBasicRule?.minPremium,
    maxCoverage: vo.maxCoverage ?? vo.pricingBasicRule?.maxPremium,
    createdBy: vo.createdBy ?? '',
    createdAt: vo.createdAt,
    updatedAt: vo.updatedAt,
  }
}

/** 查询产品列表 */
export async function getProductList(
  params?: Partial<PageParams> & Record<string, unknown>,
): Promise<PageResult<ProductVO>> {
  const res = await http.get<unknown, PageResult<Record<string, any>>>('/web/v1/proxy/products', { params })
  return { ...res, list: (res.list ?? []).map(fromProductVO) }
}

/**
 * 后端产品详情读模型 → 前端详情视图 ProductDetailVO。
 * 在列表映射基础上补充结构化配置（形态/版本/投保条件/费率规则等），供详情页完整呈现。
 */
function fromProductDetailVO(vo: Record<string, any>): ProductDetailVO {
  const base = fromProductVO(vo)
  const ic = vo.insureCondition ?? {}
  const pr = vo.pricingBasicRule ?? {}
  return {
    ...base,
    insuranceType: vo.insuranceType,
    form: vo.form,
    productCategory: vo.category,
    version: vo.version,
    templateId: vo.templateId,
    pricingMode: vo.pricingMode,
    effectiveTime: vo.effectiveTime,
    saleStartTime: vo.saleStartTime,
    saleEndTime: vo.saleEndTime,
    insureCondition: {
      minAge: ic.minAge,
      maxAge: ic.maxAge,
      minGroupSize: ic.minGroupSize,
      maxGroupSize: ic.maxGroupSize,
      minInsuredAmount: ic.minInsuredAmount,
      maxInsuredAmount: ic.maxInsuredAmount,
      waitingPeriodDays: ic.waitingPeriodDays,
      hesitationPeriodDays: ic.hesitationPeriodDays,
      healthNotice: ic.healthNotice,
    },
    pricingBasicRule: {
      pricingType: pr.pricingType,
      baseRate: pr.baseRate,
      minPremium: pr.minPremium,
      maxPremium: pr.maxPremium,
    },
  }
}

/** 获取产品详情 */
export async function getProductDetail(id: string): Promise<ProductDetailVO> {
  const vo = await http.get<unknown, Record<string, any>>(`/web/v1/proxy/products/${id}`)
  return fromProductDetailVO(vo)
}

/** 产品绑定的条款关联（前端视图模型，对齐后端 ProductClauseQueryResult） */
export interface ProductClauseRelVO {
  clauseId: string
  clauseVersion?: string
  /** 是否主条款（后端字段 mainClause） */
  mainClause?: boolean
  bindTime?: string
}

/**
 * 查询产品绑定的条款清单。
 * 后端返回条款关联（clauseId/clauseVersion/mainClause），主条款优先展示；
 * 详情页据 clauseId 再取条款详情与保障责任，按电子保单形态呈现。
 */
export async function getProductClauses(id: string): Promise<ProductClauseRelVO[]> {
  const list = await http.get<unknown, Record<string, any>[]>(`/web/v1/proxy/products/${id}/clauses`)
  return (list ?? []).map((vo) => ({
    clauseId: vo.clauseId,
    clauseVersion: vo.clauseVersion,
    mainClause: vo.mainClause ?? vo.isMainClause,
    bindTime: vo.bindTime,
  }))
}

// ==================== 产品创建（完整配置载荷） ====================

/** 投保条件（前端表单模型，对齐后端 InsureConditionDTO） */
export interface InsureConditionForm {
  minAge?: number
  maxAge?: number
  minGroupSize?: number
  maxGroupSize?: number
  healthNotice?: string
}

/** 定价基础规则（前端表单模型，对齐后端 PricingBasicRuleDTO） */
export interface PricingBasicRuleForm {
  /** 定价类型：FIXED 固定费率 / STEP 阶梯费率 / FACTOR 因子定价 */
  pricingType?: 'FIXED' | 'STEP' | 'FACTOR'
  baseRate?: number
  minPremium?: number
  maxPremium?: number
  rateTableId?: string
}

/** 所需投保材料（对齐后端 DocumentConfig.RequiredMaterial） */
export interface RequiredMaterialForm {
  materialCode?: string
  materialName?: string
  mandatory?: boolean
  acceptedFormats?: string[]
  description?: string
}

/** 生成文档模板（对齐后端 DocumentConfig.DocumentTemplate） */
export interface DocumentTemplateForm {
  /** 文档类型 APPLICATION_FORM/POLICY/HEALTH_NOTICE/CLAIM_MATERIAL_LIST 等 */
  documentType?: string
  templateCode?: string
  templateName?: string
  /** 输出格式 PDF/JPG/PNG 等 */
  outputFormat?: string
  autoGenerate?: boolean
  description?: string
}

/** 产品文档配置（对齐后端 DocumentConfig：所需材料清单 + 生成文档模板清单） */
export interface DocumentConfigForm {
  requiredMaterials?: RequiredMaterialForm[]
  documentTemplates?: DocumentTemplateForm[]
}

/** 新建产品的完整前端模型（分步向导聚合各步表单结果） */
export interface CreateProductForm {
  /** 基本信息 */
  productName: string
  productCode: string
  /** 前端险种分类字典值（LIFE/HEALTH/ACCIDENT/PROPERTY），一级大类 */
  category?: string
  /** 二级险种（后端 InsuranceProductType 常量名，如 MEDICAL/WHOLE_LIFE） */
  insuranceType?: string
  /** 产品形态 GROUP/INDIVIDUAL */
  form?: 'GROUP' | 'INDIVIDUAL'
  /** 产品类别 MAIN/RIDER */
  productCategory?: 'MAIN' | 'RIDER'
  productDesc?: string
  /** 创建人（登录用户显示名，后端落库为 createdBy） */
  createdBy?: string

  /** 险种配置 */
  templateId?: string
  clauseIds: string[]
  mainClauseId?: string
  /** 投保条件（向导始终初始化，故非可选） */
  insureCondition: InsureConditionForm

  /** 费率规则（向导始终初始化，故非可选） */
  pricingBasicRule: PricingBasicRuleForm
  /** 定价模式 RATE_TABLE/ACTUARIAL_FORMULA */
  pricingMode?: 'RATE_TABLE' | 'ACTUARIAL_FORMULA'
  /** 文档配置（所需投保材料 + 生成文档模板，纯产品配置） */
  documentConfig?: DocumentConfigForm
}

/**
 * 前端产品表单 → 后端 CreateProductDTO 载荷（字段名 + 枚举对齐契约）。
 * 后端硬校验：productName / productCode / templateId 非空、clauseIds ≥1、insureCondition 非空。
 */
function toCreateProductPayload(form: CreateProductForm): Record<string, unknown> {
  return {
    templateId: form.templateId,
    productCode: form.productCode,
    productName: form.productName,
    productDesc: form.productDesc,
    form: form.form ?? 'INDIVIDUAL',
    // 优先用用户所选二级险种；缺失时回退按一级大类取代表性细分类型（向后兼容）
    insuranceType: form.insuranceType ?? toProductInsuranceType(form.category),
    category: form.productCategory ?? 'MAIN',
    createdBy: form.createdBy,
    insureCondition: form.insureCondition
      ? {
          minAge: form.insureCondition.minAge,
          maxAge: form.insureCondition.maxAge,
          minGroupSize: form.insureCondition.minGroupSize,
          maxGroupSize: form.insureCondition.maxGroupSize,
          healthNotice: form.insureCondition.healthNotice,
        }
      : {},
    pricingBasicRule: form.pricingBasicRule
      ? {
          pricingType: form.pricingBasicRule.pricingType,
          baseRate: form.pricingBasicRule.baseRate,
          minPremium: form.pricingBasicRule.minPremium,
          maxPremium: form.pricingBasicRule.maxPremium,
          rateTableId: form.pricingBasicRule.rateTableId,
        }
      : undefined,
    clauseIds: form.clauseIds ?? [],
    mainClauseId: form.mainClauseId,
    pricingMode: form.pricingMode,
    // 文档配置：仅在配置了材料或模板时下发，避免空清单覆盖
    documentConfig:
      form.documentConfig &&
      ((form.documentConfig.requiredMaterials?.length ?? 0) > 0 ||
        (form.documentConfig.documentTemplates?.length ?? 0) > 0)
        ? {
            requiredMaterials: form.documentConfig.requiredMaterials ?? [],
            documentTemplates: form.documentConfig.documentTemplates ?? [],
          }
        : undefined,
  }
}

/** 新建产品 */
export function createProduct(form: CreateProductForm): Promise<string> {
  return http.post('/web/v1/proxy/products', toCreateProductPayload(form))
}

/** 更新产品 */
export function updateProduct(id: string, data: Partial<ProductVO>): Promise<void> {
  return http.put(`/web/v1/proxy/products/${id}`, data)
}

/** 产品审核动作入参（BFF `/approve`、`/reject` 需 AuditProductDTO body） */
export interface ProductAuditPayload {
  auditResult: 'PASS' | 'REJECT' | 'RETURN'
  auditOpinion?: string
  auditorId?: string
  auditorName?: string
}

/**
 * 审核通过产品（后端 BFF PUT /{id}/approve → 下游 /audit）。
 * 产品域无独立"上架/发布"态，审核通过即 AUDITING→EFFECTIVE（生效可售）。
 */
export function approveProduct(id: string, payload: ProductAuditPayload): Promise<void> {
  return http.put(`/web/v1/proxy/products/${id}/approve`, payload)
}

/** 驳回产品审核（后端 BFF PUT /{id}/reject → 下游 /reject，AUDITING→DRAFT） */
export function rejectProduct(id: string, payload: ProductAuditPayload): Promise<void> {
  return http.put(`/web/v1/proxy/products/${id}/reject`, payload)
}

/** 产品下架（后端 BFF PUT /{id}/unpublish → 下游 /invalid，EFFECTIVE→INVALID） */
export function deactivateProduct(id: string): Promise<void> {
  return http.put(`/web/v1/proxy/products/${id}/unpublish`)
}

/** 提交审核（后端 BFF PUT /{id}/submit → 下游 /submit-audit，DRAFT→AUDITING） */
export function submitProductForReview(id: string): Promise<void> {
  return http.put(`/web/v1/proxy/products/${id}/submit`)
}

/** 导出产品列表 */
export function exportProducts(params?: Record<string, unknown>): Promise<Blob> {
  return http.get('/web/v1/proxy/products/export', { params, responseType: 'blob' })
}

// ==================== 产品模板（产品工厂） ====================

/** 保全配置（对齐后端 MaintenanceConfig） */
export interface MaintenanceConfigForm {
  allowedTypes?: string[]
  freeLookPeriodDays?: number
  surrenderRuleSet?: string
  endorsementRuleSet?: string
}

/** 理赔配置（对齐后端 ClaimConfig） */
export interface ClaimConfigForm {
  claimStages?: string[]
  reportDeadlineDays?: number
  waitingPeriodDays?: number
  claimRuleSet?: string
  requiredDocuments?: string[]
}

/** 缴费配置（对齐后端 BillingConfig） */
export interface BillingConfigForm {
  allowedPaymentModes?: string[]
  gracePeriodDays?: number
  lapseAfterDays?: number
  autoDeductEnabled?: boolean
}

/** 再保险配置（对齐后端 ReinsuranceConfig） */
export interface ReinsuranceConfigForm {
  autoReinsurance?: boolean
  retentionLimit?: number
  defaultContractCode?: string
}

/** 分红配置（分红险专属，对齐后端 DividendConfig + ProductEnum.DividendDistribution 常量名） */
export interface DividendConfigForm {
  /** 红利分配方式 CASH 现金红利 / ACCUMULATION 累积生息 / PAID_UP_ADDITION 购买交清增额 / PREMIUM_OFFSET 抵缴保费 */
  distribution?: 'CASH' | 'ACCUMULATION' | 'PAID_UP_ADDITION' | 'PREMIUM_OFFSET'
  lowDemoRate?: number
  midDemoRate?: number
  highDemoRate?: number
}

/** 寿险产品规格（寿险专属，对齐后端 LifeProductSpec） */
export interface LifeProductSpecVO {
  productType?: string
  entryAgeRange?: { minAge?: number; maxAge?: number }
  sumInsuredRange?: { minSumInsured?: number; maxSumInsured?: number }
  premiumTermOptions?: { years?: number; toAge?: number; description?: string }[]
  coverageTermOptions?: { years?: number; toAge?: number; wholeLife?: boolean; description?: string }[]
}

/** 产品模板（前端视图模型，对齐后端 ProductTemplateResponse 关注字段） */
export interface ProductTemplateVO {
  templateId: string
  templateCode: string
  templateName: string
  insuranceType?: string
  issuanceMode?: string
  status?: 'ACTIVE' | 'INACTIVE'
  maintenanceConfig?: MaintenanceConfigForm
  claimConfig?: ClaimConfigForm
  billingConfig?: BillingConfigForm
  reinsuranceConfig?: ReinsuranceConfigForm
  dividendConfig?: DividendConfigForm
  lifeProductSpec?: LifeProductSpecVO
}

/** 更新产品模板行为配置载荷（对齐后端 UpdateProductTemplateDTO，仅传需变更项） */
export interface UpdateTemplateForm {
  templateName?: string
  issuanceMode?: string
  maintenanceConfig?: MaintenanceConfigForm
  claimConfig?: ClaimConfigForm
  billingConfig?: BillingConfigForm
  reinsuranceConfig?: ReinsuranceConfigForm
  dividendConfig?: DividendConfigForm
}

/** 按险种类型查询产品模板列表（入参为模板侧 InsuranceType 常量名） */
export function getTemplatesByType(insuranceTypeCode: string): Promise<ProductTemplateVO[]> {
  return http.get(`/web/v1/proxy/products/templates/by-type/${insuranceTypeCode}`)
}

/** 按前端险种分类查询可用模板（内部转模板险种类型） */
export function getTemplatesByCategory(category: string): Promise<ProductTemplateVO[]> {
  const type = toTemplateInsuranceType(category)
  if (!type) return Promise.resolve([])
  return getTemplatesByType(type)
}

/** 查询产品模板详情 */
export function getTemplate(templateId: string): Promise<ProductTemplateVO> {
  return http.get(`/web/v1/proxy/products/templates/${templateId}`)
}

/** 创建产品模板 */
export function createTemplate(data: {
  templateCode: string
  templateName: string
  insuranceType: string
  issuanceMode?: string
}): Promise<string> {
  return http.post('/web/v1/proxy/products/templates', data)
}

/**
 * 更新产品模板行为配置（保全/理赔/缴费/再保/分红/出单模式等）。
 * 对齐后端 PUT /web/v1/product-templates/{templateId}（经 BFF 代理），仅传需变更项，
 * 未传字段由聚合根投影层保留原值（null 表示不变更）。
 */
export function updateTemplate(templateId: string, data: UpdateTemplateForm): Promise<void> {
  return http.put(`/web/v1/proxy/products/templates/${templateId}`, data) as Promise<void>
}

// ===== 寿险产品特有配置（对齐后端 ConfigureLifeProductDTO / LifeProductSpec 嵌套结构） =====

/** 可投保年龄范围（闭区间，对齐后端 AgeRangeRequest） */
export interface AgeRangeRequest { minAge: number; maxAge: number }
/** 保额范围（闭区间，对齐后端 SumInsuredRangeRequest） */
export interface SumInsuredRangeRequest { minSumInsured: number; maxSumInsured: number }
/** 缴费期选项：years=0 表示趸缴；toAge 与 years 二选一（对齐后端 PremiumTermOptionRequest） */
export interface PremiumTermOptionRequest { years: number; toAge?: number; description?: string }
/** 保障期选项：years=0/wholeLife 表示终身；toAge 与 years 二选一（对齐后端 CoverageTermOptionRequest） */
export interface CoverageTermOptionRequest { years: number; toAge?: number; wholeLife?: boolean; description?: string }

/**
 * 配置寿险产品规格入参（对齐后端 ConfigureLifeProductDTO 嵌套结构）。
 * 险种三级分类 productType（TERM_LIFE/WHOLE_LIFE/ENDOWMENT/ANNUITY）+ 年龄/保额区间 + 缴费期/保障期选项。
 */
export interface ConfigureLifeProductRequest {
  /** 险种三级分类（InsuranceProductType 常量名，寿险线：TERM_LIFE/WHOLE_LIFE/ENDOWMENT/ANNUITY） */
  productType?: string
  entryAgeRange: AgeRangeRequest
  sumInsuredRange: SumInsuredRangeRequest
  premiumTermOptions?: PremiumTermOptionRequest[]
  coverageTermOptions?: CoverageTermOptionRequest[]
}

/** 配置寿险产品规格（通过 admin proxy） */
export function configureLifeProduct(productId: string, data: ConfigureLifeProductRequest): Promise<void> {
  return http.post(`/web/v1/proxy/products/${productId}/life-config`, data) as Promise<void>
}

/** 查询寿险产品规格（未配置时后端返回 null） */
export function getLifeProductConfig(productId: string): Promise<ConfigureLifeProductRequest | null> {
  return http.get(`/web/v1/proxy/products/${productId}/life-config`) as Promise<ConfigureLifeProductRequest | null>
}
