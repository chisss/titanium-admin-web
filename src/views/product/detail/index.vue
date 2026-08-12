<template>
  <!-- 产品详情页 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>产品详情</h3>
        <TiStatusTag v-if="product" :value="product.status" :label="getStatusLabel(product.status)" />
        <div class="detail-header__actions">
          <el-button
            v-if="product?.templateId"
            type="primary"
            :icon="Setting"
            v-permission="'product:config'"
            @click="goConfig"
          >
            配置模板
          </el-button>
        </div>
      </div>

      <template v-if="product">
        <!-- 基本信息 -->
        <el-divider content-position="left">基本信息</el-divider>
        <el-descriptions :column="3" border>
          <el-descriptions-item label="产品名称">{{ product.name }}</el-descriptions-item>
          <el-descriptions-item label="产品代码">{{ product.code }}</el-descriptions-item>
          <el-descriptions-item label="险种分类">{{ getCategoryLabel(product.category) || product.category }}</el-descriptions-item>
          <el-descriptions-item label="产品形态">{{ formLabel(product.form) }}</el-descriptions-item>
          <el-descriptions-item label="产品类别">{{ productCategoryLabel(product.productCategory) }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ product.version || '-' }}</el-descriptions-item>
          <el-descriptions-item label="所属模板">{{ product.templateId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建人">{{ product.createdBy || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(product.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="生效时间">{{ formatDateTime(product.effectiveTime) }}</el-descriptions-item>
          <el-descriptions-item label="销售起期">{{ formatDate(product.saleStartTime) }}</el-descriptions-item>
          <el-descriptions-item label="销售止期">{{ formatDate(product.saleEndTime) }}</el-descriptions-item>
          <el-descriptions-item label="产品描述" :span="3">{{ product.description || '-' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 投保条件 -->
        <el-divider content-position="left">投保条件</el-divider>
        <el-descriptions :column="3" border>
          <el-descriptions-item label="投保年龄">{{ ageRange }}</el-descriptions-item>
          <el-descriptions-item label="投保人数">{{ groupSizeRange }}</el-descriptions-item>
          <el-descriptions-item label="保额区间">{{ insuredAmountRange }}</el-descriptions-item>
          <el-descriptions-item label="等待期">{{ days(product.insureCondition?.waitingPeriodDays) }}</el-descriptions-item>
          <el-descriptions-item label="犹豫期">{{ days(product.insureCondition?.hesitationPeriodDays) }}</el-descriptions-item>
          <el-descriptions-item label="健康告知" :span="3">{{ product.insureCondition?.healthNotice || '-' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 费率规则 -->
        <el-divider content-position="left">费率规则</el-divider>
        <el-descriptions :column="3" border>
          <el-descriptions-item label="定价模式">{{ pricingModeLabel(product.pricingMode) }}</el-descriptions-item>
          <el-descriptions-item label="定价类型">{{ pricingTypeLabel(product.pricingBasicRule?.pricingType) }}</el-descriptions-item>
          <el-descriptions-item label="基础费率">{{ rate(product.pricingBasicRule?.baseRate) }}</el-descriptions-item>
          <el-descriptions-item label="最低保费">{{ money(product.pricingBasicRule?.minPremium) }}</el-descriptions-item>
          <el-descriptions-item label="最高保费">{{ money(product.pricingBasicRule?.maxPremium) }}</el-descriptions-item>
        </el-descriptions>

        <!-- 模板行为配置（出单/保全/理赔/缴费/再保/分红），随模板加载 -->
        <template v-if="template">
          <el-divider content-position="left">出单与流程配置</el-divider>
          <el-descriptions :column="3" border>
            <el-descriptions-item label="出单模式">{{ issuanceModeLabel(template.issuanceMode) }}</el-descriptions-item>
            <el-descriptions-item label="模板名称">{{ template.templateName || '-' }}</el-descriptions-item>
            <el-descriptions-item label="模板编码">{{ template.templateCode || '-' }}</el-descriptions-item>
          </el-descriptions>

          <el-divider content-position="left">保全配置（可支持保全项）</el-divider>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="可支持保全项">
              <template v-if="template.maintenanceConfig?.allowedTypes?.length">
                <el-tag
                  v-for="t in template.maintenanceConfig.allowedTypes"
                  :key="t"
                  size="small"
                  effect="plain"
                  style="margin: 2px 6px 2px 0"
                >
                  {{ maintenanceTypeLabel(t) }}
                </el-tag>
              </template>
              <span v-else>-</span>
            </el-descriptions-item>
          </el-descriptions>
          <el-descriptions :column="3" border>
            <el-descriptions-item label="犹豫期">{{ days(template.maintenanceConfig?.freeLookPeriodDays) }}</el-descriptions-item>
            <el-descriptions-item label="退保规则集">{{ template.maintenanceConfig?.surrenderRuleSet || '-' }}</el-descriptions-item>
            <el-descriptions-item label="批改规则集">{{ template.maintenanceConfig?.endorsementRuleSet || '-' }}</el-descriptions-item>
          </el-descriptions>

          <el-divider content-position="left">理赔配置</el-divider>
          <el-descriptions :column="3" border>
            <el-descriptions-item label="理赔阶段" :span="3">
              {{ template.claimConfig?.claimStages?.join(' → ') || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="报案时效">{{ days(template.claimConfig?.reportDeadlineDays) }}</el-descriptions-item>
            <el-descriptions-item label="等待期">{{ days(template.claimConfig?.waitingPeriodDays) }}</el-descriptions-item>
            <el-descriptions-item label="理赔规则集">{{ template.claimConfig?.claimRuleSet || '-' }}</el-descriptions-item>
            <el-descriptions-item label="所需材料" :span="3">
              {{ template.claimConfig?.requiredDocuments?.join('、') || '-' }}
            </el-descriptions-item>
          </el-descriptions>

          <el-divider content-position="left">缴费配置</el-divider>
          <el-descriptions :column="3" border>
            <el-descriptions-item label="允许缴费方式" :span="3">
              {{ paymentModesText(template.billingConfig?.allowedPaymentModes) }}
            </el-descriptions-item>
            <el-descriptions-item label="宽限期">{{ days(template.billingConfig?.gracePeriodDays) }}</el-descriptions-item>
            <el-descriptions-item label="失效天数">{{ days(template.billingConfig?.lapseAfterDays) }}</el-descriptions-item>
            <el-descriptions-item label="自动扣款">{{ boolText(template.billingConfig?.autoDeductEnabled) }}</el-descriptions-item>
          </el-descriptions>

          <template v-if="template.dividendConfig?.distribution">
            <el-divider content-position="left">分红配置</el-divider>
            <el-descriptions :column="4" border>
              <el-descriptions-item label="红利分配方式">{{ dividendLabel(template.dividendConfig.distribution) }}</el-descriptions-item>
              <el-descriptions-item label="低档演示利率">{{ pct(template.dividendConfig.lowDemoRate) }}</el-descriptions-item>
              <el-descriptions-item label="中档演示利率">{{ pct(template.dividendConfig.midDemoRate) }}</el-descriptions-item>
              <el-descriptions-item label="高档演示利率">{{ pct(template.dividendConfig.highDemoRate) }}</el-descriptions-item>
            </el-descriptions>
          </template>
        </template>

        <!-- 寿险规格（保额管理），寿险线才展示且已配置 -->
        <template v-if="lifeSpec">
          <el-divider content-position="left">保额管理（寿险规格）</el-divider>
          <el-descriptions :column="3" border>
            <el-descriptions-item label="险种三级分类">{{ productTypeLabel(lifeSpec.productType) }}</el-descriptions-item>
            <el-descriptions-item label="投保年龄">{{ lifeAgeRange }}</el-descriptions-item>
            <el-descriptions-item label="基本保额">{{ lifeSumRange }}</el-descriptions-item>
            <el-descriptions-item label="缴费期选项" :span="3">
              {{ lifeSpec.premiumTermOptions?.map((o) => o.description || (o.years ? o.years + '年' : '趸缴')).join('、') || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="保障期选项" :span="3">
              {{ lifeSpec.coverageTermOptions?.map((o) => o.description || (o.wholeLife ? '终身' : o.years + '年')).join('、') || '-' }}
            </el-descriptions-item>
          </el-descriptions>
        </template>

        <!-- 条款与保障责任（电子保单形态） -->
        <el-divider content-position="left">条款与保障责任</el-divider>
        <div v-loading="clauseLoading">
          <el-empty v-if="!clauseLoading && clauseGroups.length === 0" description="该产品暂无绑定条款" :image-size="80" />
          <el-collapse v-else v-model="activeClauses">
            <el-collapse-item v-for="group in clauseGroups" :key="group.clauseId" :name="group.clauseId">
              <template #title>
                <div class="clause-title">
                  <el-tag v-if="group.mainClause" type="danger" size="small" effect="plain">主条款</el-tag>
                  <el-tag v-else type="info" size="small" effect="plain">附加条款</el-tag>
                  <span class="clause-name">{{ group.clauseName }}</span>
                  <span class="clause-meta">{{ group.clauseCode }} · {{ group.clauseVersion || '-' }} · {{ group.coverages.length }} 项保障</span>
                </div>
              </template>

              <el-table :data="group.coverages" border size="small" class="coverage-table">
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

              <p v-if="group.description" class="clause-desc">{{ group.description }}</p>
            </el-collapse-item>
          </el-collapse>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Setting } from '@element-plus/icons-vue'
import {
  getProductDetail,
  getProductClauses,
  getTemplate,
  getLifeProductConfig,
  type ProductTemplateVO,
  type ConfigureLifeProductRequest,
} from '@/api/product'
import { getClauseDetail, getCoverages, type CoverageVO } from '@/api/clause'
import { useDict } from '@/composables/useDict'
import { formatDateTime, formatDate } from '@/utils/date'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import type { ProductDetailVO } from '@/types/business.d'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const product = ref<ProductDetailVO | null>(null)
const template = ref<ProductTemplateVO | null>(null)
const lifeSpec = ref<ConfigureLifeProductRequest | null>(null)

const goConfig = () => router.push(`/product/config/${route.params.id}`)

const { getLabel: getCategoryLabel } = useDict('INSURANCE_CATEGORY')
const { getLabel: getStatusLabel } = useDict('PRODUCT_STATUS')

// —— 标签/格式化工具（后端枚举码 → 中文，空值统一占位 '-'） ——
const formLabel = (v?: string) => (v === 'GROUP' ? '团险' : v === 'INDIVIDUAL' ? '个险' : v || '-')
const productCategoryLabel = (v?: string) => (v === 'MAIN' ? '主险' : v === 'RIDER' ? '附加险' : v || '-')
const pricingModeLabel = (v?: string) =>
  v === 'RATE_TABLE' ? '费率表查询' : v === 'ACTUARIAL_FORMULA' ? '精算公式' : v || '-'
const pricingTypeLabel = (v?: string) =>
  v === 'FIXED' ? '固定费率' : v === 'STEP' ? '阶梯费率' : v === 'FACTOR' ? '因子定价' : v || '-'
const days = (v?: number) => (v != null ? `${v} 天` : '-')
const boolText = (v?: boolean) => (v == null ? '-' : v ? '是' : '否')
const pct = (v?: number) => (v != null ? `${(v * 100).toFixed(2)}%` : '-')

// —— 模板行为配置枚举码 → 中文 ——
const ISSUANCE_MODES: Record<string, string> = {
  ONE_STEP: '一步出单',
  TWO_STEP: '两步出单',
  THREE_STEP: '三步出单',
  CUSTOM: '自定义出单',
}
const MAINTENANCE_TYPES: Record<string, string> = {
  POLICY_HOLDER_CHANGE: '投保人变更',
  BENEFICIARY_CHANGE: '受益人变更',
  PAYMENT_METHOD_CHANGE: '缴费方式变更',
  ADDITIONAL_PAYMENT: '增额缴费',
  REDUCTION_PAYMENT: '减额缴费',
  POLICY_SUSPENSION: '保单中止',
  POLICY_RESUMPTION: '保单复效',
  POLICY_TERMINATION: '保单终止',
  POLICY_INFO_CHANGE: '保单信息变更',
  POLICY_PERIOD_CHANGE: '保险期间变更',
  COVERAGE_AMOUNT_CHANGE: '保额变更',
  INSURED_INFO_CHANGE: '被保人信息变更',
  SUBJECT_CHANGE: '标的变更',
  COVERAGE_CHANGE: '保障责任变更',
  PARTIAL_WITHDRAWAL: '部分领取',
  TOP_UP: '追加保费',
  POLICY_LOAN: '保单贷款',
  LOAN_REPAYMENT: '保单贷款还款',
  REDUCED_PAID_UP: '减额缴清',
}
const PAYMENT_MODES: Record<string, string> = {
  LUMP_SUM: '趸缴',
  ANNUAL: '年缴',
  SEMI_ANNUAL: '半年缴',
  QUARTERLY: '季缴',
  MONTHLY: '月缴',
}
const DIVIDEND_DISTRIBUTIONS: Record<string, string> = {
  CASH: '现金红利',
  ACCUMULATION: '累积生息',
  PAID_UP_ADDITION: '购买交清增额',
  PREMIUM_OFFSET: '抵缴保费',
}
const PRODUCT_TYPES: Record<string, string> = {
  TERM_LIFE: '定期寿险',
  WHOLE_LIFE: '终身寿险',
  ENDOWMENT: '两全保险',
  ANNUITY: '年金保险',
}
const issuanceModeLabel = (v?: string) => (v ? ISSUANCE_MODES[v] ?? v : '-')
const maintenanceTypeLabel = (v?: string) => (v ? MAINTENANCE_TYPES[v] ?? v : v)
const dividendLabel = (v?: string) => (v ? DIVIDEND_DISTRIBUTIONS[v] ?? v : '-')
const productTypeLabel = (v?: string) => (v ? PRODUCT_TYPES[v] ?? v : '-')
const paymentModesText = (list?: string[]) =>
  list && list.length ? list.map((m) => PAYMENT_MODES[m] ?? m).join('、') : '-'
const rate = (v?: number) => (v != null ? v.toString() : '-')
const money = (v?: number) => (v != null ? `¥${v.toLocaleString()}` : '-')
const rangeText = (min?: number, max?: number, unit = '') => {
  if (min == null && max == null) return '-'
  return `${min ?? '不限'} ~ ${max ?? '不限'}${unit}`
}

const ageRange = computed(() => rangeText(product.value?.insureCondition?.minAge, product.value?.insureCondition?.maxAge, ' 岁'))
const groupSizeRange = computed(() =>
  rangeText(product.value?.insureCondition?.minGroupSize, product.value?.insureCondition?.maxGroupSize, ' 人'),
)
const insuredAmountRange = computed(() => {
  const min = product.value?.insureCondition?.minInsuredAmount
  const max = product.value?.insureCondition?.maxInsuredAmount
  if (min == null && max == null) return '-'
  return `${min != null ? '¥' + min.toLocaleString() : '不限'} ~ ${max != null ? '¥' + max.toLocaleString() : '不限'}`
})

// 寿险规格区间展示
const lifeAgeRange = computed(() =>
  rangeText(lifeSpec.value?.entryAgeRange?.minAge, lifeSpec.value?.entryAgeRange?.maxAge, ' 岁'),
)
const lifeSumRange = computed(() => {
  const min = lifeSpec.value?.sumInsuredRange?.minSumInsured
  const max = lifeSpec.value?.sumInsuredRange?.maxSumInsured
  if (min == null && max == null) return '-'
  return `${min != null ? '¥' + min.toLocaleString() : '不限'} ~ ${max != null ? '¥' + max.toLocaleString() : '不限'}`
})

// —— 条款与保障责任（对齐条款编辑页的责任/赔付类型口径） ——
const COVERAGE_TYPES: Record<string, string> = {
  CRITICAL_ILLNESS: '重疾',
  MEDICAL: '医疗',
  ACCIDENT: '意外',
  DEATH: '身故',
}
const PAYOUT_TYPES: Record<string, string> = {
  REIMBURSEMENT: '报销',
  PROPORTIONAL: '比例赔付',
  ACTUAL_LOSS: '按损赔付',
  FIXED: '定额给付',
  PERIODIC: '周期给付/津贴',
}
const coverageTypeLabel = (v?: string) => (v ? COVERAGE_TYPES[v] ?? v : '-')
const payoutTypeLabel = (v?: string) => (v ? PAYOUT_TYPES[v] ?? v : '-')

/** 保险金额展示：优先最高保额，退化到赔付上限/日津贴 */
const coverageAmountText = (row: CoverageVO): string => {
  if (row.coverageAmount != null) return `¥${Number(row.coverageAmount).toLocaleString()}`
  if (row.maxPayout != null) return `¥${Number(row.maxPayout).toLocaleString()}`
  if (row.dailyAmount != null) return `¥${Number(row.dailyAmount).toLocaleString()}/天`
  return '-'
}

/** 赔付/给付细则摘要（按赔付类型择取关键参数，与条款编辑页一致） */
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

/** 单条款聚合视图：条款元信息 + 其保障责任清单 */
interface ClauseGroup {
  clauseId: string
  clauseCode: string
  clauseName: string
  clauseVersion?: string
  mainClause?: boolean
  description?: string
  coverages: CoverageVO[]
}

const clauseGroups = ref<ClauseGroup[]>([])
const clauseLoading = ref(false)
const activeClauses = ref<string[]>([])

/** 加载产品绑定条款，并对每条并行取条款详情与保障责任，主条款排在前 */
const loadClauses = async (productId: string) => {
  clauseLoading.value = true
  try {
    const rels = await getProductClauses(productId)
    const groups = await Promise.all(
      rels.map(async (rel): Promise<ClauseGroup> => {
        const [detail, coverages] = await Promise.all([
          getClauseDetail(rel.clauseId).catch(() => null),
          getCoverages(rel.clauseId).catch(() => [] as CoverageVO[]),
        ])
        return {
          clauseId: rel.clauseId,
          clauseCode: detail?.code ?? rel.clauseId,
          clauseName: detail?.name ?? '（条款信息缺失）',
          clauseVersion: rel.clauseVersion ?? detail?.version,
          mainClause: rel.mainClause,
          description: detail?.description,
          coverages: coverages ?? [],
        }
      }),
    )
    // 主条款优先展示
    groups.sort((a, b) => (b.mainClause ? 1 : 0) - (a.mainClause ? 1 : 0))
    clauseGroups.value = groups
    // 默认展开主条款（无主条款则展开首条）
    const main = groups.find((g) => g.mainClause) ?? groups[0]
    activeClauses.value = main ? [main.clauseId] : []
  } finally {
    clauseLoading.value = false
  }
}

// 寿险线判定（与配置编辑器一致），决定是否加载寿险规格
const LIFE_LINES = ['LIFE', 'ANNUITY', 'UNIVERSAL', 'PARTICIPATING', 'INVESTMENT_LINKED']

/** 加载模板行为配置与寿险规格（独立于主信息，失败不阻断展示） */
const loadTemplateConfig = async (productId: string) => {
  const templateId = product.value?.templateId
  if (templateId) {
    template.value = await getTemplate(templateId).catch(() => null)
  }
  if (product.value?.insuranceType && LIFE_LINES.includes(product.value.insuranceType)) {
    lifeSpec.value = await getLifeProductConfig(productId).catch(() => null)
  }
}

onMounted(async () => {
  const id = route.params.id as string
  loading.value = true
  try {
    product.value = await getProductDetail(id)
  } finally {
    loading.value = false
  }
  // 模板配置、条款与保障责任独立加载，失败不影响主信息展示
  await Promise.all([loadTemplateConfig(id), loadClauses(id)])
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
    flex: 1;
  }

  &__actions {
    display: flex;
    gap: 8px;
  }
}

.clause-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;

  .clause-name {
    font-weight: 600;
  }

  .clause-meta {
    color: #909399;
    font-size: 12px;
  }
}

.coverage-table {
  margin-top: 4px;
}

.clause-desc {
  margin: 10px 0 0;
  color: #606266;
  font-size: 13px;
  line-height: 1.6;
}
</style>
