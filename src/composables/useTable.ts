// useTable 组合式函数 - 表格通用逻辑封装
import { onMounted, reactive, ref, type Ref } from 'vue'
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
 * 把 catch 到的任意值归一为 Error。
 * 🔴 D-07：request 拦截器 reject 的不一定是 Error —— 可能是后端原始字符串、普通对象，
 * 直接塞进 tableError 会让消费方 `error.message` 取到 undefined，错误态渲染成空白。
 */
export function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err
  if (typeof err === 'string' && err.trim()) return new Error(err)
  return new Error('数据加载失败')
}

/**
 * 非分页列表页的失败态（🔴 R7-13）。
 *
 * <p>不走 `useTable` 的自定义加载页（一屏取多张表、或自带分页的页）此前普遍只有
 * `try/finally`：接口失败时 loading 正常关闭、全局 toast 一闪而过，而表格永久停在
 * 「暂无数据」——向用户断言「系统里没有这类数据」，与「接口挂了」在界面上完全同形。
 * toast 是瞬时的，这条断言却是持久的，所以「反正有全局提示」并不构成兜底。</p>
 *
 * <p>此处把 `useTable` 内联的三条失败语义抽出来供其复用，避免各页自行推导：
 * ① 成功路径清错；② 失败路径置错**并清空上一次的数据**（否则界面呈现「旧数据 + 新错误」，
 * 用户会以为这份旧数据就是本次查询结果，比单纯不显示更危险）；③ 失败同样要关 loading，
 * 否则重试按钮永远转圈、页面卡在加载态。</p>
 *
 * <p>🔴 清错必须写在 `try` 的成功分支里，**不能**写进 `finally` —— 失败路径也经过 `finally`，
 * 会把刚置上的错误立刻抹掉，失败态永远不显示。这是本修复最容易写错的地方。</p>
 */
export function useTableError() {
  const tableError = ref<Error | null>(null)
  /** 成功路径调用：清掉上一次的失败态 */
  const clearTableError = () => {
    tableError.value = null
  }
  /** 失败路径调用：置上失败态（调用方同时负责清空自己的数据） */
  const setTableError = (err: unknown) => {
    tableError.value = normalizeError(err)
  }
  return { tableError, clearTableError, setTableError }
}

/**
 * 表格通用逻辑 Hook
 * @param fetchFn 数据获取函数，接收分页+查询参数，返回 PageResult
 * @param externalQueryParams 外部搜索表单对象（复用同一份查询条件）
 * @param options.immediate 是否在挂载时自动加载首屏数据，默认 `true`
 */
export function useTable<T, P extends Record<string, unknown>>(
  fetchFn: (params: P & PageQuery) => Promise<PageResult<T> | T[]>,
  externalQueryParams?: P,
  options?: { immediate?: boolean },
) {
  // 保持为真正的 Ref<T[]>：模板中 `:data="tableData"` 自动解包为数组，脚本中 `tableData.value` 读写；
  // 旧的 `as { value: T[] }` 断言会让模板侧丢失 ref 自动解包的类型推断，导致 vue-tsc 报错
  const tableData: Ref<T[]> = ref<T[]>([]) as Ref<T[]>
  const tableLoading = ref(false)
  // 🔴 D-07：加载失败状态。此前只有 try/finally 无 catch，接口 500 时 tableData 保持 []
  // 并被渲染成「暂无数据」—— 界面向用户断言「系统里没有这类数据」，而真相是接口挂了。
  // 二者在界面上完全同形，且无任何残留痕迹可供排查。
  const tableError = ref<Error | null>(null)
  const { pagination, handleCurrentChange, handleSizeChange, resetPage, setTotal } = usePagination()

  // 当前查询参数（不含分页）
  // 若视图传入了外部搜索表单对象则复用它（搜索条件才能真正到达 API），否则退回内部空对象
  const queryParams = (externalQueryParams ?? reactive<Record<string, unknown>>({})) as Record<string, unknown>

  /**
   * 首屏加载标记：任何一次 `fetchData` 调用（含调用方在 setup 顶层或自身 onMounted 中的手写调用）
   * 都会**同步**置位，使挂载时的自动加载不再重复发起请求 —— 保证存量页面**恰好一次**首屏请求。
   */
  let firstLoadStarted = false

  /** 加载表格数据 */
  const fetchData = async () => {
    firstLoadStarted = true
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
      // 🔴 D-07：成功路径首行清错。不放在 finally 中——失败路径也会经过 finally，
      // 那样会把刚置上的错误立刻抹掉，错误态永远不显示（这是本修复最容易写错的地方）。
      tableError.value = null
      // 后端部分端点返回裸数组（如 /web/v1/roles 无分页信封）。
      // 归一化在此处完成，避免调用方因 result.list 为 undefined 而恒渲染「暂无数据」。
      if (Array.isArray(result)) {
        tableData.value = result
        setTotal(result.length)
      } else {
        tableData.value = result?.list ?? []
        // 🔴 D-501-57：total 为 null 表示**总数未知**（下游裸数组且本页已满，代理层无从推断），
        // 原实现 `?? 0` 把「未知」压成「0 条」，分页区随之消失、后续页在 UI 永久不可达。
        setTotal(result?.total ?? null)
      }
    } catch (err) {
      // 🔴 D-07：失败必须同时清空上一次的成功数据——否则界面呈现「旧数据 + 新错误」，
      // 用户会以为这份旧数据就是本次查询结果（比单纯不显示更危险）。
      // total 一并置 null：失败时总数确实未知，留着旧值会在错误态上方渲染出对不上的分页条。
      tableError.value = normalizeError(err)
      tableData.value = []
      setTotal(null)
    } finally {
      // 失败路径同样要关 loading，否则重试按钮永远转圈、页面卡在加载态
      tableLoading.value = false
    }
  }

  /** 重试上一次失败的加载（供错误态「重试」按钮调用） */
  const retry = () => fetchData()

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

  // 首屏自动加载（🔴 D-501-43）：此前「是否加载首屏」由**每个调用方手写**，20 个用本 Hook 的页面中
  // 19 个各写一行、1 个（核保工单列表）漏写 ⇒ 该页恒显示「暂无数据」——向用户断言「系统里没有工单」，
  // 而真相是「有 36 条，只是没查」，且无任何报错、无加载残留，用户无从察觉。
  // 现将首屏加载改为**默认行为**（把「忘记调用」从可能的失误变为不会发生的设计）：
  // 需要自行控制加载时机的页面（如先加载联动数据再查列表）显式传 `{ immediate: false }`。
  // 存量 17 个在 setup 顶层调用、2 个在自身 onMounted 中调用的页面，均由 firstLoadStarted 保证不重复请求。
  onMounted(() => {
    if (options?.immediate !== false && !firstLoadStarted) {
      fetchData()
    }
  })

  return {
    tableData,
    tableLoading,
    tableError,
    pagination,
    queryParams,
    fetchData,
    retry,
    handleSearch,
    handleReset,
    onPageChange,
    onSizeChange,
  }
}
