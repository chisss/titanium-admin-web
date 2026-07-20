// 操作日志相关接口
import http from './http'
import type { OperationLog } from '@/types/business.d'
import type { PageParams, PageResult } from '@/types/api.d'

/** 查询操作日志 */
export function getOperationLogs(
  params?: Partial<{ username: string; module: string; status?: string; dateRange?: string[] }> & PageParams,
): Promise<PageResult<OperationLog>> {
  return http.get('/web/v1/logs', { params }) as Promise<PageResult<OperationLog>>
}
