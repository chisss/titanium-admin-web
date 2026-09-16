// 客户相关接口
import http from './http'
import { toPageResult } from './pageResult'
import type { CustomerVO } from '@/types/business.d'
import type { PageParams, PageResult } from '@/types/api.d'

/**
 * 查询客户列表
 *
 * <p>🔴 D-501-57：走下游**分页契约** {@code /web/v1/proxy/customers/page}，其 {@code total}
 * 是满足条件的全量条数。旧的 {@code /web/v1/proxy/customers} 下游只返回裸数组、不携带总数，
 * 前端只能拿当前页条数冒充，表现为「共 20 条」而实际 34 条、第 2 页不可达。</p>
 */
export async function getCustomerList(
  params?: Partial<{ name: string; idNo: string; mobile: string }> & PageParams,
): Promise<PageResult<CustomerVO>> {
  const { pageNum, pageSize, ...filters } = params ?? {}
  const payload = await http.get<unknown, CustomerVO[] | PageResult<CustomerVO>>(
    '/web/v1/proxy/customers/page',
    {
      params: {
        ...filters,
        page: Math.max((pageNum ?? 1) - 1, 0),
        size: pageSize ?? 20,
      },
    },
  )
  return toPageResult(payload, pageNum || 1, pageSize || 20)
}

/** 获取客户详情 */
export function getCustomerDetail(id: string): Promise<CustomerVO> {
  return http.get(`/web/v1/proxy/customers/${id}`) as Promise<CustomerVO>
}
