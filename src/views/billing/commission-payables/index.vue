<template>
  <div class="ti-page">
    <div class="page-intro">
      <h2>佣金应付</h2>
      <p>查询 Product 确认计算生成的渠道佣金负债，登记结算并处理保单失效后的回拨。</p>
    </div>

    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="状态">
        <TiDictSelect v-model="queryParams.status" dict-type="COMMISSION_PAYABLE_STATUS" placeholder="全部" style="width: 150px" />
      </el-form-item>
      <el-form-item label="渠道">
        <el-select v-model="queryParams.channelId" clearable filterable placeholder="全部渠道" style="width: 240px">
          <el-option v-for="item in channels" :key="item.channelId" :label="`${item.channelName} (${item.channelCode})`" :value="item.channelId" />
        </el-select>
      </el-form-item>
      <el-form-item label="受益方ID"><el-input v-model="queryParams.beneficiaryId" clearable style="width: 190px" /></el-form-item>
    </TiSearchForm>

    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="payableId" label="应付编号" min-width="190"><template #default="{ row }"><TiCopyText :text="row.payableId" /></template></el-table-column>
      <el-table-column prop="policyId" label="保单ID" min-width="180"><template #default="{ row }"><TiCopyText :text="row.policyId" /></template></el-table-column>
      <el-table-column label="佣金方案" min-width="180"><template #default="{ row }">{{ row.schemeCode }} / {{ row.schemeVersion }}</template></el-table-column>
      <el-table-column label="受益方" min-width="180"><template #default="{ row }">{{ beneficiaryLabel(row) }}</template></el-table-column>
      <el-table-column label="应付金额" width="135"><template #default="{ row }">{{ amountText(row.payableAmount, row.currency) }}</template></el-table-column>
      <el-table-column label="已结算" width="130"><template #default="{ row }">{{ amountText(row.settledAmount, row.currency) }}</template></el-table-column>
      <el-table-column label="回拨金额" width="130"><template #default="{ row }">{{ amountText(row.clawbackAmount, row.currency) }}</template></el-table-column>
      <el-table-column label="状态" width="120"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
      <el-table-column prop="updatedAt" label="更新时间" width="170" />
      <el-table-column label="操作" :fixed="isNarrowScreen ? false : 'right'" width="300">
        <template #default="{ row }">
          <el-button link :icon="View" @click="showDetail(row)">查看</el-button>
          <el-button v-if="canSettle(row)" link type="primary" v-permission="'billing:commission:settle'" @click="openAmountAction(row, 'settle')">登记结算</el-button>
          <el-button v-if="canClawback(row)" link type="warning" v-permission="'billing:commission:clawback'" @click="openAmountAction(row, 'clawback')">发起回拨</el-button>
          <el-button v-if="row.status === 'CLAWBACK_PENDING'" link type="success" v-permission="'billing:commission:clawback'" @click="completeClawback(row)">完成回拨</el-button>
          <el-button v-if="row.status === 'PENDING'" link type="danger" v-permission="'billing:commission:cancel'" @click="cancelPayable(row)">取消</el-button>
        </template>
      </el-table-column>
      <template #empty><el-empty description="暂无佣金应付数据" :image-size="72" /></template>
    </TiTable>

    <el-dialog v-model="amountVisible" :title="amountMode === 'settle' ? '登记佣金结算' : '发起佣金回拨'" width="460px">
      <el-form label-width="100px">
        <el-form-item label="应付编号">{{ current?.payableId }}</el-form-item>
        <el-form-item label="可操作金额">{{ amountText(actionLimit, current?.currency) }}</el-form-item>
        <el-form-item label="本次金额"><el-input-number v-model="actionAmount" :min="0.01" :max="actionLimit" :precision="2" style="width: 100%" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="amountVisible = false">取消</el-button><el-button type="primary" :loading="actionLoading" @click="submitAmountAction">确认</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="佣金应付详情" size="min(860px, 100vw)">
      <el-descriptions v-if="detail" :column="isNarrowScreen ? 1 : 3" border>
        <el-descriptions-item label="应付编号" :span="2">{{ detail.payableId }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusLabel(detail.status) }}</el-descriptions-item>
        <el-descriptions-item label="账单ID">{{ detail.billId }}</el-descriptions-item>
        <el-descriptions-item label="保单ID">{{ detail.policyId }}</el-descriptions-item>
        <el-descriptions-item label="计算ID">{{ detail.calculationId }}</el-descriptions-item>
        <el-descriptions-item label="渠道">{{ detail.channelId }}</el-descriptions-item>
        <el-descriptions-item label="方案">{{ detail.schemeCode }} / {{ detail.schemeVersion }}</el-descriptions-item>
        <el-descriptions-item label="受益方">{{ beneficiaryLabel(detail) }}</el-descriptions-item>
        <el-descriptions-item label="计算基数">{{ amountText(detail.baseAmount, detail.currency) }}</el-descriptions-item>
        <el-descriptions-item label="佣金总额">{{ amountText(detail.grossCommission, detail.currency) }}</el-descriptions-item>
        <el-descriptions-item label="分润比例">{{ rateText(detail.splitRate) }}</el-descriptions-item>
        <el-descriptions-item label="应付金额">{{ amountText(detail.payableAmount, detail.currency) }}</el-descriptions-item>
        <el-descriptions-item label="结算期数">{{ detail.installmentCount }}</el-descriptions-item>
        <el-descriptions-item label="回拨期限">{{ detail.clawbackMonths }} 个月</el-descriptions-item>
        <el-descriptions-item label="方案哈希" :span="3"><span class="hash-text">{{ detail.schemeHash }}</span></el-descriptions-item>
        <el-descriptions-item label="结果哈希" :span="3"><span class="hash-text">{{ detail.resultHash }}</span></el-descriptions-item>
      </el-descriptions>
      <div v-if="detail?.billId" class="drawer-footer"><el-button @click="router.push(`/billing/detail/${detail.billId}`)">查看关联账单</el-button></div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { View } from '@element-plus/icons-vue'
import { useMediaQuery } from '@vueuse/core'
import { getChannelList, type ChannelVO } from '@/api/channel'
import {
  cancelCommissionPayable, completeCommissionClawback, getCommissionPayable,
  getCommissionPayableList, requestCommissionClawback, settleCommissionPayable,
  type CommissionPayableStatus, type CommissionPayableVO,
} from '@/api/billing'
import { useTable } from '@/composables/useTable'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiTable from '@/components/TiTable/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'

const router = useRouter()
const channels = ref<ChannelVO[]>([])
const isNarrowScreen = useMediaQuery('(max-width: 767px)')
const queryParams = reactive({ status: undefined as CommissionPayableStatus | undefined, channelId: '', beneficiaryId: '' })
const { getLabel: statusLabel } = useDict('COMMISSION_PAYABLE_STATUS')
const { getLabel: beneficiaryTypeLabel } = useDict('COMMISSION_BENEFICIARY_TYPE')
const amountText = (value?: number, currency = 'CNY') => value === undefined || value === null ? '***' : `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const rateText = (value?: number) => value === undefined || value === null ? '***' : `${(value * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}%`
const beneficiaryLabel = (value: unknown) => { const row = value as CommissionPayableVO; return row.beneficiaryId === '***' ? '***' : `${beneficiaryTypeLabel(row.beneficiaryType)} / ${row.beneficiaryId}` }
const canSettle = (value: unknown) => { const row = value as CommissionPayableVO; return ['PENDING', 'PARTIALLY_SETTLED'].includes(row.status) && row.payableAmount !== undefined }
const canClawback = (value: unknown) => { const row = value as CommissionPayableVO; return ['PARTIALLY_SETTLED', 'SETTLED'].includes(row.status) && (row.settledAmount || 0) > 0 }

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } = useTable<CommissionPayableVO, typeof queryParams>(
  (params) => getCommissionPayableList({ ...params, channelId: params.channelId || undefined, beneficiaryId: params.beneficiaryId || undefined }), queryParams,
)

const detailVisible = ref(false)
const detail = ref<CommissionPayableVO | null>(null)
const current = ref<CommissionPayableVO | null>(null)
const amountVisible = ref(false)
const amountMode = ref<'settle' | 'clawback'>('settle')
const actionAmount = ref(0)
const actionLoading = ref(false)
const actionLimit = computed(() => {
  if (!current.value) return 0
  return amountMode.value === 'settle'
    ? Math.max((current.value.payableAmount || 0) - (current.value.settledAmount || 0), 0)
    : current.value.settledAmount || 0
})

async function showDetail(value: unknown) { const row = value as CommissionPayableVO; detail.value = await getCommissionPayable(row.payableId); detailVisible.value = true }
function openAmountAction(value: unknown, mode: 'settle' | 'clawback') { const row = value as CommissionPayableVO; current.value = row; amountMode.value = mode; actionAmount.value = mode === 'settle' ? Math.max((row.payableAmount || 0) - (row.settledAmount || 0), 0) : row.settledAmount || 0; amountVisible.value = true }
async function submitAmountAction() {
  if (!current.value || actionAmount.value <= 0 || actionAmount.value > actionLimit.value) return ElMessage.warning('请输入合法金额')
  actionLoading.value = true
  try {
    if (amountMode.value === 'settle') await settleCommissionPayable(current.value.payableId, actionAmount.value)
    else await requestCommissionClawback(current.value.payableId, actionAmount.value)
    amountVisible.value = false
    ElMessage.success(amountMode.value === 'settle' ? '结算已登记' : '回拨已发起')
    await fetchData()
  } finally { actionLoading.value = false }
}
async function completeClawback(value: unknown) { const row = value as CommissionPayableVO; await ElMessageBox.confirm('确认回拨资金已完成？', '完成回拨', { type: 'warning' }); await completeCommissionClawback(row.payableId); ElMessage.success('回拨已完成'); await fetchData() }
async function cancelPayable(value: unknown) { const row = value as CommissionPayableVO; await ElMessageBox.confirm('取消后该笔佣金不再结算，确认继续？', '取消佣金应付', { type: 'warning' }); await cancelCommissionPayable(row.payableId); ElMessage.success('佣金应付已取消'); await fetchData() }

onMounted(async () => { const result = await getChannelList({ pageNum: 1, pageSize: 100 }); channels.value = result.list; await fetchData() })
</script>

<style scoped>
.page-intro { margin-bottom: 18px; }
h2 { margin: 0 0 8px; }
p { color: var(--ti-text-secondary, #86909c); margin: 0; }
.hash-text { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-all; }
.drawer-footer { display: flex; justify-content: flex-end; margin-top: 18px; }
@media (max-width: 767px) {
  .ti-search-form :deep(.el-form) { display: flex; flex-direction: column; }
}
</style>
