// 客户相关接口
import http from './http'
import type { CustomerVO } from '@/types/business.d'
import type { PageParams, PageResult } from '@/types/api.d'

/** 查询客户列表（包装后端List响应为PageResult） */
export async function getCustomerList(
  params?: Partial<{ name: string; idNo: string; mobile: string; dateRange?: string[] }> & PageParams,
): Promise<PageResult<CustomerVO>> {
  const list = await http.get<CustomerVO[]>('/web/v1/proxy/customers', { params })
  return {
    list: Array.isArray(list) ? list : [],
    total: Array.isArray(list) ? list.length : 0,
    pageNum: params?.pageNum || 1,
    pageSize: params?.pageSize || 20,
  }
}

/** 获取客户详情 */
export function getCustomerDetail(id: string): Promise<CustomerVO> {
  return http.get(`/web/v1/proxy/customers/${id}`) as Promise<CustomerVO>
}
