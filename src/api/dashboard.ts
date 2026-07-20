// 数据看板相关接口
import http from './http'

/** 核心指标 VO */
export interface DashboardStatsVO {
  todayPremium: number
  todayPolicyCount: number
  activePolicyCount: number
  pendingClaimCount: number
  processingMaintenanceCount: number
  pendingUnderwritingCount: number
}

/** 趋势数据点 */
export interface TrendPoint {
  date: string
  value: number
}

/** 险种分布项 */
export interface DistributionItem {
  name: string
  value: number
}

/** 核心指标 */
export function getDashboardStats(): Promise<DashboardStatsVO> {
  return http.get('/web/v1/dashboard/stats') as Promise<DashboardStatsVO>
}

/** 保费趋势 */
export function getPremiumTrend(): Promise<TrendPoint[]> {
  return http.get('/web/v1/dashboard/premium-trend') as Promise<TrendPoint[]>
}

/** 险种分布 */
export function getInsuranceDistribution(): Promise<DistributionItem[]> {
  return http.get('/web/v1/dashboard/insurance-distribution') as Promise<DistributionItem[]>
}
