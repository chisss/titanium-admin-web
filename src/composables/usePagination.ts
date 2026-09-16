// usePagination 组合式函数 - 分页逻辑封装
import { ref, reactive } from 'vue'

/** 分页参数 */
export interface PaginationState {
  pageNum: number
  pageSize: number
  /** 总条数；`null` 表示总数未知（🔴 D-501-57），消费方须与 0 区分对待 */
  total: number | null
}

/**
 * 分页逻辑 Hook
 * @param defaultPageSize 默认每页条数，默认 20
 */
export function usePagination(defaultPageSize = 20) {
  const pagination = reactive<PaginationState>({
    pageNum: 1,
    pageSize: defaultPageSize,
    total: 0,
  })

  /** 页码改变 */
  const handleCurrentChange = (page: number, fetchFn: () => void) => {
    pagination.pageNum = page
    fetchFn()
  }

  /** 每页条数改变 */
  const handleSizeChange = (size: number, fetchFn: () => void) => {
    pagination.pageSize = size
    pagination.pageNum = 1
    fetchFn()
  }

  /** 重置到第一页 */
  const resetPage = () => {
    pagination.pageNum = 1
  }

  /** 设置总数；`null` 表示总数未知（🔴 D-501-57），不得传 0 顶替 */
  const setTotal = (total: number | null) => {
    pagination.total = total
  }

  return {
    pagination,
    handleCurrentChange,
    handleSizeChange,
    resetPage,
    setTotal,
  }
}
