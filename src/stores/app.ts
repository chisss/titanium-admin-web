// App Store - 全局应用配置（语言、主题、侧栏折叠状态）
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    /** 当前语言 */
    locale: localStorage.getItem('ti_locale') || 'zh-CN',
    /** 侧边栏是否折叠 */
    sidebarCollapsed: false,
    /** 右侧数据面板是否折叠 */
    dataPanelCollapsed: false,
    /** 底部 AI 助手是否展开 */
    aiChatExpanded: false,
    /** 页面标题 */
    pageTitle: '',
  }),

  actions: {
    /** 切换语言 */
    setLocale(locale: string) {
      this.locale = locale
      localStorage.setItem('ti_locale', locale)
    },

    /** 切换侧边栏折叠状态 */
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    },

    /** 切换数据面板折叠状态 */
    toggleDataPanel() {
      this.dataPanelCollapsed = !this.dataPanelCollapsed
    },

    /** 切换 AI 助手展开状态 */
    toggleAiChat() {
      this.aiChatExpanded = !this.aiChatExpanded
    },

    /** 设置页面标题 */
    setPageTitle(title: string) {
      this.pageTitle = title
      document.title = title ? `${title} - Titanium 保险核心` : 'Titanium 保险核心管理后台'
    },
  },
})
