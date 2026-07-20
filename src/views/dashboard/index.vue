<template>
  <!-- 数据看板首页 -->
  <div class="ti-page dashboard">
    <div class="dashboard__header">
      <h2 class="dashboard__title">数据看板</h2>
      <span class="dashboard__date">{{ currentDate }}</span>
    </div>

    <!-- 核心 KPI 卡片 -->
    <el-row :gutter="16" class="dashboard__kpi">
      <el-col v-for="kpi in kpiCards" :key="kpi.label" :xs="12" :sm="4">
        <div class="kpi-card" :style="{ borderLeftColor: kpi.color }">
          <div class="kpi-card__label">{{ kpi.label }}</div>
          <div class="kpi-card__value" :style="{ color: kpi.color }">{{ kpi.value }}</div>
        </div>
      </el-col>
    </el-row>

    <!-- 图表区 -->
    <el-row :gutter="16" class="dashboard__charts">
      <el-col :sm="16">
        <div class="ti-card">
          <div class="chart-title">近30日保费趋势</div>
          <div ref="premiumChartRef" class="chart-container" />
        </div>
      </el-col>
      <el-col :sm="8">
        <div class="ti-card">
          <div class="chart-title">险种分布</div>
          <div ref="categoryChartRef" class="chart-container" />
        </div>
      </el-col>
    </el-row>

    <!-- 最新保单 -->
    <div class="ti-card dashboard__recent">
      <div class="chart-title">最新保单</div>
      <el-table :data="recentPolicies" size="small" stripe>
        <el-table-column prop="policyNo" label="保单号" width="160" />
        <el-table-column prop="holderName" label="投保人" width="100" />
        <el-table-column prop="productName" label="产品" />
        <el-table-column prop="premium" label="保费" width="120">
          <template #default="{ row }">
            ¥{{ row.premium.toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <TiStatusTag :value="row.status" :label="row.statusLabel" />
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="投保时间" width="160" />
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import { getDashboardStats, getPremiumTrend, getInsuranceDistribution } from '@/api/dashboard'
import type { DashboardStatsVO, TrendPoint, DistributionItem } from '@/api/dashboard'

const currentDate = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
})

// ---- KPI 卡片 ----
interface KpiCard {
  label: string
  value: string
  color: string
}

const kpiCards = ref<KpiCard[]>([
  { label: '今日保费', value: '-', color: '#1a3a6b' },
  { label: '今日新增保单', value: '-', color: '#67c23a' },
  { label: '活跃保单数', value: '-', color: '#4a7cc9' },
  { label: '待处理理赔', value: '-', color: '#e6a23c' },
  { label: '处理中保全', value: '-', color: '#9b59b6' },
  { label: '待核保工单', value: '-', color: '#f56c6c' },
])

/** mock 指标兜底数据 */
const MOCK_STATS: DashboardStatsVO = {
  todayPremium: 456789,
  todayPolicyCount: 123,
  activePolicyCount: 45678,
  pendingClaimCount: 23,
  processingMaintenanceCount: 12,
  pendingUnderwritingCount: 8,
}

const loadStats = async () => {
  let stats: DashboardStatsVO
  try {
    stats = await getDashboardStats()
  } catch {
    stats = MOCK_STATS
  }
  kpiCards.value[0].value = `¥${stats.todayPremium.toLocaleString()}`
  kpiCards.value[1].value = `${stats.todayPolicyCount} 份`
  kpiCards.value[2].value = stats.activePolicyCount.toLocaleString()
  kpiCards.value[3].value = `${stats.pendingClaimCount} 件`
  kpiCards.value[4].value = `${stats.processingMaintenanceCount} 件`
  kpiCards.value[5].value = `${stats.pendingUnderwritingCount} 件`
}

// ---- 最新保单（mock） ----
const recentPolicies = [
  { policyNo: 'POL20260718001', holderName: '张三', productName: '平安车险综合版', premium: 3860, status: 'ACTIVE', statusLabel: '生效中', createdAt: '2026-07-18 14:32' },
  { policyNo: 'POL20260718002', holderName: '李四', productName: '太平人寿终身险', premium: 12000, status: 'PENDING_PAYMENT', statusLabel: '待缴费', createdAt: '2026-07-18 13:55' },
  { policyNo: 'POL20260718003', holderName: '王五', productName: '宠物健康险标准版', premium: 680, status: 'ACTIVE', statusLabel: '生效中', createdAt: '2026-07-18 11:20' },
  { policyNo: 'POL20260718004', holderName: '赵六', productName: '意外险全保版', premium: 199, status: 'PROPOSAL', statusLabel: '投保中', createdAt: '2026-07-18 10:08' },
]

// ---- ECharts ----
const premiumChartRef = ref<HTMLElement>()
const categoryChartRef = ref<HTMLElement>()
let premiumChart: echarts.ECharts | null = null
let categoryChart: echarts.ECharts | null = null

/** mock 保费趋势兜底 */
const MOCK_TREND: TrendPoint[] = Array.from({ length: 30 }, (_, i) => ({
  date: `${i + 1}日`,
  value: Math.floor(Math.random() * 500000 + 300000),
}))

/** mock 险种分布兜底 */
const MOCK_DIST: DistributionItem[] = [
  { name: '车险', value: 42 },
  { name: '寿险', value: 28 },
  { name: '健康险', value: 16 },
  { name: '意外险', value: 8 },
  { name: '宠物险', value: 6 },
]

const CHART_COLORS = ['#1a3a6b', '#2d5aa0', '#4a7cc9', '#67c23a', '#e6a23c']

const initPremiumChart = async () => {
  if (!premiumChartRef.value) return
  premiumChart = echarts.init(premiumChartRef.value)
  let trend: TrendPoint[]
  try {
    trend = await getPremiumTrend()
  } catch {
    trend = MOCK_TREND
  }
  premiumChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { top: 10, right: 10, bottom: 20, left: 60 },
    xAxis: { type: 'category', data: trend.map((p) => p.date), axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `${(v / 10000).toFixed(0)}万` } },
    series: [{
      type: 'line', data: trend.map((p) => p.value), smooth: true,
      lineStyle: { color: '#1a3a6b' },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: 'rgba(26,58,107,0.3)' },
        { offset: 1, color: 'rgba(26,58,107,0.02)' },
      ])},
    }],
  })
}

const initCategoryChart = async () => {
  if (!categoryChartRef.value) return
  categoryChart = echarts.init(categoryChartRef.value)
  let dist: DistributionItem[]
  try {
    dist = await getInsuranceDistribution()
  } catch {
    dist = MOCK_DIST
  }
  categoryChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
    legend: { bottom: 0, itemWidth: 10, textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['40%', '68%'], center: ['50%', '42%'],
      data: dist.map((item, idx) => ({
        ...item,
        itemStyle: { color: CHART_COLORS[idx % CHART_COLORS.length] },
      })),
      label: { show: false },
    }],
  })
}

const handleResize = () => {
  premiumChart?.resize()
  categoryChart?.resize()
}

onMounted(async () => {
  // 并行加载指标和图表
  await Promise.all([loadStats(), initPremiumChart(), initCategoryChart()])
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  premiumChart?.dispose()
  categoryChart?.dispose()
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped lang="scss">
.dashboard {
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  &__title {
    font-size: 20px;
    font-weight: 700;
    color: #303133;
    margin: 0;
  }

  &__date {
    font-size: 13px;
    color: #909399;
  }

  &__kpi {
    margin-bottom: 16px;
  }

  &__charts {
    margin-bottom: 16px;
  }

  &__recent {
    .chart-title {
      margin-bottom: 12px;
    }
  }
}

.kpi-card {
  background: $card-bg;
  border-radius: $border-radius;
  box-shadow: $card-shadow;
  padding: 16px 20px;
  border-left: 4px solid;
  margin-bottom: 16px;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: $card-shadow-hover;
  }

  &__label {
    font-size: 13px;
    color: #909399;
    margin-bottom: 6px;
  }

  &__value {
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 4px;
  }
}

.chart-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.chart-container {
  height: 240px;
  margin-top: 8px;
}
</style>
