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
        <!-- 色值全部由 SCSS 的 .kpi-card--* 决定，此处只给标识（模板不出现任何色值字面量） -->
        <div class="kpi-card" :class="`kpi-card--${kpi.tone}`">
          <div class="kpi-card__label">{{ kpi.label }}</div>
          <div class="kpi-card__value">{{ kpi.value }}</div>
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
        <el-table-column prop="premium" label="保费" width="120" align="right">
          <template #default="{ row }">{{ formatAmount(row.premium) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <TiStatusTag :value="row.status" :label="policyStatusLabel(row.status)" />
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="投保时间" width="160">
          <!-- 时间列统一走全局日期工具，避免直出后端 ISO 串（2026-09-18 全站实测 7 页 8 列） -->
          <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { cssVar } from '@/utils/cssVar'
import { formatDateTime } from '@/utils/date'
import { formatAmount } from '@/utils/format'
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
/** 强调色标识；取值必须是 .kpi-card--* 样式块里存在的档位（色值真源在 SCSS，此处不得写色值） */
type KpiTone = 'primary' | 'success' | 'accent' | 'warning' | 'violet' | 'danger'

interface KpiCard {
  label: string
  value: string
  tone: KpiTone
}

/**
 * 取数失败时保持占位符「-」，绝不以编造数值顶替。
 * 🔴 数组**顺序即下方 loadStats 的取值下标**（value[0..5] 逐个赋给对应卡），
 *    调整顺序必须同步改那段赋值，否则会把数字显示到错误的卡上（见 ROUND3 N11）。
 */
const kpiCards = ref<KpiCard[]>([
  { label: '今日保费', value: '-', tone: 'primary' },
  { label: '今日新增保单', value: '-', tone: 'success' },
  { label: '活跃保单数', value: '-', tone: 'accent' },
  { label: '待处理理赔', value: '-', tone: 'warning' },
  { label: '处理中保全', value: '-', tone: 'violet' },
  { label: '待核保工单', value: '-', tone: 'danger' },
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
  kpiCards.value[0].value = formatAmount(stats.todayPremium)
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

/**
 * 饼图配色。ECharts 画到 canvas，拿不到 CSS 级联（`var()` 不会被解析），必须给字面值。
 * 用函数而非 const：模块求值早于样式表就绪，那时取值会得到空串。
 * 🔴 五个色全部来自 CSS 变量——品牌色阶（--ti-primary*）与 EP 语义色一视同仁。
 *    此前前 3 个写死为 #1a3a6b/#2d5aa0/#4a7cc9（即 $primary-color/-light/-lighter 的拷贝），
 *    改主色时饼图会保持旧色（ROUND3 F11）。
 */
const chartColors = () => [
  cssVar('--ti-primary'),
  cssVar('--ti-primary-light'),
  cssVar('--ti-primary-lighter'),
  cssVar('--el-color-success'),
  cssVar('--el-color-warning'),
]

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
      lineStyle: { color: cssVar('--ti-primary') },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: `rgba(${cssVar('--el-color-primary-rgb')}, 0.3)` },
        { offset: 1, color: `rgba(${cssVar('--el-color-primary-rgb')}, 0.02)` },
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
        itemStyle: { color: chartColors()[idx % chartColors().length] },
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
    // 页面主标题统一 $font-size-xl（18px）：与详情页头 TiDetailHeader__title 及
    // 其余页面裸 h2 同档，此前此处单独写死 20px 是第三档字号（2026-09-18 实测全站 18/20/22 三档并存）
    font-size: $font-size-xl;
    font-weight: 700;
    color: $text-primary;
    margin: 0;
  }

  &__date {
    font-size: 13px;
    color: $text-secondary;
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
  // 强调色来自下方 .kpi-card--* 设置的局部变量；缺省落到 currentColor 而非透明
  border-left: 4px solid var(--kpi-accent, currentColor);
  margin-bottom: 16px;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: $card-shadow-hover;
  }

  &__label {
    font-size: 13px;
    color: $text-secondary;
    margin-bottom: 6px;
  }

  &__value {
    font-size: $font-size-2xl;
    font-weight: 700;
    margin-bottom: 4px;
    // 文字色与强调色**必须分开取值**：正是这里此前两者同源，导致 4 个数值低于 AA
    color: var(--kpi-value, currentColor);
  }
}

// ═══════════════════════════════════════════════════════════════
// KPI 卡分类强调色（6 档）
//
// 🔴 为什么色值必须搬出模板：此前 6 个色值写在 JS 数组里，其中 3 个是**字面量**
//    （#1a3a6b / #4a7cc9 / #9b59b6，绕过令牌）、3 个是 **EP 语义变量**
//    （--el-color-success 等，借用了语义色去表达纯装饰的分类）。两者都不该出现在模板层。
//
// 🔴 为什么「强调色」与「数值文字色」是两个值而不是一个（本轮实测，白底 #ffffff）：
//      强调色本体    success 2.24 ｜ warning 2.19 ｜ danger 2.90 ｜ primary-lighter 4.19   ← 全部低于 4.5
//      派生文字色    #294e17 9.56 ｜ #5c4118 9.44 ｜ #622b2b 11.05 ｜ #2c4b79 8.79
//    4px 左边框是纯装饰（无对比度要求），可以保留跳脱的本体色；
//    22px 加粗的**数值是要读的数据**，必须达 AA。同源使用即「按色种处理」的老路。
//
// 🔴 派生规则统一为 mix(#000, 本体, 40%)，与 variables.scss 的 $success-text 族同式；
//    取 40% 是因为它在四种底色上都留有余量（实测最紧的 $text-secondary 也只用到 40%）。
//    本体已达标者（primary 11.28 / violet 4.67）直接用本体，避免无谓加深、保留色相辨识度。
//
// 🔴 写成 map + @each 而非 6 条并列规则：同一属性在 N 个变体上成立时，并列写法必然漏第 N+1 个
//    ——「语义色当文字用」这一族在本轮已是**第 4 次**复发（el-tag → 下拉项 → 链接按钮 → 本处）。
//    前三次都在 CSS 选择器层，只有本处在 JS 数据层，故 @each 覆盖不到它；搬进来即可被同一个循环管住。
//    新增强调色只需在此表加一行，不再有「模板里漏改一处」的形态。
// ═══════════════════════════════════════════════════════════════
$kpi-tones:
  primary $primary-color $primary-color,
  success $success-color $success-text,
  accent $primary-lighter mix(#000000, $primary-lighter, 40%),
  warning $warning-color $warning-text,
  violet $accent-violet $accent-violet,
  danger $danger-color $danger-text;

@each $tone, $accent, $value-text in $kpi-tones {
  // 双写类名抬特异性：本条要压过上方 .kpi-card 的缺省值，且不依赖产物字节序
  .kpi-card.kpi-card--#{$tone} {
    --kpi-accent: #{$accent};
    --kpi-value: #{$value-text};
  }
}

.chart-title {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
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
  color: $text-secondary;
  background: #fafbfc;
  border-radius: $border-radius;
}
</style>
