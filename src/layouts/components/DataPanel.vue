<template>
  <!-- 右侧数据看板面板（可折叠） -->
  <transition name="panel-slide">
    <div v-if="!collapsed" class="data-panel">
      <div class="data-panel__header">
        <span class="data-panel__title">实时数据</span>
        <el-button :icon="Close" text size="small" aria-label="关闭实时数据面板" @click="$emit('collapse')" />
      </div>

      <!-- 核心指标卡片 -->
      <div class="data-panel__cards">
        <el-skeleton v-if="loading" :rows="2" animated class="data-panel__skeleton" />
        <template v-else>
          <div v-for="card in metricCards" :key="card.label" class="metric-card">
            <div class="metric-card__label">{{ card.label }}</div>
            <div class="metric-card__value" :class="`metric-card__value--${card.color}`">
              {{ card.value }}
            </div>
          </div>
        </template>
      </div>

      <!-- 指标加载失败：显式提示 + 重试，不得以 0 或占位数字冒充真实数据 -->
      <el-alert
        v-if="errorMessage"
        class="data-panel__error"
        type="warning"
        :closable="false"
        show-icon
        :title="errorMessage"
      >
        <el-button text type="primary" size="small" @click="loadMetrics">重试</el-button>
      </el-alert>

      <!-- ECharts 趋势图 -->
      <div class="data-panel__chart">
        <div class="data-panel__chart-title">近7日保费趋势</div>
        <div v-if="!trendPoints.length && !loading" class="data-panel__empty">暂无保费数据</div>
        <div v-show="trendPoints.length" ref="chartRef" class="data-panel__chart-container" />
      </div>
    </div>
  </transition>

  <!-- 折叠时的展开按钮 -->
  <button v-if="collapsed" class="data-panel-collapsed" type="button" aria-label="展开实时数据面板" @click="$emit('expand')">
    <el-icon><DataLine /></el-icon>
  </button>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { Close, DataLine } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { getDashboardStats, getPremiumTrend, type DashboardStatsVO, type TrendPoint } from '@/api/dashboard'

interface Props {
  collapsed: boolean
}

defineProps<Props>()
defineEmits<{ collapse: []; expand: [] }>()

const chartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null
const resizeChart = () => chartInstance?.resize()

const loading = ref(false)
const errorMessage = ref('')
const stats = ref<DashboardStatsVO | null>(null)
const trendPoints = ref<TrendPoint[]>([])

/** 金额千分位展示；后端未返回时显示占位符而非 0，避免把「无数据」画成「零保费」 */
const formatAmount = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `¥${value.toLocaleString('zh-CN')}`

const formatCount = (value: number | null | undefined, unit: string) =>
  value === null || value === undefined ? '—' : `${value.toLocaleString('zh-CN')} ${unit}`

/** 指标卡取自真实聚合接口，标签与后端字段语义一一对应（不夸大统计口径） */
const metricCards = computed(() => [
  { label: '今日保费', value: formatAmount(stats.value?.todayPremium), color: 'primary' },
  { label: '今日保单', value: formatCount(stats.value?.todayPolicyCount, '份'), color: 'success' },
  { label: '待处理理赔', value: formatCount(stats.value?.pendingClaimCount, '件'), color: 'warning' },
  { label: '待核保', value: formatCount(stats.value?.pendingUnderwritingCount, '件'), color: 'info' },
])

/** 拉取核心指标；失败时显式提示并可重试，不回落为任何编造数值 */
const loadMetrics = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    stats.value = await getDashboardStats()
  } catch {
    stats.value = null
    errorMessage.value = '指标数据加载失败'
  } finally {
    loading.value = false
  }
}

/** 拉取近 7 日保费趋势并渲染；无数据时展示空态而不是虚构曲线 */
const loadTrend = async () => {
  try {
    const points = await getPremiumTrend()
    trendPoints.value = (points || []).slice(-7)
    await nextTick()
    if (trendPoints.value.length) initChart()
  } catch {
    trendPoints.value = []
  }
}

// 初始化 ECharts 趋势图（数据全部来自计费域 statistics，无内置常量）
const initChart = () => {
  if (!chartRef.value) return
  chartInstance?.dispose()
  chartInstance = echarts.init(chartRef.value)

  chartInstance.setOption({
    tooltip: { trigger: 'axis', formatter: (params: unknown[]) => {
      const p = params as { name: string; value: number }[]
      return `${p[0].name}<br/>保费: ¥${p[0].value.toLocaleString()}`
    }},
    grid: { top: 8, right: 8, bottom: 20, left: 50 },
    xAxis: {
      type: 'category',
      data: trendPoints.value.map((point) => point.date),
      axisLabel: { fontSize: 10, color: '#909399' },
      axisLine: { lineStyle: { color: '#ebeef5' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        fontSize: 10,
        color: '#909399',
        formatter: (v: number) => `${(v / 10000).toFixed(0)}万`,
      },
      splitLine: { lineStyle: { color: '#ebeef5', type: 'dashed' } },
    },
    series: [{
      type: 'line',
      data: trendPoints.value.map((point) => point.value),
      smooth: true,
      lineStyle: { color: '#1a3a6b', width: 2 },
      itemStyle: { color: '#1a3a6b' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(26,58,107,0.3)' },
          { offset: 1, color: 'rgba(26,58,107,0.02)' },
        ]),
      },
    }],
  })
}

onMounted(() => {
  loadMetrics()
  loadTrend()
  window.addEventListener('resize', resizeChart)
})

onUnmounted(() => {
  chartInstance?.dispose()
  window.removeEventListener('resize', resizeChart)
})
</script>

<style scoped lang="scss">
.data-panel {
  width: $data-panel-width;
  height: 100%;
  background: $card-bg;
  border-left: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid $border-color;
    height: $topbar-height;
  }

  &__title {
    font-size: 15px;
    font-weight: 600;
    color: #303133;
  }

  &__cards {
    padding: 12px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  &__skeleton {
    grid-column: 1 / -1;
  }

  &__error {
    margin: 0 12px 8px;
  }

  &__empty {
    flex: 1;
    min-height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: #909399;
  }

  &__chart {
    padding: 0 12px 12px;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  &__chart-title {
    font-size: 13px;
    color: #606266;
    margin-bottom: 8px;
    font-weight: 500;
  }

  &__chart-container {
    flex: 1;
    min-height: 140px;
  }
}

.metric-card {
  background: #f8faff;
  border-radius: 8px;
  padding: 10px 12px;
  border: 1px solid #e8eef8;

  &__label {
    font-size: 11px;
    color: #909399;
    margin-bottom: 4px;
  }

  &__value {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 2px;

    &--primary { color: $primary-color; }
    &--success { color: $success-color; }
    &--warning { color: $warning-color; }
    &--info { color: #606266; }
  }
}

.data-panel-collapsed {
  width: 32px;
  height: 100%;
  background: #f5f7fa;
  border-left: 1px solid $border-color;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  color: #909399;
  transition: background 0.2s;

  &:hover {
    background: #e8eef8;
    color: $primary-color;
  }
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: width 0.3s ease, opacity 0.2s ease;
  overflow: hidden;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  width: 0;
  opacity: 0;
}
</style>
