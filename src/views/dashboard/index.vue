<template>
  <!-- 数据看板首页 -->
  <div class="ti-page dashboard">
    <div class="dashboard__header">
      <h2 class="dashboard__title">数据看板</h2>
      <span class="dashboard__date">{{ currentDate }}</span>
    </div>

    <!-- 指标加载失败：显式提示 + 重试，不得以编造数值冒充真实数据 -->
    <el-alert
      v-if="statsError"
      class="dashboard__error"
      type="warning"
      :closable="false"
      show-icon
      title="看板指标加载失败，当前不展示任何数值"
    >
      <el-button text type="primary" size="small" @click="loadStats">重试</el-button>
    </el-alert>

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
          <div v-if="premiumEmpty" class="chart-empty">暂无保费数据</div>
          <div v-show="!premiumEmpty" ref="premiumChartRef" class="chart-container" />
        </div>
      </el-col>
      <el-col :sm="8">
        <div class="ti-card">
          <div class="chart-title">险种分布</div>
          <div v-if="categoryEmpty" class="chart-empty">暂无险种分布数据</div>
          <div v-show="!categoryEmpty" ref="categoryChartRef" class="chart-container" />
        </div>
      </el-col>
    </el-row>

    <!-- 最新保单（取自保单列表接口的首页数据，按创建时间倒序） -->
    <div class="ti-card dashboard__recent">
      <div class="chart-title">最新保单</div>
      <el-table v-loading="recentLoading" :data="recentPolicies" size="small" stripe>
        <template #empty>暂无保单数据</template>
        <el-table-column prop="policyNo" label="保单号" width="160" />
        <el-table-column prop="policyHolderName" label="投保人" width="100" />
        <el-table-column prop="productName" label="产品" />
        <el-table-column prop="premium" label="保费" width="120">
          <template #default="{ row }">¥{{ (row.premium ?? 0).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <TiStatusTag :value="row.status" :label="policyStatusLabel(row.status)" />
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="投保时间" width="160" />
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
import { getPolicyList } from '@/api/policy'
import { useDict } from '@/composables/useDict'
import type { PolicyVO } from '@/types/business.d'

const currentDate = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
})

const { getLabel: policyStatusLabel } = useDict('POLICY_STATUS')

// ---- KPI 卡片 ----
interface KpiCard {
  label: string
  value: string
  color: string
}

/** 取数失败时保持占位符「-」，绝不以编造数值顶替 */
const kpiCards = ref<KpiCard[]>([
  { label: '今日保费', value: '-', color: '#1a3a6b' },
  { label: '今日新增保单', value: '-', color: '#67c23a' },
  { label: '活跃保单数', value: '-', color: '#4a7cc9' },
  { label: '待处理理赔', value: '-', color: '#e6a23c' },
  { label: '处理中保全', value: '-', color: '#9b59b6' },
  { label: '待核保工单', value: '-', color: '#f56c6c' },
])

const statsError = ref(false)

const loadStats = async () => {
  statsError.value = false
  let stats: DashboardStatsVO
  try {
    stats = await getDashboardStats()
  } catch {
    // 失败即空态：置错误标记并保持占位符，不伪造任何数字
    statsError.value = true
    kpiCards.value = kpiCards.value.map((card) => ({ ...card, value: '-' }))
    return
  }
  kpiCards.value[0].value = `¥${(stats.todayPremium ?? 0).toLocaleString()}`
  kpiCards.value[1].value = `${stats.todayPolicyCount ?? 0} 份`
  kpiCards.value[2].value = (stats.activePolicyCount ?? 0).toLocaleString()
  kpiCards.value[3].value = `${stats.pendingClaimCount ?? 0} 件`
  kpiCards.value[4].value = `${stats.processingMaintenanceCount ?? 0} 件`
  kpiCards.value[5].value = `${stats.pendingUnderwritingCount ?? 0} 件`
}

// ---- 最新保单（真实接口，不再硬编码示例行） ----
const recentPolicies = ref<PolicyVO[]>([])
const recentLoading = ref(false)

const RECENT_POLICY_LIMIT = 5

const loadRecentPolicies = async () => {
  recentLoading.value = true
  try {
    const page = await getPolicyList({ pageNum: 1, pageSize: RECENT_POLICY_LIMIT })
    recentPolicies.value = page.list.slice(0, RECENT_POLICY_LIMIT)
  } catch {
    recentPolicies.value = []
  } finally {
    recentLoading.value = false
  }
}

// ---- ECharts ----
const premiumChartRef = ref<HTMLElement>()
const categoryChartRef = ref<HTMLElement>()
let premiumChart: echarts.ECharts | null = null
let categoryChart: echarts.ECharts | null = null

const premiumEmpty = ref(false)
const categoryEmpty = ref(false)

const CHART_COLORS = ['#1a3a6b', '#2d5aa0', '#4a7cc9', '#67c23a', '#e6a23c']

const initPremiumChart = async () => {
  if (!premiumChartRef.value) return
  let trend: TrendPoint[]
  try {
    trend = await getPremiumTrend()
  } catch {
    // 取数失败 → 空态，而不是画一条虚构曲线误导运营判断
    premiumEmpty.value = true
    return
  }
  if (!trend?.length) {
    premiumEmpty.value = true
    return
  }
  premiumEmpty.value = false
  premiumChart = echarts.init(premiumChartRef.value)
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
  let dist: DistributionItem[]
  try {
    dist = await getInsuranceDistribution()
  } catch {
    categoryEmpty.value = true
    return
  }
  if (!dist?.length) {
    categoryEmpty.value = true
    return
  }
  categoryEmpty.value = false
  categoryChart = echarts.init(categoryChartRef.value)
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
  // 并行加载指标、图表与最新保单
  await Promise.all([loadStats(), initPremiumChart(), initCategoryChart(), loadRecentPolicies()])
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

  &__error {
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

/* 无数据时的显式空态：与「有数据」在视觉上明确区分 */
.chart-empty {
  height: 240px;
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #909399;
  background: #fafbfc;
  border-radius: $border-radius;
}
</style>
