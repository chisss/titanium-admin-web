// 租户本地化配置选项常量
//
// 与后端 titanium-metadata 枚举保持一致：
//   国家 → CountryEnum（code = ISO 3166-1 alpha-2）
//   语言 → LanguageEnum（code = BCP 47 语言标签，与 vue-i18n locale 对齐）
//   币种 → CurrencyEnum（code = ISO 4217）
//   时区 → IANA 时区标识
// 选项 value 必须与后端枚举 code 严格一致。

/** 通用选项结构 */
export interface LocaleOption {
  value: string
  label: string
}

/** 国家/地区选项（对齐后端 CountryEnum） */
export const COUNTRY_OPTIONS: LocaleOption[] = [
  { value: 'CN', label: '中国' },
  { value: 'US', label: '美国' },
  { value: 'GB', label: '英国' },
  { value: 'JP', label: '日本' },
  { value: 'HK', label: '中国香港' },
  { value: 'SG', label: '新加坡' },
  { value: 'PH', label: '菲律宾' },
  { value: 'ID', label: '印度尼西亚' },
  { value: 'MY', label: '马来西亚' },
  { value: 'TH', label: '泰国' },
  { value: 'VN', label: '越南' },
]

/** 语言选项（对齐后端 LanguageEnum） */
export const LANGUAGE_OPTIONS: LocaleOption[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁体中文' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'id-ID', label: 'Bahasa Indonesia' },
  { value: 'th-TH', label: 'ภาษาไทย' },
  { value: 'vi-VN', label: 'Tiếng Việt' },
]

/** 币种选项（对齐后端 CurrencyEnum） */
export const CURRENCY_OPTIONS: LocaleOption[] = [
  { value: 'CNY', label: '人民币 (¥)' },
  { value: 'USD', label: '美元 ($)' },
  { value: 'EUR', label: '欧元 (€)' },
  { value: 'GBP', label: '英镑 (£)' },
  { value: 'JPY', label: '日元 (JP¥)' },
  { value: 'HKD', label: '港币 (HK$)' },
]

/** 时区选项（IANA） */
export const TIMEZONE_OPTIONS: LocaleOption[] = [
  { value: 'Asia/Shanghai', label: '(UTC+8) 北京/上海' },
  { value: 'Asia/Hong_Kong', label: '(UTC+8) 香港' },
  { value: 'Asia/Singapore', label: '(UTC+8) 新加坡' },
  { value: 'Asia/Manila', label: '(UTC+8) 马尼拉' },
  { value: 'Asia/Jakarta', label: '(UTC+7) 雅加达' },
  { value: 'Asia/Bangkok', label: '(UTC+7) 曼谷' },
  { value: 'Asia/Ho_Chi_Minh', label: '(UTC+7) 胡志明市' },
  { value: 'Asia/Tokyo', label: '(UTC+9) 东京' },
  { value: 'Europe/London', label: '(UTC+0) 伦敦' },
  { value: 'America/New_York', label: '(UTC-5) 纽约' },
]

/** 国家 → 默认币种（开户时联动带出，对齐 CountryEnum.desc） */
export const COUNTRY_DEFAULT_CURRENCY: Record<string, string> = {
  CN: 'CNY', US: 'USD', GB: 'GBP', JP: 'JPY', HK: 'HKD',
  SG: 'SGD', PH: 'PHP', ID: 'IDR', MY: 'MYR', TH: 'THB', VN: 'VND',
}
