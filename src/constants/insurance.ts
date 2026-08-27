// 险种分类层级常量
//
// 后端元数据(titanium-metadata)已建模三级险种分类，产品域写读链路真实存储/过滤的是叶子层
// InsuranceProductType（字段 insuranceType，按枚举常量名反序列化）。前端据此提供「二级险种」选择：
//   一级(险种大类) = 前端字典 INSURANCE_CATEGORY(LIFE/HEALTH/ACCIDENT/PROPERTY)，对齐后端 InsuranceLine
//   二级(具体险种) = InsuranceProductType 叶子（如 健康险 → 医疗险/重疾险/护理险/失能收入损失险）
//
// 二级选项的 value 必须与后端 InsuranceProductType 常量名严格一致（后端按常量名反序列化）。

/** 二级险种选项 */
export interface InsuranceTypeOption {
  /** 后端 InsuranceProductType 常量名（如 WHOLE_LIFE） */
  value: string
  /** 中文名（与后端枚举 name 对齐） */
  label: string
}

/**
 * 一级险种大类(INSURANCE_CATEGORY 字典值) → 二级险种(InsuranceProductType 常量) 列表。
 * 与后端 titanium-metadata InsuranceProductType 保持一致。
 */
export const INSURANCE_TYPE_BY_CATEGORY: Record<string, InsuranceTypeOption[]> = {
  LIFE: [
    { value: 'TERM_LIFE', label: '定期寿险' },
    { value: 'WHOLE_LIFE', label: '终身寿险' },
    { value: 'ENDOWMENT', label: '两全保险' },
    { value: 'ANNUITY', label: '年金保险' },
  ],
  HEALTH: [
    { value: 'CRITICAL_ILLNESS', label: '重大疾病保险' },
    { value: 'MEDICAL', label: '医疗保险' },
    { value: 'DISABILITY_INCOME', label: '失能收入损失保险' },
    { value: 'LONG_TERM_CARE', label: '护理保险' },
  ],
  ACCIDENT: [
    { value: 'ACCIDENT_COMPREHENSIVE', label: '综合意外险' },
    { value: 'TRANSPORT_ACCIDENT', label: '交通意外险' },
    { value: 'TRAVEL_ACCIDENT', label: '旅行意外险' },
  ],
  PROPERTY: [
    { value: 'AUTO', label: '机动车辆保险' },
    { value: 'ENTERPRISE_PROPERTY', label: '企业财产保险' },
    { value: 'HOUSEHOLD_PROPERTY', label: '家庭财产保险' },
    { value: 'AGRICULTURAL', label: '农业保险' },
    { value: 'MARINE_CARGO', label: '货运保险' },
    { value: 'PUBLIC_LIABILITY', label: '公众责任保险' },
    { value: 'EMPLOYER_LIABILITY', label: '雇主责任保险' },
    { value: 'PRODUCT_LIABILITY', label: '产品责任保险' },
    { value: 'PROFESSIONAL_LIABILITY', label: '职业责任保险' },
    { value: 'CREDIT', label: '信用保险' },
    { value: 'GUARANTEE', label: '保证保险' },
  ],
}

/** 全部二级险种 code → 中文名（用于列表回显 insuranceType） */
export const INSURANCE_TYPE_LABEL: Record<string, string> = Object.values(
  INSURANCE_TYPE_BY_CATEGORY,
)
  .flat()
  .reduce<Record<string, string>>((acc, opt) => {
    acc[opt.value] = opt.label
    return acc
  }, {})

/** 二级险种 code → 所属一级险种大类字典值（LIFE/HEALTH/ACCIDENT/PROPERTY） */
export const CATEGORY_BY_INSURANCE_TYPE: Record<string, string> = Object.entries(
  INSURANCE_TYPE_BY_CATEGORY,
).reduce<Record<string, string>>((acc, [category, opts]) => {
  opts.forEach((opt) => {
    acc[opt.value] = category
  })
  return acc
}, {})

/** 取某一级大类下的二级险种选项（category 为空返回空数组） */
export function insuranceTypesOf(category?: string): InsuranceTypeOption[] {
  if (!category) return []
  return INSURANCE_TYPE_BY_CATEGORY[category] ?? []
}

/** 二级险种 code → 中文名（未命中原样返回） */
export function insuranceTypeLabel(code?: string): string {
  if (!code) return '-'
  return INSURANCE_TYPE_LABEL[code] ?? code
}
