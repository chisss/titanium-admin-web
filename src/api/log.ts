// 操作日志相关接口
import http from './http'
import type { OperationLog } from '@/types/business.d'
import type { PageParams, PageResult } from '@/types/api.d'

/** 后端操作日志 VO 原始结构（字段名与前端模型不同，需在边界处适配） */
interface RawOperationLogVO {
  id: string
  userId?: string
  username?: string
  module?: string
  /** 操作类型（前端模型对应 action） */
  operation?: string
  /** 请求地址 */
  requestUrl?: string
  /** 状态码：0-成功 1-失败（见 OperationLogAspect 落库约定） */
  status?: string
  /** 客户端 IP（前端模型对应 requestIp） */
  ip?: string
  duration?: number
  /** 操作时间（前端模型对应 createdAt） */
  operateTime?: string
}

/** 后端状态码 → 前端状态 */
const CODE_TO_RESULT: Record<string, OperationLog['status']> = { '0': 'SUCCESS', '1': 'FAIL' }
/** 前端状态 → 后端状态码 */
const RESULT_TO_CODE: Record<OperationLog['status'], string> = { SUCCESS: '0', FAIL: '1' }

/** 后端 VO → 前端模型（operation→action、ip→requestIp、operateTime→createdAt） */
function toOperationLog(raw: RawOperationLogVO): OperationLog {
  return {
    id: raw.id,
    userId: raw.userId ?? '',
    username: raw.username ?? '',
    module: raw.module ?? '',
    action: raw.operation ?? '',
    requestUrl: raw.requestUrl,
    requestIp: raw.ip ?? '',
    status: CODE_TO_RESULT[raw.status ?? ''] ?? 'FAIL',
    duration: raw.duration ?? 0,
    createdAt: raw.operateTime ?? '',
  }
}

/** 查询操作日志 */
export function getOperationLogs(
  params?: Partial<{ username: string; module: string; status?: string; dateRange?: string[] }> & PageParams,
): Promise<PageResult<OperationLog>> {
  // 状态筛选须按后端码提交（下拉字典值为 SUCCESS/FAIL，后端比对的是 0/1）
  const query = { ...params }
  if (query.status) {
    query.status = RESULT_TO_CODE[query.status as OperationLog['status']] ?? query.status
  }
  return http.get<unknown, PageResult<RawOperationLogVO>>('/web/v1/logs', { params: query }).then((page) => ({
    ...page,
    list: (page?.list ?? []).map(toOperationLog),
  }))
}
