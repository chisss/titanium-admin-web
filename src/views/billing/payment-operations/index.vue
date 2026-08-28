<template>
  <div class="ti-page payment-operations">
    <div class="page-header">
      <h2>支付运营</h2>
      <el-tooltip content="刷新当前列表" placement="bottom">
        <el-button :icon="Refresh" circle :aria-label="'刷新当前列表'" @click="refreshActiveTab" />
      </el-tooltip>
    </div>

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="回调审计" name="callbacks">
        <TiSearchForm :model="callbackQuery" :has-advanced="true" @search="searchCallbacks" @reset="resetCallbacks">
          <el-form-item label="回调ID"><el-input v-model="callbackQuery.callbackId" clearable /></el-form-item>
          <el-form-item label="支付订单"><el-input v-model="callbackQuery.paymentId" clearable /></el-form-item>
          <el-form-item label="渠道结果">
            <TiDictSelect v-model="callbackQuery.resultStatus" dict-type="PAYMENT_CALLBACK_RESULT" placeholder="全部" style="width: 130px" />
          </el-form-item>
          <template #advanced>
            <el-form-item label="渠道"><el-input v-model="callbackQuery.channelCode" clearable /></el-form-item>
            <el-form-item label="密钥版本"><el-input v-model="callbackQuery.keyVersion" clearable /></el-form-item>
            <el-form-item label="安全模式">
              <TiDictSelect v-model="callbackQuery.securityMode" dict-type="PAYMENT_SIGNATURE_MODE" placeholder="全部" style="width: 165px" />
            </el-form-item>
            <el-form-item label="渠道交易号"><el-input v-model="callbackQuery.channelTransactionId" clearable /></el-form-item>
            <el-form-item label="处理状态">
              <TiDictSelect v-model="callbackQuery.status" dict-type="PAYMENT_CALLBACK_STATUS" placeholder="全部" style="width: 130px" />
            </el-form-item>
            <el-form-item label="发生时间">
              <el-date-picker v-model="callbackTimeRange" type="datetimerange" value-format="YYYY-MM-DDTHH:mm:ss" start-placeholder="开始时间" end-placeholder="结束时间" />
            </el-form-item>
          </template>
        </TiSearchForm>

        <el-alert v-if="callbackError" :title="callbackError" type="error" show-icon :closable="false" class="table-alert" />
        <div class="table-scroll">
          <TiTable :data="callbacks" :total="callbackPage.total" :page-num="callbackPage.pageNum" :page-size="callbackPage.pageSize" :loading="callbackLoading" @page-change="changeCallbackPage" @size-change="changeCallbackSize">
            <el-table-column prop="callbackId" label="回调ID" min-width="190"><template #default="{ row }"><TiCopyText :text="row.callbackId" /></template></el-table-column>
            <el-table-column prop="paymentId" label="支付订单" min-width="190"><template #default="{ row }"><TiCopyText :text="row.paymentId" /></template></el-table-column>
            <el-table-column prop="channelCode" label="渠道" width="120" />
            <el-table-column prop="keyVersion" label="密钥版本" width="110" />
            <el-table-column label="安全模式" width="135"><template #default="{ row }"><TiStatusTag :value="row.securityMode" :label="securityModeLabel(row.securityMode)" /></template></el-table-column>
            <el-table-column prop="channelTransactionId" label="渠道交易号" min-width="190"><template #default="{ row }"><TiCopyText :text="row.channelTransactionId" /></template></el-table-column>
            <el-table-column label="渠道结果" width="105"><template #default="{ row }"><TiStatusTag :value="row.resultStatus" :label="resultLabel(row.resultStatus)" /></template></el-table-column>
            <el-table-column label="金额" width="135"><template #default="{ row }">{{ amountText(row.amount, row.currency) }}</template></el-table-column>
            <el-table-column label="处理状态" width="110"><template #default="{ row }"><TiStatusTag :value="row.status" :label="callbackStatusLabel(row.status)" /></template></el-table-column>
            <el-table-column prop="failureMessage" label="失败原因" min-width="170" show-overflow-tooltip />
            <el-table-column prop="occurredAt" label="发生时间" width="170" />
            <el-table-column prop="updatedAt" label="更新时间" width="170" />
            <template #empty><el-empty description="暂无支付回调" :image-size="72" /></template>
          </TiTable>
        </div>
      </el-tab-pane>

      <el-tab-pane label="安全告警" name="security-events">
        <TiSearchForm :model="securityQuery" :has-advanced="true" @search="searchSecurityEvents" @reset="resetSecurityEvents">
          <el-form-item label="回调ID"><el-input v-model="securityQuery.callbackId" clearable /></el-form-item>
          <el-form-item label="渠道"><el-input v-model="securityQuery.channelCode" clearable /></el-form-item>
          <el-form-item label="事件类型">
            <TiDictSelect v-model="securityQuery.eventType" dict-type="PAYMENT_SECURITY_EVENT_TYPE" placeholder="全部" style="width: 155px" />
          </el-form-item>
          <template #advanced>
            <el-form-item label="支付订单"><el-input v-model="securityQuery.paymentId" clearable /></el-form-item>
            <el-form-item label="密钥版本"><el-input v-model="securityQuery.keyVersion" clearable /></el-form-item>
            <el-form-item label="告警状态">
              <el-select v-model="securityQuery.alertTriggered" clearable placeholder="全部" style="width: 130px">
                <el-option label="已触发" :value="true" /><el-option label="仅审计" :value="false" />
              </el-select>
            </el-form-item>
            <el-form-item label="事件时间">
              <el-date-picker v-model="securityTimeRange" type="datetimerange" value-format="YYYY-MM-DDTHH:mm:ss" start-placeholder="开始时间" end-placeholder="结束时间" />
            </el-form-item>
          </template>
        </TiSearchForm>

        <el-alert v-if="securityError" :title="securityError" type="error" show-icon :closable="false" class="table-alert" />
        <div class="table-scroll">
          <TiTable :data="securityEvents" :total="securityPage.total" :page-num="securityPage.pageNum" :page-size="securityPage.pageSize" :loading="securityLoading" @page-change="changeSecurityPage" @size-change="changeSecuritySize">
            <el-table-column prop="eventId" label="事件ID" min-width="190"><template #default="{ row }"><TiCopyText :text="row.eventId" /></template></el-table-column>
            <el-table-column prop="callbackId" label="回调ID" min-width="190"><template #default="{ row }"><TiCopyText :text="row.callbackId" /></template></el-table-column>
            <el-table-column prop="paymentId" label="支付订单" min-width="190"><template #default="{ row }"><TiCopyText :text="row.paymentId" /></template></el-table-column>
            <el-table-column prop="channelCode" label="渠道" width="120" />
            <el-table-column prop="keyVersion" label="密钥版本" width="110" />
            <el-table-column label="事件类型" width="140"><template #default="{ row }">{{ securityEventLabel(row.eventType) }}</template></el-table-column>
            <el-table-column label="级别" width="95"><template #default="{ row }"><TiStatusTag :value="row.severity" :label="securitySeverityLabel(row.severity)" /></template></el-table-column>
            <el-table-column label="告警" width="95"><template #default="{ row }"><TiStatusTag :value="row.alertTriggered ? 'FAILED' : 'PENDING'" :label="row.alertTriggered ? '已触发' : '仅审计'" /></template></el-table-column>
            <el-table-column prop="message" label="事件说明" min-width="220" show-overflow-tooltip />
            <el-table-column prop="createdAt" label="事件时间" width="170" />
            <template #empty><el-empty description="暂无安全事件" :image-size="72" /></template>
          </TiTable>
        </div>
      </el-tab-pane>

      <el-tab-pane label="收款对账" name="collections">
        <TiSearchForm :model="collectionQuery" :has-advanced="true" @search="searchCollections" @reset="resetCollections">
          <el-form-item label="收款订单"><el-input v-model="collectionQuery.orderId" clearable /></el-form-item>
          <el-form-item label="保单ID"><el-input v-model="collectionQuery.policyId" clearable /></el-form-item>
          <el-form-item label="状态">
            <TiDictSelect v-model="collectionQuery.status" dict-type="PAYMENT_COLLECTION_STATUS" placeholder="全部" style="width: 130px" />
          </el-form-item>
          <template #advanced>
            <el-form-item label="支付订单"><el-input v-model="collectionQuery.paymentId" clearable /></el-form-item>
            <el-form-item label="客户ID"><el-input v-model="collectionQuery.customerId" clearable /></el-form-item>
            <el-form-item label="Payment状态"><el-input v-model="collectionQuery.paymentStatus" clearable /></el-form-item>
            <el-form-item label="更新时间">
              <el-date-picker v-model="collectionTimeRange" type="datetimerange" value-format="YYYY-MM-DDTHH:mm:ss" start-placeholder="开始时间" end-placeholder="结束时间" />
            </el-form-item>
          </template>
        </TiSearchForm>

        <el-alert v-if="collectionError" :title="collectionError" type="error" show-icon :closable="false" class="table-alert" />
        <div class="table-scroll">
          <TiTable :data="collections" :total="collectionPage.total" :page-num="collectionPage.pageNum" :page-size="collectionPage.pageSize" :loading="collectionLoading" @page-change="changeCollectionPage" @size-change="changeCollectionSize">
            <el-table-column prop="orderId" label="收款订单" min-width="190"><template #default="{ row }"><TiCopyText :text="row.orderId" /></template></el-table-column>
            <el-table-column prop="postingId" label="入账ID" min-width="190"><template #default="{ row }"><TiCopyText :text="row.postingId" /></template></el-table-column>
            <el-table-column prop="paymentId" label="支付订单" min-width="190"><template #default="{ row }"><TiCopyText :text="row.paymentId" /></template></el-table-column>
            <el-table-column prop="policyId" label="保单ID" min-width="175"><template #default="{ row }"><TiCopyText :text="row.policyId" /></template></el-table-column>
            <el-table-column prop="customerId" label="客户ID" min-width="175"><template #default="{ row }"><TiCopyText :text="row.customerId" /></template></el-table-column>
            <el-table-column label="金额" width="135"><template #default="{ row }">{{ amountText(row.amount, row.currency) }}</template></el-table-column>
            <el-table-column label="Billing状态" width="115"><template #default="{ row }"><TiStatusTag :value="row.status" :label="collectionStatusLabel(row.status)" /></template></el-table-column>
            <el-table-column label="Payment状态" width="120"><template #default="{ row }"><TiStatusTag :value="row.paymentStatus" /></template></el-table-column>
            <el-table-column prop="updatedAt" label="更新时间" width="170" />
            <el-table-column label="操作" :fixed="isNarrowScreen ? false : 'right'" width="110">
              <template #default="{ row }">
                <el-button v-if="row.status === 'PENDING'" v-permission="'billing:payment-operations:reconcile'" link type="primary" :loading="reconcilingId === row.orderId" @click="reconcile(row)">人工对账</el-button>
              </template>
            </el-table-column>
            <template #empty><el-empty description="暂无收款订单" :image-size="72" /></template>
          </TiTable>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useMediaQuery } from '@vueuse/core'
import {
  getPaymentCallbackAudits, getPaymentCallbackSecurityEvents, getPremiumCollectionOrders,
  reconcilePremiumCollectionOrder, type CallbackAuditQuery, type CallbackSecurityEventQuery,
  type CollectionOrderQuery, type PaymentCallbackAuditVO,
  type PaymentCallbackSecurityEventVO, type PremiumCollectionOrderVO,
} from '@/api/payment-operations'
import TiCopyText from '@/components/TiCopyText/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiTable from '@/components/TiTable/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'

const activeTab = ref('callbacks')
const isNarrowScreen = useMediaQuery('(max-width: 767px)')
const callbackQuery = reactive<CallbackAuditQuery>({ pageNum: 1, pageSize: 20 })
const securityQuery = reactive<CallbackSecurityEventQuery>({ pageNum: 1, pageSize: 20 })
const collectionQuery = reactive<CollectionOrderQuery>({ pageNum: 1, pageSize: 20 })
const callbackTimeRange = ref<string[]>([])
const securityTimeRange = ref<string[]>([])
const collectionTimeRange = ref<string[]>([])
const callbacks = ref<PaymentCallbackAuditVO[]>([])
const securityEvents = ref<PaymentCallbackSecurityEventVO[]>([])
const collections = ref<PremiumCollectionOrderVO[]>([])
const callbackPage = reactive({ total: 0, pageNum: 1, pageSize: 20 })
const securityPage = reactive({ total: 0, pageNum: 1, pageSize: 20 })
const collectionPage = reactive({ total: 0, pageNum: 1, pageSize: 20 })
const callbackLoading = ref(false)
const securityLoading = ref(false)
const collectionLoading = ref(false)
const callbackError = ref('')
const securityError = ref('')
const collectionError = ref('')
const reconcilingId = ref('')
let securityEventsLoaded = false
let collectionsLoaded = false

const amountText = (amount: number, currency: string) => `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const { getLabel: resultLabel } = useDict('PAYMENT_CALLBACK_RESULT')
const { getLabel: callbackStatusLabel } = useDict('PAYMENT_CALLBACK_STATUS')
const { getLabel: collectionStatusLabel } = useDict('PAYMENT_COLLECTION_STATUS')
const { getLabel: securityEventLabel } = useDict('PAYMENT_SECURITY_EVENT_TYPE')
const { getLabel: securityModeLabel } = useDict('PAYMENT_SIGNATURE_MODE')
const { getLabel: securitySeverityLabel } = useDict('SECURITY_SEVERITY')
const errorText = (error: unknown) => error instanceof Error ? error.message : '查询失败，请稍后重试'

async function fetchCallbacks() {
  callbackLoading.value = true; callbackError.value = ''
  try {
    const result = await getPaymentCallbackAudits({ ...callbackQuery, occurredAtStart: callbackTimeRange.value[0], occurredAtEnd: callbackTimeRange.value[1] })
    callbacks.value = result.list || []; Object.assign(callbackPage, { total: result.total || 0, pageNum: callbackQuery.pageNum, pageSize: callbackQuery.pageSize })
  } catch (error) { callbacks.value = []; callbackError.value = errorText(error) } finally { callbackLoading.value = false }
}
async function fetchCollections() {
  collectionLoading.value = true; collectionError.value = ''
  try {
    const result = await getPremiumCollectionOrders({ ...collectionQuery, updatedAtStart: collectionTimeRange.value[0], updatedAtEnd: collectionTimeRange.value[1] })
    collections.value = result.list || []; Object.assign(collectionPage, { total: result.total || 0, pageNum: collectionQuery.pageNum, pageSize: collectionQuery.pageSize }); collectionsLoaded = true
  } catch (error) { collections.value = []; collectionError.value = errorText(error) } finally { collectionLoading.value = false }
}
async function fetchSecurityEvents() {
  securityLoading.value = true; securityError.value = ''
  try {
    const result = await getPaymentCallbackSecurityEvents({ ...securityQuery, createdAtStart: securityTimeRange.value[0], createdAtEnd: securityTimeRange.value[1] })
    securityEvents.value = result.list || []; Object.assign(securityPage, { total: result.total || 0, pageNum: securityQuery.pageNum, pageSize: securityQuery.pageSize }); securityEventsLoaded = true
  } catch (error) { securityEvents.value = []; securityError.value = errorText(error) } finally { securityLoading.value = false }
}
function searchCallbacks() { callbackQuery.pageNum = 1; void fetchCallbacks() }
function resetCallbacks() { Object.assign(callbackQuery, { callbackId: undefined, paymentId: undefined, channelCode: undefined, keyVersion: undefined, securityMode: undefined, channelTransactionId: undefined, resultStatus: undefined, status: undefined, pageNum: 1, pageSize: 20 }); callbackTimeRange.value = []; void fetchCallbacks() }
function searchSecurityEvents() { securityQuery.pageNum = 1; void fetchSecurityEvents() }
function resetSecurityEvents() { Object.assign(securityQuery, { callbackId: undefined, paymentId: undefined, channelCode: undefined, keyVersion: undefined, eventType: undefined, alertTriggered: undefined, pageNum: 1, pageSize: 20 }); securityTimeRange.value = []; void fetchSecurityEvents() }
function searchCollections() { collectionQuery.pageNum = 1; void fetchCollections() }
function resetCollections() { Object.assign(collectionQuery, { orderId: undefined, postingId: undefined, paymentId: undefined, policyId: undefined, customerId: undefined, status: undefined, paymentStatus: undefined, pageNum: 1, pageSize: 20 }); collectionTimeRange.value = []; void fetchCollections() }
function changeCallbackPage(page: number) { callbackQuery.pageNum = page; void fetchCallbacks() }
function changeCallbackSize(size: number) { callbackQuery.pageNum = 1; callbackQuery.pageSize = size; void fetchCallbacks() }
function changeSecurityPage(page: number) { securityQuery.pageNum = page; void fetchSecurityEvents() }
function changeSecuritySize(size: number) { securityQuery.pageNum = 1; securityQuery.pageSize = size; void fetchSecurityEvents() }
function changeCollectionPage(page: number) { collectionQuery.pageNum = page; void fetchCollections() }
function changeCollectionSize(size: number) { collectionQuery.pageNum = 1; collectionQuery.pageSize = size; void fetchCollections() }
function refreshActiveTab() {
  if (activeTab.value === 'callbacks') void fetchCallbacks()
  else if (activeTab.value === 'security-events') void fetchSecurityEvents()
  else void fetchCollections()
}
function handleTabChange(tab: string | number) {
  if (tab === 'security-events' && !securityEventsLoaded) void fetchSecurityEvents()
  if (tab === 'collections' && !collectionsLoaded) void fetchCollections()
}
async function reconcile(value: unknown) {
  const row = value as PremiumCollectionOrderVO
  await ElMessageBox.confirm(`确认立即核对收款订单 ${row.orderId} 的 Payment 状态？`, '人工对账', { type: 'warning' })
  reconcilingId.value = row.orderId
  try { await reconcilePremiumCollectionOrder(row.orderId); ElMessage.success('对账完成'); await fetchCollections() }
  finally { reconcilingId.value = '' }
}

onMounted(fetchCallbacks)
</script>

<style scoped>
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
h2 { margin: 0; font-size: 22px; }
.table-alert { margin-bottom: 12px; }
.table-scroll { min-width: 0; overflow-x: auto; }
.table-scroll :deep(.ti-table-wrap) { min-width: 1080px; }
@media (max-width: 767px) {
  .payment-operations :deep(.el-date-editor) { width: min(100%, 340px); }
  .payment-operations :deep(.ti-search-basic) { align-items: flex-start; }
}
</style>
