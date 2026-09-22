<template>
  <!-- 产品详情页 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <TiDetailHeader title="产品详情">
        <template #meta>
          <TiStatusTag v-if="product" :value="product.status" :label="getStatusLabel(product.status)" />
        </template>
        <template #actions>
          <el-button
            v-if="product?.status === 'EFFECTIVE'"
            type="primary"
            :icon="Edit"
            v-permission="'product:edit'"
            @click="goRevise"
          >
            修订
          </el-button>
          <el-button
            v-if="product?.templateId"
            type="primary"
            :icon="Setting"
            v-permission="'product:config'"
            @click="goConfig"
          >
            配置模板
          </el-button>
        </template>
      </TiDetailHeader>

      <template v-if="product">
        <!-- 基本信息 -->
        <el-divider content-position="left">基本信息</el-divider>
        <el-descriptions :column="detailColumns" border>
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
        <el-descriptions :column="detailColumns" border>
          <el-descriptions-item label="投保年龄">{{ ageRange }}</el-descriptions-item>
          <el-descriptions-item label="投保人数">{{ groupSizeRange }}</el-descriptions-item>
          <el-descriptions-item label="保额区间">{{ insuredAmountRange }}</el-descriptions-item>
          <el-descriptions-item label="等待期">{{ days(product.insureCondition?.waitingPeriodDays) }}</el-descriptions-item>
          <el-descriptions-item label="犹豫期">{{ days(product.insureCondition?.hesitationPeriodDays) }}</el-descriptions-item>
          <el-descriptions-item label="健康告知" :span="3">{{ product.insureCondition?.healthNotice || '-' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 费率规则 -->
        <el-divider content-position="left">费率规则</el-divider>
        <el-descriptions :column="detailColumns" border>
          <el-descriptions-item label="定价模式">{{ pricingModeLabel(product.pricingMode) }}</el-descriptions-item>
          <el-descriptions-item label="定价类型">{{ pricingTypeLabel(product.pricingBasicRule?.pricingType) }}</el-descriptions-item>
          <el-descriptions-item label="基础费率">{{ rate(product.pricingBasicRule?.baseRate) }}</el-descriptions-item>
          <el-descriptions-item label="最低保费">{{ formatAmount(product.pricingBasicRule?.minPremium) }}</el-descriptions-item>
          <el-descriptions-item label="最高保费">{{ formatAmount(product.pricingBasicRule?.maxPremium) }}</el-descriptions-item>
        </el-descriptions>

        <!-- 核保配置（产品级核保策略 + 规则集绑定；存量产品未配置时展示占位） -->
        <el-divider content-position="left">核保配置</el-divider>
        <el-descriptions :column="detailColumns" border>
          <el-descriptions-item label="核保模式">
            {{ underwritingModeLabel(product.underwritingConfig?.underwritingMode) }}
          </el-descriptions-item>
          <el-descriptions-item label="核保规则集">
            {{ ruleSetName(product.underwritingConfig?.ruleSetCode) }}
          </el-descriptions-item>
          <el-descriptions-item label="转人工核保阈值">
            {{ formatAmount(product.underwritingConfig?.manualReviewAmountThreshold) }}
          </el-descriptions-item>
          <el-descriptions-item label="核保时效">
            {{ days(product.underwritingConfig?.underwritingSLADays) }}
          </el-descriptions-item>
          <el-descriptions-item label="加费承保">
            {{ boolText(product.underwritingConfig?.surchargeAcceptable) }}
          </el-descriptions-item>
          <el-descriptions-item label="特别约定">
            {{ boolText(product.underwritingConfig?.specialAgreementAcceptable) }}
          </el-descriptions-item>
          <el-descriptions-item label="自动核保条件" :span="3">
            {{ product.underwritingConfig?.autoApprovalCondition || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="核保必需材料" :span="3">
            {{ product.underwritingConfig?.requiredDocuments?.join('、') || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 模板行为配置（出单/保全/理赔/缴费/再保/分红），随模板加载 -->
        <template v-if="template">
          <el-divider content-position="left">出单与流程配置</el-divider>
          <el-descriptions :column="detailColumns" border>
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
          <el-descriptions :column="detailColumns" border>
            <el-descriptions-item label="犹豫期">{{ days(template.maintenanceConfig?.freeLookPeriodDays) }}</el-descriptions-item>
            <el-descriptions-item label="退保规则集">{{ template.maintenanceConfig?.surrenderRuleSet || '-' }}</el-descriptions-item>
            <!--
              术语说明：与 product/template-config 中的「批改规则集」是同一概念。
              同一个词在一处解释、另一处不解释，用户读到的就是两个术语；故此处也给出处。
            -->
            <el-descriptions-item>
              <template #label>
                <span class="term-help">
                  批改规则集
                  <el-tooltip
                    placement="top"
                    content="批改（endorsement）：保单生效后对保单内容的变更，如投保人/受益人变更、缴费方式变更、保额或保险期间调整。保全案件生效后由保全域出具批单留痕，与「退保」并列同属保全业务。"
                  >
                    <el-icon class="term-help__icon"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </span>
              </template>
              {{ template.maintenanceConfig?.endorsementRuleSet || '-' }}
            </el-descriptions-item>
          </el-descriptions>

          <el-divider content-position="left">理赔配置</el-divider>
          <el-descriptions :column="detailColumns" border>
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
          <el-descriptions :column="detailColumns" border>
            <el-descriptions-item label="允许缴费方式" :span="3">
              {{ paymentModesText(template.billingConfig?.allowedPaymentModes) }}
            </el-descriptions-item>
            <el-descriptions-item label="宽限期">{{ days(template.billingConfig?.gracePeriodDays) }}</el-descriptions-item>
            <el-descriptions-item label="失效天数">{{ days(template.billingConfig?.lapseAfterDays) }}</el-descriptions-item>
            <el-descriptions-item label="自动扣款">{{ boolText(template.billingConfig?.autoDeductEnabled) }}</el-descriptions-item>
          </el-descriptions>

          <template v-if="template.dividendConfig?.distribution">
            <el-divider content-position="left">分红配置</el-divider>
            <el-descriptions :column="summaryColumns" border>
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
          <el-descriptions :column="detailColumns" border>
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
          <!-- 🔴 失败态必须排在空态之前（R9-F02a）：接口挂掉时 clauseGroups 同样为空，
               空态若排在前面，界面会向用户断言「该产品暂无绑定条款」——而真相是这次没查成，
               二者在屏幕上完全同形。全局红条不构成兜底：它是瞬时的，这句断言却是持久的
               （同判据已在 system/dict 左栏、rule-engine/list 上成立，本处是漏网的第三条链）。 -->
          <el-alert
            v-if="!clauseLoading && clauseError"
            class="clause-error"
            type="error"
            :closable="false"
            show-icon
            :title="`条款与保障责任加载失败：${clauseError.message}`"
          >
            <el-button text type="primary" size="small" @click="reloadClauses">重试</el-button>
          </el-alert>
          <el-empty
            v-else-if="!clauseLoading && clauseGroups.length === 0"
            description="该产品暂无绑定条款"
            :image-size="80"
          />
          <el-collapse v-else v-model="activeClauses">
            <el-collapse-item v-for="group in clauseGroups" :key="group.clauseId" :name="group.clauseId">
              <template #title>
                <div class="clause-title">
                  <!-- 🔴 分类标记不得借用动作保留色（R9-F03）：`danger` 全站只用于破坏性动作
                       （删除/移除/退役）。「主条款」是**分类**、不是状态更不是动作，故用品牌色 primary
                       （先例：actuarial-workbench 金额通道 = warning/primary、rule-engine「只读」= info）；
                       「附加条款」保持次级灰 info，一主一次层级才成立。 -->
                  <el-tag v-if="group.mainClause" type="primary" size="small" effect="plain">主条款</el-tag>
                  <el-tag v-else type="info" size="small" effect="plain">附加条款</el-tag>
                  <span class="clause-name">{{ group.clauseName }}</span>
                  <span class="clause-meta">{{ group.clauseCode }} · {{ group.clauseVersion || '-' }} · {{ coverageCountText(group) }}</span>
                </div>
              </template>

              <el-table :data="group.coverages" border size="small" class="coverage-table">
                <el-table-column type="index" label="#" width="48" align="center" />
                <el-table-column prop="coverageName" label="保障责任" min-width="180" show-overflow-tooltip>
                  <template #default="{ row }">
                    {{ row.coverageName }}
                    <!-- 🔴 同族误用（R9-F03 举一反三）：`warning` 是「可逆但需注意」的**纠正性动作**
                         保留色（全站仅 1 例：佣金发起回拨），此处却是静态分类标记；且同一页里
                         「附加条款」用的是 info，同一概念两种颜色。统一为次级灰 info。 -->
                    <el-tag v-if="row.isAdditional" size="small" type="info" effect="plain" style="margin-left: 6px">附加</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="责任类型" width="90">
                  <template #default="{ row }">{{ coverageTypeLabel(row.coverageType) }}</template>
                </el-table-column>
                <el-table-column label="赔付方式" width="110">
                  <template #default="{ row }">{{ payoutTypeLabel(row.payoutType) }}</template>
                </el-table-column>
                <el-table-column label="保险金额" width="130" align="right">
                  <template #default="{ row }">{{ coverageAmountText(row) }}</template>
                </el-table-column>
                <el-table-column label="赔付/给付细则" min-width="240" show-overflow-tooltip>
                  <template #default="{ row }">{{ coverageSummary(row) }}</template>
                </el-table-column>
                <!-- 🔴 空态必须分两种（R9-F02a）：接口 500 与「确实没配」原本都渲染成
                     「该条款暂未配置保障责任」——后者是对数据的断言，前者是没查成，
                     而全局提示在这条路径上根本不触发（detail 取到了 ⇒ resolved≠0，见 loadClauses）。
                     故失败态要就地、持久、可重试，与「没配」严格区分。 -->
                <template #empty>
                  <div v-if="group.coverageError" class="coverage-error" role="alert">
                    <span class="coverage-error__text">保障责任加载失败：{{ group.coverageError.message }}</span>
                    <el-button text type="primary" size="small" @click="reloadClauses">重试</el-button>
                  </div>
                  <span v-else>该条款暂未配置保障责任</span>
                </template>
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
import { ElMessage } from 'element-plus'
import { Setting, Edit, QuestionFilled } from '@element-plus/icons-vue'
import {
  getProductDetail,
  getProductClauses,
  getTemplate,
  getLifeProductConfig,
  type ProductTemplateVO,
  type ConfigureLifeProductRequest,
} from '@/api/product'
import { getClauseDetail, getCoverages, type CoverageVO } from '@/api/clause'
import { listRuleSets, type RuleSet } from '@/api/rule-engine'
import { useDict } from '@/composables/useDict'
import { useTableError, normalizeError } from '@/composables/useTable'
import { useDetailColumns } from '@/composables/useDetailColumns'
import { formatDateTime, formatDate } from '@/utils/date'
import { formatAmount } from '@/utils/format'
import TiDetailHeader from '@/components/TiDetailHeader/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import type { ProductDetailVO } from '@/types/business.d'

/** 产品各信息面板：字段短，宽屏 3 档 */
const detailColumns = useDetailColumns(3)
/** 分红配置：红利分配方式 + 3 档演示利率共 4 个同类短值并排，宽屏 4 档（语义面板，非通用档位） */
const summaryColumns = useDetailColumns(4)

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const product = ref<ProductDetailVO | null>(null)
const template = ref<ProductTemplateVO | null>(null)
const lifeSpec = ref<ConfigureLifeProductRequest | null>(null)

const goConfig = () => router.push(`/product/config/${route.params.id}`)

/** 修订入口：仅生效中产品可修订（生成新版本 DRAFT，存量产品补配核保配置等场景） */
const goRevise = () => router.push(`/product/revise/${route.params.id}`)

const { getLabel: getCategoryLabel } = useDict('INSURANCE_CATEGORY')
const { getLabel: getStatusLabel } = useDict('PRODUCT_STATUS')
const { getLabel: productFormDictLabel } = useDict('PRODUCT_FORM')
const { getLabel: productCategoryDictLabel } = useDict('PRODUCT_CATEGORY')
const { getLabel: pricingModeDictLabel } = useDict('PRICING_MODE')
const { getLabel: pricingTypeDictLabel } = useDict('PRICING_TYPE')
const { getLabel: issuanceModeDictLabel } = useDict('ISSUANCE_MODE')
const { getLabel: maintenanceTypeDictLabel } = useDict('MAINTENANCE_TYPE')
const { getLabel: paymentFrequencyDictLabel } = useDict('PAYMENT_FREQUENCY')
const { getLabel: dividendDistributionDictLabel } = useDict('DIVIDEND_DISTRIBUTION')
const { getLabel: lifeProductTypeDictLabel } = useDict('LIFE_PRODUCT_TYPE')
const { getLabel: coverageTypeDictLabel } = useDict('COVERAGE_TYPE')
const { getLabel: payoutTypeDictLabel } = useDict('PAYOUT_TYPE')

// —— 标签/格式化工具（后端枚举码 → 中文，空值统一占位 '-'） ——
const formLabel = (v?: string) => v ? productFormDictLabel(v) : '-'
const productCategoryLabel = (v?: string) => v ? productCategoryDictLabel(v) : '-'
const pricingModeLabel = (v?: string) => v ? pricingModeDictLabel(v) : '-'
const pricingTypeLabel = (v?: string) => v ? pricingTypeDictLabel(v) : '-'
const days = (v?: number) => (v != null ? `${v} 天` : '-')
const boolText = (v?: boolean) => (v == null ? '-' : v ? '是' : '否')
const pct = (v?: number) => (v != null ? `${(v * 100).toFixed(2)}%` : '-')

const issuanceModeLabel = (v?: string) => v ? issuanceModeDictLabel(v) : '-'
const maintenanceTypeLabel = (v?: string) => v ? maintenanceTypeDictLabel(v) : v
const dividendLabel = (v?: string) => v ? dividendDistributionDictLabel(v) : '-'
const productTypeLabel = (v?: string) => v ? lifeProductTypeDictLabel(v) : '-'
const paymentModesText = (list?: string[]) =>
  list && list.length ? list.map(paymentFrequencyDictLabel).join('、') : '-'
const rate = (v?: number) => (v != null ? v.toString() : '-')

/** 核保模式枚举码 → 中文（metadata ProductEnum.UnderwritingMode，前端本地映射） */
const underwritingModeLabel = (v?: string) =>
  ({ AUTO: '自动核保', MANUAL: '人工核保', SMART: '智能核保', HYBRID: '混合核保' } as Record<string, string>)[v ?? ''] ?? '-'

/** 核保规则集编码 → 名称（联动规则引擎 UNDERWRITING 类型规则集；未绑定/缺失时降级展示编码） */
const underwritingRuleSets = ref<RuleSet[]>([])
const ruleSetName = (code?: string) => {
  if (!code) return '未绑定（内置评分逻辑）'
  const rs = underwritingRuleSets.value.find((x) => x.ruleSetCode === code)
  return rs ? `${rs.ruleSetName}（${rs.ruleSetCode}）` : code
}
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
  return `${min != null ? formatAmount(min) : '不限'} ~ ${max != null ? formatAmount(max) : '不限'}`
})

// 寿险规格区间展示
const lifeAgeRange = computed(() =>
  rangeText(lifeSpec.value?.entryAgeRange?.minAge, lifeSpec.value?.entryAgeRange?.maxAge, ' 岁'),
)
const lifeSumRange = computed(() => {
  const min = lifeSpec.value?.sumInsuredRange?.minSumInsured
  const max = lifeSpec.value?.sumInsuredRange?.maxSumInsured
  if (min == null && max == null) return '-'
  return `${min != null ? formatAmount(min) : '不限'} ~ ${max != null ? formatAmount(max) : '不限'}`
})

const coverageTypeLabel = (v?: string) => v ? coverageTypeDictLabel(v) : '-'
const payoutTypeLabel = (v?: string) => v ? payoutTypeDictLabel(v) : '-'

/** 保险金额展示：优先最高保额，退化到赔付上限/日津贴 */
const coverageAmountText = (row: CoverageVO): string => {
  if (row.coverageAmount != null) return formatAmount(row.coverageAmount)
  if (row.maxPayout != null) return formatAmount(row.maxPayout)
  if (row.dailyAmount != null) return `${formatAmount(row.dailyAmount)}/天`
  return '-'
}

/** 赔付/给付细则摘要（按赔付类型择取关键参数，与条款编辑页一致） */
const coverageSummary = (row: CoverageVO): string => {
  const parts: string[] = []
  if (row.waitingPeriodDays != null) parts.push(`等待期${row.waitingPeriodDays}天`)
  if (row.payoutType === 'REIMBURSEMENT') {
    if (row.reimbursementRatio != null) parts.push(`社保内${row.reimbursementRatio * 100}%`)
    if (row.outSocialRatio != null) parts.push(`社保外${row.outSocialRatio * 100}%`)
    if (row.deductibleAmount != null) parts.push(`免赔${formatAmount(row.deductibleAmount)}`)
    if (row.maxPayout != null) parts.push(`上限${formatAmount(row.maxPayout)}`)
  } else if (row.payoutType === 'PERIODIC') {
    if (row.dailyAmount != null) parts.push(`日津贴${formatAmount(row.dailyAmount)}`)
    if (row.deductibleDays != null) parts.push(`免赔${row.deductibleDays}天`)
    if (row.maxDaysPerClaim != null) parts.push(`每次${row.maxDaysPerClaim}天`)
    if (row.maxDaysTotal != null) parts.push(`累计${row.maxDaysTotal}天`)
  } else if (row.payoutType === 'PROPORTIONAL' && row.proportion != null) {
    parts.push(`比例${row.proportion * 100}%`)
  } else if (row.payoutType === 'ACTUAL_LOSS') {
    if (row.deductibleAmount != null) parts.push(`免赔${formatAmount(row.deductibleAmount)}`)
    if (row.maxPayout != null) parts.push(`上限${formatAmount(row.maxPayout)}`)
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
  /**
   * 该条款的保障责任取数结果（🔴 R9-F02a）：`null` = 取数成功，此时 `coverages` 为空
   * 才代表「该条款确实没配保障责任」；非 null = 这次没查成，界面必须说「加载失败」
   * —— 二者在屏幕上原本完全同形（都渲染成空表）。
   */
  coverageError: Error | null
}

/**
 * 条款头部「N 项保障」文案：失败时**不得**显示「0 项保障」
 * —— 那是「确实没配」的断言，与「这次没查成」是两件事。
 */
const coverageCountText = (group: ClauseGroup): string =>
  group.coverageError ? '保障责任加载失败' : `${group.coverages.length} 项保障`

const clauseGroups = ref<ClauseGroup[]>([])
const clauseLoading = ref(false)
const activeClauses = ref<string[]>([])
/**
 * 条款面板（本页第二条独立加载链）的失败态。
 * 🔴 必须走 `useTableError`（归一非 Error 拒绝值，否则 `clauseError.message` 取到 undefined，
 * 失败块渲染成一片空白，比不显示更迷惑）；🔴 也不得与页面其它链共用一个实例——共用会让
 * 一方成功清错顺手抹掉另一方的失败态（table-error-state-contracts 用例 ⑤）。
 */
const { tableError: clauseError, clearTableError: clearClauseError, setTableError: setClauseError } =
  useTableError()

/** 加载产品绑定条款，并对每条并行取条款详情与保障责任，主条款排在前 */
const loadClauses = async (productId: string) => {
  clauseLoading.value = true
  try {
    const rels = await getProductClauses(productId)
    /** 条款详情取到的条数：用于区分「单条绑定悬空」与「条款服务整体不可用」（见下方注释） */
    let resolved = 0
    const groups = await Promise.all(
      rels.map(async (rel): Promise<ClauseGroup> => {
        // 🔴 这里必须静默：条款面板是本页的**从属面板**，产品主信息已经加载成功了。
        // 一条绑定的 clauseId 悬空（实测 CL-MED-ZYES-V2，是条款编码被写进了 id 字段）时，
        // 拦截器默认弹的全局红条是「资源不存在」——用户看到的是整页加载失败，
        // 而真相只是这一条条款取不到；面板内已有的「（条款信息缺失）」才是准确的就地提示。
        const [detail, coverages] = await Promise.all([
          getClauseDetail(rel.clauseId, { silentError: true }).catch(() => null),
          // 🔴 保障责任同样静默，但**不能静默吞错**（R9-F02a）：后端 BFF 对
          // `listCoverages` 解码失败（首次并发竞态 500）时，原先 `.catch(() => [])`
          // 把失败直接抹成空数组，表格的 #empty 槽照常渲染「该条款暂未配置保障责任」——
          // 向用户断言「该条款确实没配」，而真相是这次没查成；且因 detail 取到了
          // （resolved=1）连下方那条全局提示都不触发，整条链**完全静默**。
          // 故此处把失败原因保留下来，交给表格的失败态渲染。
          getCoverages(rel.clauseId, { silentError: true }).then(
            (rows) => ({ rows: rows ?? [], error: null as Error | null }),
            // 归一走 normalizeError 而非就地 new Error：非 Error 的拒绝值（后端原始字符串）
            // 会被吞成无文案的失败块，全站只有这一个实现
            (err: unknown) => ({ rows: [] as CoverageVO[], error: normalizeError(err) }),
          ),
        ])
        if (detail) resolved += 1
        return {
          clauseId: rel.clauseId,
          clauseCode: detail?.code ?? rel.clauseId,
          clauseName: detail?.name ?? '（条款信息缺失）',
          clauseVersion: rel.clauseVersion ?? detail?.version,
          mainClause: rel.mainClause,
          description: detail?.description,
          coverages: coverages.rows,
          coverageError: coverages.error,
        }
      }),
    )
    // 静默不等于吞错：**全部**条款都取不到时不再是个别绑定悬空，而是条款服务不可用，
    // 此时整块面板会清一色显示「（条款信息缺失）」却不给任何解释，必须补一条提示。
    if (rels.length && resolved === 0) {
      ElMessage.error('条款信息加载失败，请稍后重试')
    }
    // 主条款优先展示
    groups.sort((a, b) => (b.mainClause ? 1 : 0) - (a.mainClause ? 1 : 0))
    clauseGroups.value = groups
    // 默认展开主条款（无主条款则展开首条）
    const main = groups.find((g) => g.mainClause) ?? groups[0]
    activeClauses.value = main ? [main.clauseId] : []
    // 🔴 清错必须在**成功分支**，不能进 finally：失败路径同样经过 finally，
    // 会把刚置上的失败态立刻抹掉，失败态永远不显示（table-error-state-contracts 用例 ④）。
    clearClauseError()
  } catch (err) {
    // 🔴 失败与「该产品确实没绑条款」必须可区分：清空数据并置失败态，面板才会说
    // 「加载失败」而不是替用户断言「暂无绑定条款」（R9-F02a：BFF 首次并发调用 500 时，
    // 该面板整块消失且不带任何失败痕迹——失败态元素探测全空）。
    clauseGroups.value = []
    activeClauses.value = []
    setClauseError(err)
  } finally {
    clauseLoading.value = false
  }
}

/** 失败态里的「重试」：重试必须真的重新拉取，否则按钮点了界面纹丝不动 */
const reloadClauses = () => loadClauses(route.params.id as string)

// 寿险线判定（与配置编辑器一致），决定是否加载寿险规格
const LIFE_LINES = ['LIFE', 'ANNUITY', 'UNIVERSAL', 'PARTICIPATING', 'INVESTMENT_LINKED']

/** 加载模板行为配置与寿险规格（独立于主信息，失败不阻断展示） */
// 🔴 两处都带 silentError：调用方已 `.catch(() => null)` 就地降级，缺了它拦截器会为同一次失败弹全局红条
const loadTemplateConfig = async (productId: string) => {
  const templateId = product.value?.templateId
  if (templateId) {
    template.value = await getTemplate(templateId, { silentError: true }).catch(() => null)
  }
  if (product.value?.insuranceType && LIFE_LINES.includes(product.value.insuranceType)) {
    lifeSpec.value = await getLifeProductConfig(productId, { silentError: true }).catch(() => null)
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
  // 模板配置、条款、核保规则集（绑定规则集名称映射）独立加载，失败不影响主信息展示
  await Promise.all([
    loadTemplateConfig(id),
    loadClauses(id),
    // 规则集仅用于把绑定规则集 code 映射成名称，取不到不阻断详情展示 ⇒ 走 silentError
    listRuleSets('UNDERWRITING', { silentError: true }).then((res) => (underwritingRuleSets.value = res.list ?? [])).catch(() => {}),
  ])
})
</script>

<style scoped lang="scss">
/* 术语旁的问号图标：与 product/template-config 的标签说明同一观感 */
.term-help {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.term-help__icon {
  color: $text-secondary;
  font-size: 13px;
  cursor: help;
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
    color: $text-secondary;
    font-size: 12px;
  }
}

.coverage-table {
  margin-top: 4px;
}

/* 条款面板的加载失败态（R9-F02a）：与「暂无绑定条款」的空态在视觉上必须一眼可分 */
.clause-error {
  margin-bottom: $space-2;
}

/* 表内失败态：与「该条款暂未配置保障责任」同槽但观感明显不同（错误色 + 可重试） */
.coverage-error {
  display: inline-flex;
  align-items: center;
  gap: $space-2;
  color: $danger-text;

  &__text {
    font-size: $font-size-md;
  }
}

.clause-desc {
  margin: 10px 0 0;
  color: $text-regular;
  font-size: 13px;
  line-height: 1.6;
}
</style>
