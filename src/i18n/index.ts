// i18n 国际化初始化
import { createI18n } from 'vue-i18n'
import zhCNCommon from './zh-CN/common'
import zhCNMenu from './zh-CN/menu'
import zhCNBusiness from './zh-CN/business'
import enUSCommon from './en-US/common'
import enUSMenu from './en-US/menu'
import enUSBusiness from './en-US/business'

// 从 localStorage 读取用户语言偏好
const savedLocale = localStorage.getItem('ti_locale') || 'zh-CN'

const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': {
      common: zhCNCommon,
      menu: zhCNMenu,
      business: zhCNBusiness,
    },
    'en-US': {
      common: enUSCommon,
      menu: enUSMenu,
      business: enUSBusiness,
    },
  },
})

export default i18n

/** 支持的语言列表 */
export const SUPPORTED_LOCALES = [
  { value: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
  { value: 'en-US', label: 'English', flag: '🇺🇸' },
]
