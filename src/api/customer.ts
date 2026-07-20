// 客户相关接口
import http from './http'
import type { CustomerVO } from '@/types/business.d'
import type { PageParams, PageResult } from '@/types/api.d'

/** 查询客户列表 */
export function getCustomerList(
  params?: Partial<{ name: string; idNo: string; mobile: string; dateRange?: string[] }> & PageParams,
): Promise<PageResult<CustomerVO>> {
  return http.get('/web/v1/customers', { params }) as Promise<PageResult<CustomerVO>>
}

/** 获取客户详情 */
export function getCustomerDetail(id: string): Promise<CustomerVO> {
  return http.get(`/web/v1/customers/${id}`) as Promise<CustomerVO>
}
