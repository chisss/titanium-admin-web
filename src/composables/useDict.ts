// useDict 组合式函数 - 字典数据加载与多语言适配
import { ref, computed } from 'vue'
import { useDictStore } from '@/stores/dict'
import { useAppStore } from '@/stores/app'
import type { DictData } from '@/types/business.d'

/** 字典选项（用于下拉/标签展示） */
export interface DictOption {
  value: string
  label: string
  color?: string
  extra?: Record<string, string>
}

/**
 * 字典数据加载 Hook
 * @param typeCode 字典类型编码
 * @returns dictOptions 选项列表、getLabel 根据当前语言获取标签
 */
export function useDict(typeCode: string) {
  // 🔴 语言取自 appStore 而非 vue-i18n（D-12 已移除前端 i18n 运行时）。
  // 这里读的是**后端下发的多语言标签** `DictData.i18nLabels`（字典管理页可维护、
  // api/dict.ts 透传），属「后端做国际化」这条路线本身，与前端 i18n 无关：
  // 前端只负责按当前语言键取值，没有译文时降级回后端给的默认 label。
  const appStore = useAppStore()
  const dictStore = useDictStore()
  const rawItems = ref<DictData[]>([])
  const loading = ref(false)

  // 加载字典数据
  const load = async () => {
    loading.value = true
    try {
      rawItems.value = await dictStore.getDict(typeCode)
    } finally {
      loading.value = false
    }
  }

  // 计算当前语言的字典选项
  const dictOptions = computed<DictOption[]>(() =>
    rawItems.value.map((item) => ({
      value: item.value,
      // 优先取当前语言翻译，降级取默认标签
      label: item.i18nLabels?.[appStore.locale] || item.label,
      color: item.extra?.color,
      extra: item.extra,
    })),
  )

  /**
   * 根据字典值获取当前语言的标签
   * @param value 字典值
   */
  const getLabel = (value: string): string => {
    const item = rawItems.value.find((d) => d.value === value)
    if (!item) return value
    return item.i18nLabels?.[appStore.locale] || item.label
  }

  /**
   * 根据字典值获取颜色（用于标签显示）
   */
  const getColor = (value: string): string => {
    const item = rawItems.value.find((d) => d.value === value)
    return item?.extra?.color || 'info'
  }

  // 立即加载
  load()

  return {
    dictOptions,
    loading,
    getLabel,
    getColor,
    reload: load,
  }
}
