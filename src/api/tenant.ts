// 租户相关接口
import http from './http'
import type { TenantVO } from '@/types/business.d'
import type { PageParams, PageResult } from '@/types/api.d'

/** 后端租户 VO 原始结构（字段命名与前端 TenantVO 不同，需在边界处适配） */
interface RawTenantVO {
  id: string
  tenantCode?: string
  tenantName?: string
  contactPerson?: string
  contactPhone?: string
  contactEmail?: string
  status?: string
  logo?: string
  themeColor?: string
  country?: string
  language?: string
  currency?: string
  timezone?: string
  remark?: string
  createTime?: string
}

/** 后端 VO → 前端 TenantVO */
function toTenantVO(vo: RawTenantVO): TenantVO {
  return {
    id: vo.id,
    code: vo.tenantCode ?? '',
    name: vo.tenantName ?? '',
    contactName: vo.contactPerson ?? '',
    contactMobile: vo.contactPhone ?? '',
    contactEmail: vo.contactEmail,
    status: (vo.status as TenantVO['status']) ?? 'ACTIVE',
    country: vo.country,
    language: vo.language,
    currency: vo.currency,
    timezone: vo.timezone,
    logo: vo.logo,
    themeColor: vo.themeColor,
    remark: vo.remark,
    createdAt: vo.createTime ?? '',
  }
}

/** 前端表单 → 后端请求参数 */
function toTenantRequest(data: Partial<TenantVO>): Record<string, unknown> {
  return {
    tenantCode: data.code,
    tenantName: data.name,
    contactPerson: data.contactName,
    contactPhone: data.contactMobile,
    contactEmail: data.contactEmail,
    logo: data.logo,
    themeColor: data.themeColor,
    country: data.country,
    language: data.language,
    currency: data.currency,
    timezone: data.timezone,
    remark: data.remark,
  }
}

/** 查询租户列表（后端入参用 tenantName，前端搜索用 name） */
export function getTenantList(
  params?: Partial<PageParams> & Record<string, unknown>,
): Promise<PageResult<TenantVO>> {
  const query = { ...params, tenantName: params?.name, name: undefined }
  return http
    .get<unknown, PageResult<RawTenantVO>>('/web/v1/tenants', { params: query })
    .then((res) => ({ ...res, list: (res.list ?? []).map(toTenantVO) }))
}

/** 获取租户详情 */
export function getTenantDetail(id: string): Promise<TenantVO> {
  return http.get<unknown, RawTenantVO>(`/web/v1/tenants/${id}`).then(toTenantVO)
}

/** 新增租户 */
export function createTenant(data: Partial<TenantVO>): Promise<void> {
  return http.post('/web/v1/tenants', toTenantRequest(data))
}

/** 更新租户 */
export function updateTenant(id: string, data: Partial<TenantVO>): Promise<void> {
  return http.put(`/web/v1/tenants/${id}`, toTenantRequest(data))
}

/** 启用/禁用租户（后端为 PUT /{id}/status，传枚举名 ACTIVE/INACTIVE） */
export function toggleTenantStatus(id: string, status: string): Promise<void> {
  return http.put(`/web/v1/tenants/${id}/status`, { status })
}
