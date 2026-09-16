// useTable 组合式函数 - 表格通用逻辑封装
import { ref, reactive, type Ref } from 'vue'
import { usePagination } from './usePagination'
import type { PageResult } from '@/types/api.d'

/** 分页入参：pageNum/pageSize 为前端约定，page/size 为后端多数端点约定，双写以兼容 */
export interface PageQuery {
  /** 视图可能透传任意查询条件，索引签名使 PageQuery 可与各页查询参数类型相交 */
  [key: string]: unknown
  pageNum: number
  pageSize: number
  page: number
  size: number
}

/**
 * 表格通用逻辑 Hook
 * @param fetchFn 数据获取函数，接收分页+查询参数，返回 PageResult
 */
export function useTable<T, P extends Record<string, unknown>>(
  fetchFn: (params: P & PageQuery) => Promise<PageResult<T> | T[]>,
  externalQueryParams?: P,
) {
  // 保持为真正的 Ref<T[]>：模板中 `:data="tableData"` 自动解包为数组，脚本中 `tableData.value` 读写；
  // 旧的 `as { value: T[] }` 断言会让模板侧丢失 ref 自动解包的类型推断，导致 vue-tsc 报错
  const tableData: Ref<T[]> = ref<T[]>([]) as Ref<T[]>
  const tableLoading = ref(false)
  const { pagination, handleCurrentChange, handleSizeChange, resetPage, setTotal } = usePagination()

  // 当前查询参数（不含分页）
  // 若视图传入了外部搜索表单对象则复用它（搜索条件才能真正到达 API），否则退回内部空对象
  const queryParams = (externalQueryParams ?? reactive<Record<string, unknown>>({})) as Record<string, unknown>

  /** 加载表格数据 */
  const fetchData = async () => {
    tableLoading.value = true
    try {
      const result = await fetchFn({
        ...(queryParams as P),
        // 后端分页入参命名未统一（多数端点用 page/size，DictController 用 pageNum/pageSize），
        // 双写两套键：只发一套时后端取默认值，表现为「翻页后仍返回第一页」且无任何报错
        pageNum: pagination.pageNum,
        pageSize: pagination.pageSize,
        page: pagination.pageNum,
        size: pagination.pageSize,
      })
      // 后端部分端点返回裸数组（如 /web/v1/roles 无分页信封）。
      // 归一化在此处完成，避免调用方因 result.list 为 undefined 而恒渲染「暂无数据」。
      if (Array.isArray(result)) {
        tableData.value = result
        setTotal(result.length)
      } else {
        tableData.value = result?.list ?? []
        setTotal(result?.total ?? 0)
      }
    } finally {
      tableLoading.value = false
    }
  }

  /** 搜索（重置到第一页再查） */
  const handleSearch = () => {
    resetPage()
    fetchData()
  }

  /** 重置搜索条件 */
  const handleReset = (defaultParams: Partial<P> = {}) => {
    Object.keys(queryParams).forEach((key) => {
      delete queryParams[key]
    })
    Object.assign(queryParams, defaultParams)
    resetPage()
    fetchData()
  }

  /** 翻页处理 */
  const onPageChange = (page: number) => handleCurrentChange(page, fetchData)
  const onSizeChange = (size: number) => handleSizeChange(size, fetchData)

  return {
    tableData,
    tableLoading,
    pagination,
    queryParams,
    fetchData,
    handleSearch,
    handleReset,
    onPageChange,
    onSizeChange,
  }
}
