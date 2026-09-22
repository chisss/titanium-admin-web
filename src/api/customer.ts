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

/**
 * 客户写操作入参（新增/编辑共用）。
 *
 * <p>🔴 姓名整体放进下游 {@code lastName} 槽位，不拆「姓/名」两栏：下游
 * {@code CustomerWebMapper.toName} 会把 {@code firstName/middleName/lastName} 三段用**空格**
 * 拼成展示名（下游 {@code CustomerName.of} 的 StringJoiner），中文姓名拆两段会得到「三 张」——
 * 顺序与空格都不对。单槽位承载可保证展示名与输入逐字一致（下游另有
 * {@code CustomerName.fromDisplayName} 正是为「中文姓名不可靠拆分」而存在，但 Web DTO 未暴露该入口）。</p>
 */
export interface CustomerWriteBody {
  /** 客户姓名（整体） */
  lastName: string
  /** 证件类型（CustomerEnum.IdCardType 码） */
  idType: string
  /** 证件号码 */
  idNo: string
  /** 性别（CustomerEnum.CustomerGender 码） */
  gender?: string
  /** 手机号 */
  phoneNumber?: string
  /** 邮箱 */
  email?: string
  /** 地址 */
  address?: string
  /** 客户类型（CustomerEnum.CustomerType 码） */
  customerType?: string
}

/**
 * 新增客户，返回下游生成的客户ID。
 *
 * <p>🔴 与渠道域的差别：客户域写侧为事件溯源、读模型由 {@code customer-query-group} **同步**投影，
 * 命令返回时读模型已就绪，故不存在 channel 那种「创建成功但列表查不到」的写后读竞态（D-501-58），
 * 无需在 BFF 做回查补偿。</p>
 */
export function createCustomer(body: CustomerWriteBody): Promise<string> {
  return http.post('/web/v1/proxy/customers', body) as Promise<string>
}

/** 编辑客户（下游返回空体） */
export function updateCustomer(customerId: string, body: CustomerWriteBody): Promise<void> {
  return http.put(`/web/v1/proxy/customers/${customerId}`, body) as Promise<void>
}
