// API 响应通用类型定义

/** 统一 API 响应结构（兼容旧数字信封 200 与 metadata ApiResponse 的成功码 "00000000"） */
export interface ApiResponse<T = unknown> {
  /** 业务状态码：旧数字信封 200=成功；metadata ApiResponse 用 String 码 "00000000"=成功 */
  code: number | string
  /** 响应消息 */
  message: string
  /** 业务数据 */
  data: T
}

/** 分页查询参数 */
export interface PageParams {
  /** 当前页（从1开始） */
  pageNum: number
  /** 每页条数 */
  pageSize: number
}

/** 分页响应结构 */
export interface PageResult<T = unknown> {
  /** 数据列表 */
  list: T[]
  /**
   * 总条数；`null` 表示**总数未知**（🔴 D-501-57）。
   *
   * 后管代理层在「下游只返回裸数组且本页已满」时无法推断全量条数，此时如实返回 `null`。
   * 消费方必须区分 `null`（未知）与 `0`（确知没有数据）：把未知显示成数字、或显示成 0，
   * 都是在向用户断言一个未经证实的事实。
   */
  total: number | null
  /** 当前页 */
  pageNum: number
  /** 每页条数 */
  pageSize: number
  /** 后台分页响应的兼容字段 */
  page?: number
  size?: number
  totalPages?: number
}

/** 字典项类型 */
export interface DictItem {
  /** 字典值 */
  value: string
  /** 标签（当前语言） */
  label: string
  /** 标签多语言映射 */
  i18nLabels?: Record<string, string>
  /** 扩展属性（如颜色） */
  extra?: Record<string, string>
  /** 排序 */
  sort: number
}

/** 树形节点 */
export interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
  [key: string]: unknown
}
