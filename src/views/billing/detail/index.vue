<template>
  <!-- 账单详情 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>账单详情 - {{ bill?.billNo || bill?.billId }}</h3>
        <TiStatusTag v-if="bill" :value="bill.status" />
      </div>

      <el-descriptions v-if="bill" :column="detailColumnCount" border style="margin-bottom: 24px">
        <el-descriptions-item label="账单号">{{ bill.billNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="保单ID">{{ bill.policyId }}</el-descriptions-item>
        <el-descriptions-item label="客户ID">{{ bill.customerId || '-' }}</el-descriptions-item>
        <el-descriptions-item label="账单金额">¥{{ bill.amount?.toLocaleString() }}</el-descriptions-item>
        <el-descriptions-item label="到期日">{{ bill.dueDate || '-' }}</el-descriptions-item>
        <el-descriptions-item label="实缴日">{{ bill.paidDate || bill.paymentDate || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间" :span="3">{{ bill.createdAt }}</el-descriptions-item>
      </el-descriptions>

      <!-- 缴费计划 -->
      <div class="section-title">缴费计划</div>
      <el-table :data="scheduleList" v-loading="scheduleLoading" size="small" stripe>
        <el-table-column prop="period" label="期次" width="80" />
        <el-table-column prop="dueDate" label="到期日" width="130" />
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="{ row }">
            {{ row.currency }} {{ row.amount?.toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <TiStatusTag :value="row.status" />
          </template>
        </el-table-column>
      </el-table>

      <div class="pricing-fact-heading">
        <div><div class="section-title">费用与税务事实</div><span>来源于 Product 确认计算，Billing 仅校验并入账。</span></div>
        <el-tag v-if="pricingFacts" :type="reconciliationTagType" effect="plain">{{ reconciliationLabel }}</el-tag>
      </div>
      <el-alert v-if="pricingFactUnavailable" title="该账单未关联确认计算事实，可能是历史账单或兼容开账流程。" type="info" :closable="false" show-icon />
      <template v-else-if="pricingFacts">
        <el-descriptions :column="reconciliationColumnCount" border class="reconciliation-summary">
          <el-descriptions-item label="预期税额">{{ amountText(pricingFacts.invoiceReconciliation.expectedTaxAmount) }}</el-descriptions-item>
          <el-descriptions-item label="已开票税额">{{ amountText(pricingFacts.invoiceReconciliation.invoicedTaxAmount) }}</el-descriptions-item>
          <el-descriptions-item label="差额">{{ amountText(pricingFacts.invoiceReconciliation.difference) }}</el-descriptions-item>
          <el-descriptions-item label="有效发票">{{ pricingFacts.invoiceReconciliation.effectiveInvoiceIds.length || 0 }} 张</el-descriptions-item>
        </el-descriptions>
        <div class="subsection-title">客户应收明细</div>
        <el-table :data="pricingFacts.receivableLines" v-loading="pricingFactLoading" border size="small">
          <el-table-column prop="componentCode" label="费用项" min-width="150" /><el-table-column prop="category" label="分类" width="145" /><el-table-column prop="accountingClass" label="账务分类" min-width="130" />
          <el-table-column label="计费基数" width="120"><template #default="{ row }">{{ amountText(row.baseAmount, row.currency) }}</template></el-table-column><el-table-column label="费率" width="100"><template #default="{ row }">{{ rateText(row.rate) }}</template></el-table-column><el-table-column label="应收金额" width="130"><template #default="{ row }">{{ amountText(row.amount, row.currency) }}</template></el-table-column>
          <el-table-column label="客户应付" width="100"><template #default="{ row }"><el-tag :type="row.affectsCustomerPayable ? 'primary' : 'info'" effect="plain">{{ row.affectsCustomerPayable ? '计入' : '不计入' }}</el-tag></template></el-table-column>
          <template #empty><el-empty description="无应收费用明细" :image-size="64" /></template>
        </el-table>
        <div class="subsection-title">税务台账</div>
        <el-table :data="pricingFacts.taxLedgerLines" border size="small">
          <el-table-column prop="componentCode" label="税费项" min-width="145" /><el-table-column prop="jurisdictionCode" label="司法辖区" width="105" />
          <el-table-column label="税基" width="120"><template #default="{ row }">{{ amountText(row.taxableBase, row.currency) }}</template></el-table-column><el-table-column label="税率" width="100"><template #default="{ row }">{{ rateText(row.taxRate) }}</template></el-table-column><el-table-column label="税额" width="120"><template #default="{ row }">{{ amountText(row.taxAmount, row.currency) }}</template></el-table-column>
          <el-table-column label="价内外" width="90"><template #default="{ row }">{{ row.taxPriceMode === 'INCLUSIVE' ? '价内税' : '价外税' }}</template></el-table-column><el-table-column prop="regulatoryReferenceId" label="法规依据" min-width="150" /><el-table-column label="免税" width="80"><template #default="{ row }">{{ row.taxExempt ? '是' : '否' }}</template></el-table-column>
          <el-table-column label="策略哈希" min-width="180"><template #default="{ row }"><span class="hash-text">{{ row.taxPolicyHash }}</span></template></el-table-column>
          <template #empty><el-empty description="无税务台账明细" :image-size="64" /></template>
        </el-table>
        <div class="subsection-title">佣金应付</div>
        <el-table :data="pricingFacts.commissionPayables" border size="small">
          <el-table-column label="佣金方案" min-width="180"><template #default="{ row }">{{ row.schemeCode }} / {{ row.schemeVersion }}</template></el-table-column>
          <el-table-column label="渠道" min-width="150"><template #default="{ row }">{{ row.channelId }}</template></el-table-column>
          <el-table-column label="受益方" min-width="180"><template #default="{ row }">{{ row.beneficiaryId === '***' ? '***' : `${row.beneficiaryType} / ${row.beneficiaryId}` }}</template></el-table-column>
          <el-table-column label="基数" width="125"><template #default="{ row }">{{ internalAmountText(row.baseAmount, row.currency) }}</template></el-table-column>
          <el-table-column label="分润比例" width="105"><template #default="{ row }">{{ internalRateText(row.splitRate) }}</template></el-table-column>
          <el-table-column label="应付金额" width="130"><template #default="{ row }">{{ internalAmountText(row.payableAmount, row.currency) }}</template></el-table-column>
          <el-table-column label="状态" width="120"><template #default="{ row }"><TiStatusTag :value="row.status" /></template></el-table-column>
          <el-table-column label="方案哈希" min-width="190"><template #default="{ row }"><span class="hash-text">{{ row.schemeHash }}</span></template></el-table-column>
          <template #empty><el-empty description="无佣金应付明细" :image-size="64" /></template>
        </el-table>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { useMediaQuery } from '@vueuse/core'
import { getBillDetail, getBillPricingFacts, getPremiumSchedule } from '@/api/billing'
import type { BillingPricingFactVO, BillVO, PremiumScheduleVO } from '@/api/billing'
import TiStatusTag from '@/components/TiStatusTag/index.vue'

const route = useRoute()
const loading = ref(false)
const scheduleLoading = ref(false)
const pricingFactLoading = ref(false)
const bill = ref<BillVO | null>(null)
const scheduleList = ref<PremiumScheduleVO[]>([])
const pricingFacts = ref<BillingPricingFactVO | null>(null)
const pricingFactUnavailable = ref(false)
const isNarrowScreen = useMediaQuery('(max-width: 767px)')
const detailColumnCount = computed(() => isNarrowScreen.value ? 1 : 3)
const reconciliationColumnCount = computed(() => isNarrowScreen.value ? 1 : 4)
const reconciliationLabels: Record<string, string> = { NOT_APPLICABLE: '无需勾稽', EXEMPT: '免税', UNINVOICED: '未开票', MATCHED: '已勾稽', MISMATCH: '存在差异' }
const reconciliationTagTypes: Record<string, 'success' | 'danger' | 'warning' | 'info'> = { MATCHED: 'success', MISMATCH: 'danger', UNINVOICED: 'warning', EXEMPT: 'info', NOT_APPLICABLE: 'info' }
const reconciliationLabel = computed(() => reconciliationLabels[pricingFacts.value?.invoiceReconciliation.status || ''] || '-')
const reconciliationTagType = computed(() => reconciliationTagTypes[pricingFacts.value?.invoiceReconciliation.status || ''])
const amountText = (value?: number, currency = 'CNY') => value === undefined || value === null ? '-' : `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const rateText = (value?: number) => value === undefined || value === null ? '-' : `${(value * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}%`
const internalAmountText = (value?: number, currency = 'CNY') => value === undefined || value === null ? '***' : amountText(value, currency)
const internalRateText = (value?: number) => value === undefined || value === null ? '***' : rateText(value)

onMounted(async () => {
  const id = route.params.id as string
  loading.value = true
  try {
    bill.value = await getBillDetail(id)
    if (bill.value.policyId) {
      await loadPremiumSchedule(bill.value.policyId)
    }
    await loadPricingFacts(id)
  } finally {
    loading.value = false
  }
})

const loadPricingFacts = async (billId: string) => {
  pricingFactLoading.value = true
  pricingFactUnavailable.value = false
  try {
    pricingFacts.value = await getBillPricingFacts(billId)
  } catch {
    pricingFacts.value = null
    pricingFactUnavailable.value = true
  } finally {
    pricingFactLoading.value = false
  }
}

/** 使用账单返回的真实保单ID加载缴费计划。 */
const loadPremiumSchedule = async (policyId: string) => {
  scheduleLoading.value = true
  try {
    scheduleList.value = await getPremiumSchedule(policyId)
  } catch {
    // 计划加载失败不阻断主流程
    scheduleList.value = []
  } finally {
    scheduleLoading.value = false
  }
}
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
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.pricing-fact-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 24px 0 12px;

  .section-title { margin-bottom: 4px; }
  span { color: var(--ti-text-secondary, #86909c); font-size: 12px; }
}

.reconciliation-summary { margin-bottom: 18px; }
.subsection-title { margin: 18px 0 10px; color: #303133; font-size: 14px; font-weight: 600; }
.hash-text { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-all; }

@media (max-width: 767px) {
  .detail-header {
    align-items: flex-start;
    flex-wrap: wrap;

    h3 {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }

  .pricing-fact-heading {
    align-items: flex-start;
  }
}
</style>
