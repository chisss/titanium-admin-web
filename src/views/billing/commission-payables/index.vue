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
      :max-height="'var(--ti-table-max-height-default)'"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      :error="tableError"
      @refresh="retry"
    >
      <el-table-column prop="payableId" label="应付编号" min-width="190"><template #default="{ row }"><TiCopyText :text="row.payableId" /></template></el-table-column>
      <el-table-column label="佣金方案" min-width="180"><template #default="{ row }">{{ row.schemeCode }} / {{ row.schemeVersion }}</template></el-table-column>
      <el-table-column label="受益方" min-width="180"><template #default="{ row }">{{ beneficiaryLabel(row) }}</template></el-table-column>
      <el-table-column label="应付金额" width="135" align="right"><template #default="{ row }">{{ amountText(row.payableAmount, row.currency) }}</template></el-table-column>
      <el-table-column label="已结算" width="130" align="right"><template #default="{ row }">{{ amountText(row.settledAmount, row.currency) }}</template></el-table-column>
      <el-table-column label="回拨金额" width="130" align="right"><template #default="{ row }">{{ amountText(row.clawbackAmount, row.currency) }}</template></el-table-column>
      <el-table-column label="状态" width="120"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
      <el-table-column prop="updatedAt" label="更新时间" width="170">
        <!-- 时间列统一走全局日期工具，避免直出后端 ISO 串（2026-09-18 全站实测 7 页 8 列） -->
        <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" :fixed="isNarrowScreen ? false : 'right'" width="280" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="showDetail(row)">查看</el-button>
          <el-button v-if="canSettle(row)" size="small" type="primary" v-permission="'billing:commission:settle'" @click="openAmountAction(row, 'settle')">登记结算</el-button>
          <el-button v-if="canClawback(row)" size="small" type="warning" v-permission="'billing:commission:clawback'" @click="openAmountAction(row, 'clawback')">发起回拨</el-button>
          <el-button v-if="row.status === 'CLAWBACK_PENDING'" size="small" type="success" v-permission="'billing:commission:clawback'" :loading="rowPending === actionKey(row.payableId, 'complete-clawback')" @click="completeClawback(row)">完成回拨</el-button>
          <el-button v-if="row.status === 'PENDING'" size="small" type="danger" :icon="CloseBold" v-permission="'billing:commission:cancel'" :loading="rowPending === actionKey(row.payableId, 'cancel')" @click="cancelPayable(row)">取消</el-button>
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
      <el-descriptions v-if="detail" :column="detailColumns" border>
        <el-descriptions-item label="应付编号" :span="2">{{ detail.payableId }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusLabel(detail.status) }}</el-descriptions-item>
        <el-descriptions-item label="方案">{{ detail.schemeCode }} / {{ detail.schemeVersion }}</el-descriptions-item>
        <el-descriptions-item label="受益方">{{ beneficiaryLabel(detail) }}</el-descriptions-item>
        <el-descriptions-item label="计算基数">{{ amountText(detail.baseAmount, detail.currency) }}</el-descriptions-item>
        <el-descriptions-item label="佣金总额">{{ amountText(detail.grossCommission, detail.currency) }}</el-descriptions-item>
        <el-descriptions-item label="分润比例">{{ formatRate(detail.splitRate, '***') }}</el-descriptions-item>
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
import { ElMessage } from 'element-plus'
import { CloseBold, View } from '@element-plus/icons-vue'
import { useMediaQuery } from '@vueuse/core'
import { getChannelList, type ChannelVO } from '@/api/channel'
import {
  cancelCommissionPayable, completeCommissionClawback, getCommissionPayable,
  getCommissionPayableList, requestCommissionClawback, settleCommissionPayable,
  type CommissionPayableStatus, type CommissionPayableVO,
} from '@/api/billing'
import { useRowAction, confirmAction, actionKey } from '@/composables/useRowAction'
import { useTable } from '@/composables/useTable'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiTable from '@/components/TiTable/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDetailColumns } from '@/composables/useDetailColumns'
import { useDict } from '@/composables/useDict'
import { MEDIA_MAX_MOBILE } from '@/constants/layout'
import { formatDateTime } from '@/utils/date'
import { formatAmount, formatRate } from '@/utils/format'

const router = useRouter()
const channels = ref<ChannelVO[]>([])
const isNarrowScreen = useMediaQuery(MEDIA_MAX_MOBILE)
const queryParams = reactive({ status: undefined as CommissionPayableStatus | undefined, channelId: '', beneficiaryId: '' })
const { getLabel: statusLabel } = useDict('COMMISSION_PAYABLE_STATUS')
const { getLabel: beneficiaryTypeLabel } = useDict('COMMISSION_BENEFICIARY_TYPE')
const amountText = (value?: number, currency?: string) => value === undefined || value === null ? '***' : formatAmount(value, currency)
const beneficiaryLabel = (value: unknown) => { const row = value as CommissionPayableVO; return row.beneficiaryId === '***' ? '***' : `${beneficiaryTypeLabel(row.beneficiaryType)} / ${row.beneficiaryId}` }
const canSettle = (value: unknown) => { const row = value as CommissionPayableVO; return ['PENDING', 'PARTIALLY_SETTLED'].includes(row.status) && row.payableAmount !== undefined }
const canClawback = (value: unknown) => { const row = value as CommissionPayableVO; return ['PARTIALLY_SETTLED', 'SETTLED'].includes(row.status) && (row.settledAmount || 0) > 0 }

const { tableData, tableLoading, tableError, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange, retry } = useTable<CommissionPayableVO, typeof queryParams>(
  (params) => getCommissionPayableList({ ...params, channelId: params.channelId || undefined, beneficiaryId: params.beneficiaryId || undefined }), queryParams,
  // 本页首屏须先取渠道下拉数据（见 onMounted），再带筛选条件查列表，故不由 useTable 自动加载
  { immediate: false },
)

/** 详情抽屉的描述区：字段短，宽屏 3 档（窄屏列数由组合式函数统一降为 1） */
const detailColumns = useDetailColumns(3)

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
/**
 * 行内状态推进（完成回拨 / 取消）的在途行键。
 *
 * <p>🔴 原先这两个按钮点下去**界面上毫无变化**：确认框关闭后到列表刷新之间，佣金应付的
 * 状态没有变、行也没有任何标记，而二者都是不可逆的资金状态推进（完成回拨＝认定资金已收回、
 * 取消＝该笔佣金不再结算），请求在途时用户必然以为没点中而重复点击。
 * 同页 `submitAmountAction`（金额对话框）已有 `actionLoading` + finally，两套标准并存。</p>
 */
const { rowPending, run } = useRowAction(fetchData)

/** 完成回拨 */
async function completeClawback(value: unknown) {
  const row = value as CommissionPayableVO
  // 确认框在 run 之外：用户取消不该让按钮进过一次 loading（进过就会闪一下，像是「执行了」）
  if (!(await confirmAction('确认回拨资金已完成？', '完成回拨', { type: 'warning' }))) return
  await run(actionKey(row.payableId, 'complete-clawback'), async () => {
    await completeCommissionClawback(row.payableId)
    ElMessage.success('回拨已完成')
  })
}

/** 取消佣金应付 */
async function cancelPayable(value: unknown) {
  const row = value as CommissionPayableVO
  const ok = await confirmAction('取消后该笔佣金不再结算，确认继续？', '取消佣金应付', {
    type: 'warning', confirmButtonClass: 'el-button--danger',
  })
  if (!ok) return
  // 两个按钮由状态 v-if 互斥、不会并排出现，共用行主键本也安全；
  // 仍带上动作名是为了「同页两个动作的 pending 键同一套形状」——状态机的 v-if 条件将来若放宽，
  // 不会退化成两点共亮
  await run(actionKey(row.payableId, 'cancel'), async () => {
    await cancelCommissionPayable(row.payableId)
    ElMessage.success('佣金应付已取消')
  })
}

onMounted(async () => { const result = await getChannelList({ pageNum: 1, pageSize: 100 }); channels.value = result.list; await fetchData() })
</script>

<style scoped lang="scss">
.page-intro { margin-bottom: 18px; }
h2 { margin: 0 0 8px; }
p { color: $text-secondary; margin: 0; }
.hash-text { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-all; }
.drawer-footer { display: flex; justify-content: flex-end; margin-top: 18px; }
@media (max-width: $breakpoint-mobile) {
  .ti-search-form :deep(.el-form) { display: flex; flex-direction: column; }
}
</style>
