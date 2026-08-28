<template>
  <!-- 条款详情页 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>条款详情</h3>
        <TiStatusTag v-if="clause" :value="clause.status" />
        <div class="header-actions">
          <el-button type="primary" :icon="Edit" v-permission="'clause:edit'" @click="goEdit">编辑</el-button>
        </div>
      </div>

      <template v-if="clause">
        <!-- 基本信息 -->
        <el-divider content-position="left">基本信息</el-divider>
        <el-descriptions :column="3" border>
          <el-descriptions-item label="条款编码">{{ clause.code }}</el-descriptions-item>
          <el-descriptions-item label="条款名称">{{ clause.name }}</el-descriptions-item>
          <el-descriptions-item label="险种分类">{{ getCategoryLabel(clause.category) || clause.category || '-' }}</el-descriptions-item>
          <el-descriptions-item label="条款类型">{{ clauseTypeLabel(clause.clauseType) }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ clause.version || '-' }}</el-descriptions-item>
          <el-descriptions-item label="生效日期">{{ clause.effectiveDate || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ clause.createdAt || '-' }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ clause.updatedAt || '-' }}</el-descriptions-item>
          <el-descriptions-item label="条款描述" :span="3">{{ clause.description || '-' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 条款内容 -->
        <el-divider content-position="left">条款内容</el-divider>
        <div class="clause-content">{{ clause.content || '暂无条款正文' }}</div>

        <!-- 保障责任 -->
        <el-divider content-position="left">保障责任</el-divider>
        <el-table :data="coverages" v-loading="coverageLoading" border size="small">
          <el-table-column type="index" label="#" width="48" align="center" />
          <el-table-column prop="coverageName" label="保障责任" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.coverageName }}
              <el-tag v-if="row.isAdditional" size="small" type="warning" effect="plain" style="margin-left: 6px">附加</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="责任类型" width="90">
            <template #default="{ row }">{{ coverageTypeLabel(row.coverageType) }}</template>
          </el-table-column>
          <el-table-column label="赔付方式" width="110">
            <template #default="{ row }">{{ payoutTypeLabel(row.payoutType) }}</template>
          </el-table-column>
          <el-table-column label="保险金额" width="130">
            <template #default="{ row }">{{ coverageAmountText(row) }}</template>
          </el-table-column>
          <el-table-column label="赔付/给付细则" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">{{ coverageSummary(row) }}</template>
          </el-table-column>
          <template #empty>该条款暂未配置保障责任</template>
        </el-table>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Edit } from '@element-plus/icons-vue'
import { getClauseDetail, getCoverages, type ClauseVO, type CoverageVO } from '@/api/clause'
import { useDict } from '@/composables/useDict'
import TiStatusTag from '@/components/TiStatusTag/index.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const clause = ref<ClauseVO | null>(null)

const { getLabel: getCategoryLabel } = useDict('INSURANCE_CATEGORY')
const { getLabel: clauseTypeDictLabel } = useDict('CLAUSE_TYPE')
const { getLabel: coverageTypeDictLabel } = useDict('COVERAGE_TYPE')
const { getLabel: payoutTypeDictLabel } = useDict('PAYOUT_TYPE')

// —— 标签/格式化工具（后端枚举码 → 中文，空值统一占位 '-'，与条款编辑页同口径） ——
const clauseTypeLabel = (v?: string) => v ? clauseTypeDictLabel(v) : '-'
const coverageTypeLabel = (v?: string) => v ? coverageTypeDictLabel(v) : '-'
const payoutTypeLabel = (v?: string) => v ? payoutTypeDictLabel(v) : '-'

/** 保险金额展示：优先最高保额，退化到赔付上限/日津贴 */
const coverageAmountText = (row: CoverageVO): string => {
  if (row.coverageAmount != null) return `¥${Number(row.coverageAmount).toLocaleString()}`
  if (row.maxPayout != null) return `¥${Number(row.maxPayout).toLocaleString()}`
  if (row.dailyAmount != null) return `¥${Number(row.dailyAmount).toLocaleString()}/天`
  return '-'
}

/** 赔付/给付细则摘要（按赔付类型择取关键参数，与产品详情页一致） */
const coverageSummary = (row: CoverageVO): string => {
  const parts: string[] = []
  if (row.waitingPeriodDays != null) parts.push(`等待期${row.waitingPeriodDays}天`)
  if (row.payoutType === 'REIMBURSEMENT') {
    if (row.reimbursementRatio != null) parts.push(`社保内${row.reimbursementRatio * 100}%`)
    if (row.outSocialRatio != null) parts.push(`社保外${row.outSocialRatio * 100}%`)
    if (row.deductibleAmount != null) parts.push(`免赔${row.deductibleAmount}元`)
    if (row.maxPayout != null) parts.push(`上限${Number(row.maxPayout).toLocaleString()}元`)
  } else if (row.payoutType === 'PERIODIC') {
    if (row.dailyAmount != null) parts.push(`日津贴${row.dailyAmount}元`)
    if (row.deductibleDays != null) parts.push(`免赔${row.deductibleDays}天`)
    if (row.maxDaysPerClaim != null) parts.push(`每次${row.maxDaysPerClaim}天`)
    if (row.maxDaysTotal != null) parts.push(`累计${row.maxDaysTotal}天`)
  } else if (row.payoutType === 'PROPORTIONAL' && row.proportion != null) {
    parts.push(`比例${row.proportion * 100}%`)
  } else if (row.payoutType === 'ACTUAL_LOSS') {
    if (row.deductibleAmount != null) parts.push(`免赔${row.deductibleAmount}元`)
    if (row.maxPayout != null) parts.push(`上限${Number(row.maxPayout).toLocaleString()}元`)
  }
  return parts.join('、') || '-'
}

const coverages = ref<CoverageVO[]>([])
const coverageLoading = ref(false)

const goEdit = () => router.push(`/clause/edit/${route.params.id}`)

onMounted(async () => {
  const id = route.params.id as string
  loading.value = true
  try {
    clause.value = await getClauseDetail(id)
  } finally {
    loading.value = false
  }
  // 保障责任独立加载，失败不影响主信息展示
  coverageLoading.value = true
  try {
    coverages.value = (await getCoverages(id).catch(() => [])) ?? []
  } finally {
    coverageLoading.value = false
  }
})
</script>

<style scoped lang="scss">
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;

  h3 {
    margin: 0;
    font-size: 18px;
  }

  .header-actions {
    margin-left: auto;
  }
}

.clause-content {
  white-space: pre-wrap;
  line-height: 1.8;
  color: #606266;
  font-size: 14px;
  padding: 4px 2px;
}
</style>
