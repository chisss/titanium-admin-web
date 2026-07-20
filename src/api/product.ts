// 产品相关接口
import http from './http'
import type { ProductVO } from '@/types/business.d'
import type { PageParams, PageResult } from '@/types/api.d'

/** 查询产品列表 */
export function getProductList(params?: Partial<PageParams> & Record<string, unknown>): Promise<PageResult<ProductVO>> {
  return http.get('/web/v1/products', { params })
}

/** 获取产品详情 */
export function getProductDetail(id: string): Promise<ProductVO> {
  return http.get(`/web/v1/products/${id}`)
}

/** 新建产品 */
export function createProduct(data: Partial<ProductVO>): Promise<void> {
  return http.post('/web/v1/products', data)
}

/** 更新产品 */
export function updateProduct(id: string, data: Partial<ProductVO>): Promise<void> {
  return http.put(`/web/v1/products/${id}`, data)
}

/** 产品上架 */
export function activateProduct(id: string): Promise<void> {
  return http.post(`/web/v1/products/${id}/activate`)
}

/** 产品下架 */
export function deactivateProduct(id: string): Promise<void> {
  return http.post(`/web/v1/products/${id}/deactivate`)
}

/** 提交审核 */
export function submitProductForReview(id: string): Promise<void> {
  return http.post(`/web/v1/products/${id}/submit`)
}

/** 导出产品列表 */
export function exportProducts(params?: Record<string, unknown>): Promise<Blob> {
  return http.get('/web/v1/products/export', { params, responseType: 'blob' })
}

// ===== 寿险产品特有配置 =====

export interface AgeRangeRequest { min: number; max: number }
export interface SumInsuredRangeRequest { min: number; max: number; currency?: string }
export interface PremiumTermOptionRequest { years: number; label?: string }
export interface CoverageTermOptionRequest { years?: number; isLifetime?: boolean; label?: string }

export interface ConfigureLifeProductRequest {
  minEntryAge: number
  maxEntryAge: number
  minSumInsured: number
  maxSumInsured: number
  premiumTermOptions?: PremiumTermOptionRequest[]
  coverageTermOptions?: CoverageTermOptionRequest[]
}

/** 配置寿险产品规格（通过 admin proxy） */
export function configureLifeProduct(productId: string, data: ConfigureLifeProductRequest): Promise<void> {
  return http.post(`/web/v1/proxy/products/${productId}/life-config`, data) as Promise<void>
}

/** 查询寿险产品规格 */
export function getLifeProductConfig(productId: string): Promise<ConfigureLifeProductRequest> {
  return http.get(`/web/v1/proxy/products/${productId}/life-config`) as Promise<ConfigureLifeProductRequest>
}
