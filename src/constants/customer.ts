/**
 * 客户域枚举码 → 中文展示文案（D-501-56）。
 *
 * 🔴 码源为后端 `com.titanium.metadata.enums.customer.CustomerEnum`（CustomerType / CustomerStatus /
 * IdCardType / CustomerGender），**不是前端自造**；后端枚举新增取值时须同步本表，
 * 未覆盖码由 `customerLabel` 回退原文并 `console.warn` 暴露，不静默。
 * 列表页与详情页共用本表，避免同一字段两页文案分叉（D-501-56 现象 3）。
 */

/** 客户类型 ← CustomerEnum.CustomerType */
const CUSTOMER_TYPE: Record<string, string> = {
  INDIVIDUAL: '个人客户',
  ENTERPRISE: '企业客户',
  GOVERNMENT: '政府客户',
  ORGANIZATION: '组织机构',
}

/** 客户状态 ← CustomerEnum.CustomerStatus */
const CUSTOMER_STATUS: Record<string, string> = {
  ACTIVE: '活跃',
  INACTIVE: '不活跃',
  SUSPENDED: '已暂停',
  CLOSED: '已关闭',
}

/** 证件类型 ← CustomerEnum.IdCardType */
const ID_TYPE: Record<string, string> = {
  CHINA_ID_CARD: '居民身份证',
  CHINA_HOUSEHOLD_REGISTER: '户口簿',
  CHINA_DRIVING_LICENSE: '机动车驾驶证',
  CHINA_MILITARY_ID: '军人身份证件',
  CHINA_HK_MACAO_PASS: '港澳居民来往内地通行证',
  CHINA_TAIWAN_PASS: '台湾居民来往大陆通行证',
  CHINA_PASSPORT: '中国护照',
  FOREIGN_PASSPORT: '外国护照',
  FOREIGN_GREEN_CARD: '永久居留证（绿卡）',
  FOREIGN_PERMANENT_RESIDENCE_ID: '外国人永久居留身份证',
  FOREIGN_RESIDENCE_PERMIT: '外国人居留许可',
  INTERNATIONAL_DRIVING_PERMIT: '国际驾驶证',
  OTHER: '其他有效证件',
}

/** 性别 ← CustomerEnum.CustomerGender */
const CUSTOMER_GENDER: Record<string, string> = {
  MALE: '男',
  FEMALE: '女',
  UNKNOWN: '未知',
}

const LABELS: Record<string, Record<string, string>> = {
  customerType: CUSTOMER_TYPE,
  status: CUSTOMER_STATUS,
  idType: ID_TYPE,
  gender: CUSTOMER_GENDER,
}

/**
 * 按字段名翻译客户枚举码，未命中回退原文并告警。
 * @param field 字段名（customerType/status/idType/gender）
 * @param value 后端返回的枚举码
 */
export function customerLabel(field: keyof typeof LABELS | string, value?: string | null): string {
  if (!value) return '-'
  const mapped = LABELS[field]?.[value]
  if (mapped) return mapped
  console.warn(`[customer] 字段 "${field}" 的值码 "${value}" 无中文映射，请核对 CustomerEnum`)
  return value
}
