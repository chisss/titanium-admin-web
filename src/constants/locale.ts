// 租户本地化配置选项常量
//
// 与后端 titanium-metadata 枚举保持一致：
//   国家 → CountryEnum（code = ISO 3166-1 alpha-2）
//   语言 → LanguageEnum（code = BCP 47 语言标签，如 zh-CN / en-US）
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

/** 币种元数据 */
export interface CurrencyMeta {
  /** 货币符号（¥ / $ / JP¥ …） */
  symbol: string
  /** 法定小数位，即 ISO 4217 的 minor unit */
  minorUnits: number
}

/**
 * 币种定义表：符号 + 法定小数位
 *
 * 🔴 这是**前端唯一**的币种精度真源，镜像后端 `titanium-metadata` 的
 * `CurrencyEnum.scale`（依据 ISO 4217 货币最小单位：多数币种 2 位，日元/越南盾无小数位）。
 *
 * 为何不从字典取：`CURRENCY` 字典项只有 `dictValue`/`dictLabel`，**没有精度字段**
 * （见 `src/api/dict.ts` 的 `DictDataRaw`），且线上实测该字典仅 3 项（CNY/USD/HKD），
 * 覆盖不了本表。精度只能由枚举承载，故与后端 `CurrencyEnum` 同源维护。
 * ⚠️ 后端新增币种时此处必须同步，否则新币种会退化成「无符号 + 2 位」的兜底展示。
 */
const CURRENCY_DEFS: ReadonlyArray<{ code: string; name: string; symbol: string; minorUnits: number }> = [
  { code: 'CNY', name: '人民币', symbol: '¥', minorUnits: 2 },
  { code: 'USD', name: '美元', symbol: '$', minorUnits: 2 },
  { code: 'EUR', name: '欧元', symbol: '€', minorUnits: 2 },
  { code: 'GBP', name: '英镑', symbol: '£', minorUnits: 2 },
  { code: 'JPY', name: '日元', symbol: 'JP¥', minorUnits: 0 },
  { code: 'HKD', name: '港币', symbol: 'HK$', minorUnits: 2 },
  { code: 'SGD', name: '新加坡元', symbol: 'S$', minorUnits: 2 },
  { code: 'PHP', name: '菲律宾比索', symbol: '₱', minorUnits: 2 },
  { code: 'IDR', name: '印度尼西亚盾', symbol: 'Rp', minorUnits: 2 },
  { code: 'MYR', name: '马来西亚林吉特', symbol: 'RM', minorUnits: 2 },
  { code: 'THB', name: '泰铢', symbol: '฿', minorUnits: 2 },
  { code: 'VND', name: '越南盾', symbol: '₫', minorUnits: 0 },
]

/** 币种元数据索引（供 `src/utils/format.ts` 取符号与小数位） */
export const CURRENCY_META: Record<string, CurrencyMeta> = Object.fromEntries(
  CURRENCY_DEFS.map(({ code, symbol, minorUnits }) => [code, { symbol, minorUnits }]),
)

/** 默认币种：未显式指定时按人民币展示 */
export const DEFAULT_CURRENCY = 'CNY'

/**
 * 币种选项（下拉用，label 由 {@link CURRENCY_DEFS} 派生以免符号出现第二个真源）
 *
 * ⚠️ 本表 12 项，后端 `CurrencyEnum` 只有 6 项（CNY/USD/EUR/GBP/JPY/HKD），
 * 线上 CURRENCY 字典更是只有 3 项。多出的 6 项是既有可选项，保留是为了不缩小
 * 租户可配置范围；原注释称「对齐后端 CurrencyEnum」与事实不符，已更正。
 */
export const CURRENCY_OPTIONS: LocaleOption[] = CURRENCY_DEFS.map(({ code, name, symbol }) => ({
  value: code,
  label: `${name} (${symbol})`,
}))

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

/**
 * 界面语言切换器的可选项（🔴 D-12 时自已删除的 src/i18n 迁来）。
 *
 * <p>与上面 {@link LANGUAGE_OPTIONS} **不是同一份清单**，不可合并：
 * 那个是「租户语言**可以配成**哪些」（后端 LanguageEnum 全集，服务于租户配置表单）；
 * 这个是「当前前端界面**实际能显示**哪些」——界面文案由后端按语言键下发
 * （字典 `DictData.i18nLabels`，见 useDict），只有这两门语言有真实译文，
 * 多列出来等于给用户一个「选了也没东西变」的选项。</p>
 *
 * <p>⚠️ 待后端按租户语言下发接入后，本清单应改由后端语言字典驱动并删除：
 * 届时语言随租户配置自动切换，不再由用户手选。</p>
 */
export const SUPPORTED_LOCALES: Array<LocaleOption & { flag: string }> = [
  { value: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
  { value: 'en-US', label: 'English', flag: '🇺🇸' },
]
