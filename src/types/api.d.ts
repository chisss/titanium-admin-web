// API 响应通用类型定义

/** 统一 API 响应结构 */
export interface ApiResponse<T = unknown> {
  /** 业务状态码 200=成功 */
  code: number
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
  /** 总条数 */
  total: number
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
