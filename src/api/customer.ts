// 客户相关接口
import http from './http'
import type { CustomerVO } from '@/types/business.d'
import type { PageParams, PageResult } from '@/types/api.d'

/** 查询客户列表（兼容 Admin 代理分页对象与旧版裸数组响应） */
export async function getCustomerList(
  params?: Partial<{ name: string; idNo: string; mobile: string }> & PageParams,
): Promise<PageResult<CustomerVO>> {
  const { pageNum, pageSize, ...filters } = params ?? {}
  const payload = await http.get<unknown, CustomerVO[] | PageResult<CustomerVO>>('/web/v1/proxy/customers', {
    params: {
      ...filters,
      page: Math.max((pageNum ?? 1) - 1, 0),
      size: pageSize ?? 20,
    },
  })
  const list = Array.isArray(payload) ? payload : payload?.list
  return {
    list: Array.isArray(list) ? list : [],
    total: Array.isArray(payload) ? payload.length : payload?.total ?? list?.length ?? 0,
    pageNum: pageNum || 1,
    pageSize: pageSize || 20,
  }
}

/** 获取客户详情 */
export function getCustomerDetail(id: string): Promise<CustomerVO> {
  return http.get(`/web/v1/proxy/customers/${id}`) as Promise<CustomerVO>
}
