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
        <div v-for="card in metricCards" :key="card.label" class="metric-card">
          <div class="metric-card__label">{{ card.label }}</div>
          <div class="metric-card__value" :class="`metric-card__value--${card.color}`">
            {{ card.value }}
          </div>
          <div class="metric-card__trend" :class="card.trend > 0 ? 'up' : 'down'">
            {{ card.trend > 0 ? '▲' : '▼' }} {{ Math.abs(card.trend) }}%
          </div>
        </div>
      </div>

      <!-- ECharts 趋势图 -->
      <div class="data-panel__chart">
        <div class="data-panel__chart-title">近7日保费趋势</div>
        <div ref="chartRef" class="data-panel__chart-container" />
      </div>
    </div>
  </transition>

  <!-- 折叠时的展开按钮 -->
  <button v-if="collapsed" class="data-panel-collapsed" type="button" aria-label="展开实时数据面板" @click="$emit('expand')">
    <el-icon><DataLine /></el-icon>
  </button>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Close, DataLine } from '@element-plus/icons-vue'
import * as echarts from 'echarts'

interface Props {
  collapsed: boolean
}

defineProps<Props>()
defineEmits<{ collapse: []; expand: [] }>()

const chartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null
const resizeChart = () => chartInstance?.resize()

// 模拟指标数据
const metricCards = [
  { label: '今日保费', value: '¥1,234,567', trend: 12.5, color: 'primary' },
  { label: '本月保单', value: '8,901 份', trend: 8.3, color: 'success' },
  { label: '处理中理赔', value: '23 件', trend: -5.2, color: 'warning' },
  { label: '活跃客户', value: '45,678', trend: 3.1, color: 'info' },
]

// 初始化 ECharts 趋势图
const initChart = () => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)

  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const data = [820000, 932000, 901000, 1254000, 1190000, 1330000, 1234567]

  chartInstance.setOption({
    tooltip: { trigger: 'axis', formatter: (params: unknown[]) => {
      const p = params as { name: string; value: number }[]
      return `${p[0].name}<br/>保费: ¥${p[0].value.toLocaleString()}`
    }},
    grid: { top: 8, right: 8, bottom: 20, left: 50 },
    xAxis: {
      type: 'category',
      data: days,
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
      data,
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
  initChart()
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

  &__trend {
    font-size: 11px;

    &.up { color: $success-color; }
    &.down { color: $danger-color; }
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
