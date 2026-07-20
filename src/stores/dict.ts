// 字典 Store - 缓存字典数据，避免重复请求
import { defineStore } from 'pinia'
import { getDictDataByType } from '@/api/dict'
import type { DictData } from '@/types/business.d'

export const useDictStore = defineStore('dict', {
  state: () => ({
    /** 字典缓存：typeCode → 字典数据列表 */
    cache: {} as Record<string, DictData[]>,
    /** 正在加载中的字典类型（防重复请求） */
    loading: new Set<string>(),
  }),

  actions: {
    /** 获取字典数据（优先从缓存读取） */
    async getDict(typeCode: string): Promise<DictData[]> {
      // 命中缓存直接返回
      if (this.cache[typeCode]) {
        return this.cache[typeCode]
      }
      // 防止重复请求
      if (this.loading.has(typeCode)) {
        await new Promise<void>((resolve) => {
          const timer = setInterval(() => {
            if (this.cache[typeCode]) {
              clearInterval(timer)
              resolve()
            }
          }, 100)
        })
        return this.cache[typeCode] || []
      }
      // 发起请求
      this.loading.add(typeCode)
      try {
        const items = await getDictDataByType(typeCode)
        this.cache[typeCode] = items
        return items
      } finally {
        this.loading.delete(typeCode)
      }
    },

    /** 手动更新指定字典缓存 */
    updateCache(typeCode: string, items: DictData[]) {
      this.cache[typeCode] = items
    },

    /** 清除指定字典缓存 */
    clearCache(typeCode: string) {
      delete this.cache[typeCode]
    },

    /** 清除所有字典缓存 */
    clearAll() {
      this.cache = {}
    },
  },
})
