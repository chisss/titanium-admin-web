<template>
  <!-- 客户详情 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="customerLoading">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>客户详情 - {{ customer?.fullName || '-' }}</h3>
      </div>

      <el-alert
        v-if="customerError"
        title="客户详情加载失败"
        type="error"
        :closable="false"
        show-icon
        class="state-alert"
      >
        <template #default>
          <el-button type="primary" link @click="loadCustomer">重新加载</el-button>
        </template>
      </el-alert>

      <!-- 基本信息 -->
      <el-descriptions v-if="customer" :column="3" border style="margin-bottom: 24px">
        <el-descriptions-item label="客户姓名">{{ customer.fullName }}</el-descriptions-item>
        <el-descriptions-item label="客户类型">{{ customer.customerType || '-' }}</el-descriptions-item>
        <el-descriptions-item label="性别">
          {{ customer.gender === 'MALE' ? '男' : customer.gender === 'FEMALE' ? '女' : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="证件类型">{{ customer.idType }}</el-descriptions-item>
        <el-descriptions-item label="证件号码">{{ customer.idNo }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ customer.phoneNumber }}</el-descriptions-item>
        <el-descriptions-item label="邮箱" :span="2">{{ customer.email || '-' }}</el-descriptions-item>
        <el-descriptions-item label="地址" :span="3">{{ customer.address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ customer.status || '-' }}</el-descriptions-item>
        <el-descriptions-item label="注册时间">{{ customer.createTime || '-' }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ customer.updateTime || '-' }}</el-descriptions-item>
      </el-descriptions>

      <template v-if="customer">
        <el-divider />

        <section class="related-section">
          <div class="section-header">
            <div class="section-title">关联保单</div>
            <el-button :icon="Refresh" text :loading="policiesLoading" @click="loadRelatedData">刷新</el-button>
          </div>

          <div v-if="policiesLoading" class="state-placeholder">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>正在加载关联保单</span>
          </div>
          <el-alert
            v-else-if="policiesError"
            title="关联保单加载失败"
            type="error"
            :closable="false"
            show-icon
          >
            <template #default>
              <el-button type="primary" link @click="loadRelatedData">重新加载</el-button>
            </template>
          </el-alert>
          <el-empty v-else-if="policies.length === 0" description="暂无关联保单" :image-size="80" />
          <template v-else>
            <!-- @vue-generic {CustomerPolicyVO} -->
            <el-table :data="policies" border stripe size="small" row-key="policyId">
              <el-table-column prop="policyNo" label="保单号" min-width="170" show-overflow-tooltip />
              <el-table-column prop="productName" label="产品" min-width="150" show-overflow-tooltip>
                <template #default="{ row }">{{ row.productName || row.productCode || '-' }}</template>
              </el-table-column>
              <el-table-column prop="policyHolderName" label="投保人" width="110" />
              <el-table-column prop="insuredName" label="被保人" width="110" />
              <el-table-column prop="premium" label="保费" width="110">
                <template #default="{ row }">{{ formatAmount(row.premium, row.currency) }}</template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="110">
                <template #default="{ row }">
                  <TiStatusTag :value="row.status || 'UNKNOWN'" :label="policyStatusLabel(row.status)" />
                </template>
              </el-table-column>
              <el-table-column label="受益人" width="110">
                <template #default="{ row }">
                  <el-tag v-if="beneficiaryErrors[row.policyId]" type="danger" size="small">加载失败</el-tag>
                  <span v-else-if="beneficiariesLoaded[row.policyId]">{{ beneficiariesByPolicy[row.policyId]?.length ?? 0 }} 人</span>
                  <el-icon v-else class="is-loading"><Loading /></el-icon>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="90" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" :icon="View" @click="goPolicyDetail(row.policyId)">详情</el-button>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </section>

        <section v-if="policies.length > 0 && !policiesLoading && !policiesError" class="related-section">
          <div class="section-header">
            <div class="section-title">受益人信息</div>
            <span v-if="beneficiaryPartialFailure" class="section-hint">部分保单受益人加载失败</span>
          </div>

          <div v-if="beneficiaryLoading" class="state-placeholder">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>正在加载受益人信息</span>
          </div>
          <el-alert
            v-else-if="beneficiaryAllFailed"
            title="受益人信息加载失败"
            type="error"
            :closable="false"
            show-icon
          />
          <el-alert
            v-else-if="beneficiaryPartialFailure"
            title="部分保单受益人信息暂不可用"
            type="warning"
            :closable="false"
            show-icon
            class="state-alert"
          />
          <el-empty v-if="!beneficiaryLoading && !beneficiaryAllFailed && beneficiaryRows.length === 0" description="暂无受益人信息" :image-size="80" />
          <el-table v-if="!beneficiaryLoading && beneficiaryRows.length > 0" :data="beneficiaryRows" border stripe size="small" row-key="rowKey">
            <el-table-column prop="policyNo" label="保单号" min-width="170" show-overflow-tooltip />
            <el-table-column prop="beneficiaryName" label="受益人" width="130" />
            <el-table-column prop="beneficiaryType" label="受益类型" width="120">
              <template #default="{ row }">{{ beneficiaryTypeLabel(row.beneficiaryType) }}</template>
            </el-table-column>
            <el-table-column prop="orderNo" label="顺位" width="80" />
            <el-table-column prop="shareRatio" label="受益份额" width="110">
              <template #default="{ row }">{{ formatRatio(row.shareRatio) }}</template>
            </el-table-column>
          </el-table>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Loading, Refresh, View } from '@element-plus/icons-vue'
import { getCustomerDetail } from '@/api/customer'
import { getPoliciesByCustomer, getPolicyBeneficiaries } from '@/api/policy'
import type { CustomerPolicyVO, PolicyBeneficiaryVO } from '@/api/policy'
import type { CustomerVO } from '@/types/business.d'
import TiStatusTag from '@/components/TiStatusTag/index.vue'

const route = useRoute()
const router = useRouter()
const customerLoading = ref(false)
const customerError = ref(false)
const customer = ref<CustomerVO | null>(null)
const policiesLoading = ref(false)
const policiesError = ref(false)
const policies = ref<CustomerPolicyVO[]>([])
const beneficiariesByPolicy = ref<Record<string, PolicyBeneficiaryVO[]>>({})
const beneficiariesLoaded = ref<Record<string, boolean>>({})
const beneficiaryErrors = ref<Record<string, boolean>>({})
const beneficiaryLoading = ref(false)
let relatedRequestId = 0

const beneficiaryRows = computed(() => policies.value.flatMap((policy) =>
  (beneficiariesByPolicy.value[policy.policyId] ?? []).map((beneficiary, index) => ({
    ...beneficiary,
    policyNo: policy.policyNo || policy.policyId,
    rowKey: `${policy.policyId}-${beneficiary.orderNo ?? index}-${beneficiary.customerId ?? beneficiary.beneficiaryName ?? index}`,
  })),
))

const beneficiaryAllFailed = computed(() =>
  policies.value.length > 0 && policies.value.every((policy) => beneficiaryErrors.value[policy.policyId]),
)

const beneficiaryPartialFailure = computed(() =>
  policies.value.some((policy) => beneficiaryErrors.value[policy.policyId]) && !beneficiaryAllFailed.value,
)

const policyStatusLabel = (status?: string) => ({
  PROPOSAL: '投保中',
  PENDING: '待审核',
  PENDING_PAYMENT: '待缴费',
  ACTIVE: '生效中',
  PENDING_EFFECTIVE: '待生效',
  EFFECTIVE: '已生效',
  SUSPENDED: '已中止',
  LAPSED: '已失效',
  EXPIRED: '已到期',
  CANCELLED: '已撤销',
  TERMINATED: '已终止',
}[status || ''] || status || '未知')

const beneficiaryTypeLabel = (type?: string) => ({
  DEATH: '身故受益人',
  SURVIVAL: '生存受益人',
}[type || ''] || type || '-')

const formatAmount = (amount?: number, currency?: string) => {
  if (amount == null) return '-'
  const prefix = currency === 'CNY' || !currency ? '¥' : `${currency} `
  return `${prefix}${amount.toLocaleString()}`
}

const formatRatio = (ratio?: number) => ratio == null ? '-' : `${ratio}%`

const loadCustomer = async () => {
  customerLoading.value = true
  customerError.value = false
  try {
    customer.value = await getCustomerDetail(route.params.id as string)
  } catch {
    customer.value = null
    customerError.value = true
    return
  } finally {
    customerLoading.value = false
  }
  await loadRelatedData()
}

const loadRelatedData = async () => {
  if (!customer.value) return
  const requestId = ++relatedRequestId
  policiesLoading.value = true
  policiesError.value = false
  policies.value = []
  beneficiariesByPolicy.value = {}
  beneficiariesLoaded.value = {}
  beneficiaryErrors.value = {}
  beneficiaryLoading.value = false
  try {
    const result = await getPoliciesByCustomer(customer.value.customerId, { page: 0, size: 20 })
    if (requestId !== relatedRequestId) return
    policies.value = Array.isArray(result) ? result : []
  } catch {
    if (requestId !== relatedRequestId) return
    policiesError.value = true
    return
  } finally {
    if (requestId === relatedRequestId) policiesLoading.value = false
  }

  if (policies.value.length === 0) return
  beneficiaryLoading.value = true
  const results = await Promise.allSettled(
    policies.value.map((policy) => getPolicyBeneficiaries(policy.policyId)),
  )
  if (requestId !== relatedRequestId) return
  results.forEach((result, index) => {
    const policyId = policies.value[index].policyId
    beneficiariesLoaded.value[policyId] = true
    if (result.status === 'fulfilled') {
      beneficiariesByPolicy.value[policyId] = Array.isArray(result.value) ? result.value : []
    } else {
      beneficiaryErrors.value[policyId] = true
    }
  })
  beneficiaryLoading.value = false
  if (beneficiaryAllFailed.value) {
    ElMessage.error('受益人信息加载失败')
  } else if (beneficiaryPartialFailure.value) {
    ElMessage.warning('部分保单受益人信息加载失败')
  }
}

const goPolicyDetail = (policyId: string) => router.push(`/policy/detail/${policyId}`)

onMounted(loadCustomer)
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

.state-alert {
  margin-bottom: 16px;
}

.related-section {
  margin-top: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.section-hint {
  color: #e6a23c;
  font-size: 13px;
}

.state-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 120px;
  color: #909399;
}

</style>
