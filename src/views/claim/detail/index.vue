<template>
  <!-- 理赔案件详情 -->
  <div class="ti-page">
    <!-- 头部：报案号 + 状态标签 -->
    <div class="ti-detail-header">
      <div class="header-left">
        <el-button :icon="ArrowLeft" text @click="goBack">返回列表</el-button>
        <el-divider direction="vertical" />
        <span class="header-title">理赔案件详情</span>
        <TiStatusTag v-if="claim" :value="claim.status" :label="claimStatusLabel(claim.status)" class="header-tag" />
      </div>
      <div class="header-right" v-if="claim">
        <el-button
          v-for="action in currentActions"
          :key="action.key"
          :type="action.type"
          :disabled="!claim || actionLoading"
          @click="onAction(action)"
        >
          {{ action.label }}
        </el-button>
      </div>
    </div>

    <!-- 基础信息卡片 -->
    <el-card class="ti-card" shadow="never">
      <template #header>
        <span class="card-title">基础信息</span>
      </template>
      <el-descriptions v-if="claim" :column="2" border>
        <el-descriptions-item label="报案号">
          <el-text class="mono">{{ claim.claimNumber }}</el-text>
        </el-descriptions-item>
        <el-descriptions-item label="理赔类型">{{ claimTypeLabel(claim.claimType) }}</el-descriptions-item>
        <el-descriptions-item label="客户ID">
          <TiCopyText :text="claim.customerId" />
        </el-descriptions-item>
        <el-descriptions-item label="保单ID">
          <TiCopyText :text="claim.policyId" />
        </el-descriptions-item>
        <el-descriptions-item label="出险日期">{{ formatDateTime(claim.incidentDate) }}</el-descriptions-item>
        <el-descriptions-item label="申请赔付">
          <span class="amount">¥{{ formatAmount(claim.claimAmount) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="报案时间">{{ formatDateTime(claim.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatDateTime(claim.updatedAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="claim.phase" label="处理阶段">{{ claimPhaseLabel(claim.phase) }}</el-descriptions-item>
        <el-descriptions-item v-if="claim.paymentStatus" label="赔付状态">
          <el-tag :type="claim.paymentStatus === 'PROCESSING' ? 'warning' : claim.paymentStatus === 'SUCCESS' ? 'success' : 'info'" size="small">
            {{ paymentStatusLabel(claim.paymentStatus) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-if="claim.settledAmount != null" label="核定赔付">
          <span class="amount">¥{{ formatAmount(claim.settledAmount) }}</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="claim.paymentNo" label="支付单号">
          <el-text class="mono">{{ claim.paymentNo }}</el-text>
        </el-descriptions-item>
        <el-descriptions-item v-if="claim.rejectionReason" label="拒赔原因" :span="2">
          {{ rejectReasonLabel(claim.rejectionReason) }}
        </el-descriptions-item>
        <el-descriptions-item v-if="claim.closedAt" label="结案时间" :span="2">
          {{ formatDateTime(claim.closedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="事故描述" :span="2">{{ claim.incidentDescription || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-skeleton v-else :rows="5" animated />
    </el-card>

    <!-- 赔付中提示（结算后待支付域回写，禁止重复结算） -->
    <el-alert
      v-if="claim && claim.paymentStatus === 'PROCESSING'"
      class="ti-alert"
      type="warning"
      :closable="false"
      show-icon
      title="案件已进入赔付流程，等待支付域出账回写，请勿重复结算"
    />

    <!-- 操作弹窗集合 -->
    <!-- 查勘 -->
    <el-dialog v-model="surveyDialog" title="提交查勘" width="560px" destroy-on-close>
      <el-form ref="surveyFormRef" :model="surveyForm" :rules="surveyRules" label-width="100px">
        <el-form-item label="查勘员ID" prop="surveyorId">
          <el-input v-model="surveyForm.surveyorId" placeholder="请输入查勘员ID" clearable />
        </el-form-item>
        <el-form-item label="查勘结论" prop="conclusion">
          <el-input v-model="surveyForm.conclusion" type="textarea" :rows="2" placeholder="查勘结论（可选）" />
        </el-form-item>
        <el-form-item label="查勘报告">
          <el-input v-model="surveyForm.surveyReport" type="textarea" :rows="3" placeholder="查勘报告内容（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="surveyDialog = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading" @click="submitSurveyForm">确认提交</el-button>
      </template>
    </el-dialog>

    <!-- 定损 -->
    <el-dialog v-model="assessmentDialog" title="提交定损" width="560px" destroy-on-close>
      <el-form ref="assessmentFormRef" :model="assessmentForm" :rules="assessmentRules" label-width="100px">
        <el-form-item label="定损金额" prop="assessedAmount">
          <el-input-number v-model="assessmentForm.assessedAmount" :min="0.01" :precision="2" style="width: 200px" />
        </el-form-item>
        <el-form-item label="赔付比例" prop="liabilityRatio">
          <el-input-number
            v-model="assessmentForm.liabilityRatio"
            :min="0"
            :max="100"
            :precision="1"
            style="width: 200px"
          />
          <span class="unit">%</span>
        </el-form-item>
        <el-form-item label="定损员ID" prop="assessorId">
          <el-input v-model="assessmentForm.assessorId" placeholder="请输入定损员ID" clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assessmentDialog = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading" @click="submitAssessmentForm">确认提交</el-button>
      </template>
    </el-dialog>

    <!-- 核赔结算 -->
    <el-dialog v-model="settleDialog" title="核赔结算" width="560px" destroy-on-close>
      <el-form ref="settleFormRef" :model="settleForm" :rules="settleRules" label-width="100px">
        <el-form-item label="赔付金额" prop="settledAmount">
          <el-input-number v-model="settleForm.settledAmount" :min="0.01" :precision="2" style="width: 200px" />
        </el-form-item>
        <el-form-item label="支付方式" prop="payoutMethod">
          <el-select v-model="settleForm.payoutMethod" placeholder="请选择支付方式" style="width: 200px">
            <el-option v-for="opt in payoutMethodOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="收款账户">
          <el-input v-model="settleForm.payeeAccount" placeholder="收款账户（可选）" clearable />
        </el-form-item>
        <el-form-item label="结案备注">
          <el-input v-model="settleForm.conclusion" type="textarea" :rows="2" placeholder="核赔结论（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settleDialog = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading" @click="submitSettle">确认结算</el-button>
      </template>
    </el-dialog>

    <!-- 拒赔 -->
    <el-dialog v-model="rejectDialog" title="拒赔" width="560px" destroy-on-close>
      <el-form ref="rejectFormRef" :model="rejectForm" :rules="rejectRules" label-width="100px">
        <el-form-item label="拒赔原因" prop="reasonCode">
          <el-select v-model="rejectForm.reasonCode" placeholder="请选择拒赔原因" style="width: 100%">
            <el-option v-for="opt in rejectReasonOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注说明">
          <el-input v-model="rejectForm.comment" type="textarea" :rows="2" placeholder="补充说明（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialog = false">取消</el-button>
        <el-button type="danger" :loading="actionLoading" @click="submitReject">确认拒赔</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import {
  getClaimDetail,
  updateClaimStatus,
  submitSurvey,
  submitLossAssessment,
  settleClaim,
  rejectClaim,
  closeClaim,
  quickPayClaim,
} from '@/api/claim'
import type { ClaimCaseVO } from '@/api/claim'
import { useDict } from '@/composables/useDict'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'

const route = useRoute()
const router = useRouter()
const claimId = route.params.id as string

const claim = ref<ClaimCaseVO | null>(null)
const actionLoading = ref(false)

/** 理赔类型字典（后端字典驱动，支持国际化） */
const { getLabel: claimTypeLabel } = useDict('CLAIM_TYPE')

/** 理赔状态字典（后端字典驱动，支持国际化） */
const { getLabel: claimStatusLabel } = useDict('CLAIM_STATUS')

/** 赔付状态字典（后端字典驱动，支持国际化） */
const { getLabel: paymentStatusLabel } = useDict('CLAIM_PAYMENT_STATUS')

/** 理赔阶段字典（后端字典驱动，支持国际化） */
const { getLabel: claimPhaseLabel } = useDict('CLAIM_PHASE')

/** 赔付方式字典（后端字典驱动，支持国际化） */
const { dictOptions: payoutMethodOptions } = useDict('CLAIM_PAYOUT_METHOD')

/** 拒赔原因字典（后端字典驱动，支持国际化） */
const { dictOptions: rejectReasonOptions, getLabel: rejectReasonLabel } = useDict('CLAIM_REJECT_REASON')

const formatDateTime = (dateStr: string | undefined) => {
  if (!dateStr) return '-'
  return dateStr.replace('T', ' ')
}

const formatAmount = (amount: number | undefined) => (amount ?? 0).toLocaleString()

interface ClaimAction {
  key: string
  label: string
  type: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}

/**
 * 状态机驱动可用操作（与 claim 聚合根 Claim.validateTransition 对齐）：
 * PENDING → 立案(PROCESSING)/拒赔
 * PROCESSING → 查勘/定损/批准(APPROVED)/拒赔
 * APPROVED → 核赔结算/快赔
 * PAID/REJECTED → 结案
 */
const currentActions = computed<ClaimAction[]>(() => {
  if (!claim.value) return []
  const status = claim.value.status
  switch (status) {
    case 'PENDING':
      return [
        { key: 'start', label: '立案', type: 'primary' },
        { key: 'reject', label: '拒赔', type: 'danger' },
      ]
    case 'PROCESSING':
      return [
        { key: 'survey', label: '查勘', type: 'primary' },
        { key: 'assessment', label: '定损', type: 'primary' },
        { key: 'approve', label: '核赔通过', type: 'success' },
        { key: 'quickPay', label: '快赔自动核赔', type: 'warning' },
        { key: 'reject', label: '拒赔', type: 'danger' },
      ]
    case 'APPROVED':
      // 赔付中（已结算待支付域回写）：禁用重复结算/快赔，等待回写或终态
      if (claim.value.paymentStatus === 'PROCESSING') {
        return []
      }
      return [
        { key: 'settle', label: '核赔结算', type: 'success' },
      ]
    case 'PAID':
    case 'REJECTED':
      return [{ key: 'close', label: '结案归档', type: 'info' }]
    default:
      return []
  }
})

// ===== 表单 =====

const surveyDialog = ref(false)
const surveyFormRef = ref<FormInstance>()
const surveyForm = reactive({ surveyorId: '', surveyReport: '', conclusion: '' })
const surveyRules: FormRules = {
  surveyorId: [{ required: true, message: '请输入查勘员ID', trigger: 'blur' }],
}

const assessmentDialog = ref(false)
const assessmentFormRef = ref<FormInstance>()
const assessmentForm = reactive({ assessedAmount: 0, liabilityRatio: 100, assessorId: '' })
const assessmentRules: FormRules = {
  assessedAmount: [{ required: true, message: '请输入定损金额', trigger: 'blur' }],
  assessorId: [{ required: true, message: '请输入定损员ID', trigger: 'blur' }],
}

const settleDialog = ref(false)
const settleFormRef = ref<FormInstance>()
const settleForm = reactive({ settledAmount: 0, payoutMethod: '', payeeAccount: '', conclusion: '' })
const settleRules: FormRules = {
  settledAmount: [{ required: true, message: '请输入赔付金额', trigger: 'blur' }],
  payoutMethod: [{ required: true, message: '请选择支付方式', trigger: 'change' }],
}

const rejectDialog = ref(false)
const rejectFormRef = ref<FormInstance>()
const rejectForm = reactive({ reasonCode: '', comment: '' })
const rejectRules: FormRules = {
  reasonCode: [{ required: true, message: '请选择拒赔原因', trigger: 'change' }],
}

// ===== 加载与操作 =====

/** 加载详情并同步刷新状态 */
const loadDetail = async () => {
  claim.value = await getClaimDetail(claimId)
}

onMounted(loadDetail)

const goBack = () => router.push('/claim/list')

/** 简单状态流转（立案/核赔通过/快赔）带中文确认框 */
const confirmSimpleAction = async (action: ClaimAction) => {
  await ElMessageBox.confirm(`确认对报案号「${claim.value?.claimNumber}」执行「${action.label}」操作？`, '操作确认', {
    type: 'warning',
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  })
  actionLoading.value = true
  try {
    const nextStatus: Record<string, string> = {
      start: 'PROCESSING',
      approve: 'APPROVED',
    }
    await updateClaimStatus(claimId, nextStatus[action.key])
    ElMessage.success(`${action.label}成功`)
    await loadDetail()
  } catch (e: unknown) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e instanceof Error ? e.message : '操作失败')
    }
  } finally {
    actionLoading.value = false
  }
}

/** 动作分发 */
const onAction = async (action: ClaimAction) => {
  switch (action.key) {
    case 'start':
    case 'approve':
      await confirmSimpleAction(action)
      break
    case 'quickPay':
      await ElMessageBox.confirm(
        `确认对报案号「${claim.value?.claimNumber}」发起快赔自动核赔支付？`,
        '操作确认',
        { type: 'warning', confirmButtonText: '确认', cancelButtonText: '取消' },
      )
      actionLoading.value = true
      try {
        await quickPayClaim(claimId)
        ElMessage.success('快赔支付发起成功')
        await loadDetail()
      } catch (e: unknown) {
        ElMessage.error(e instanceof Error ? e.message : '操作失败')
      } finally {
        actionLoading.value = false
      }
      break
    case 'survey':
      surveyDialog.value = true
      break
    case 'assessment':
      assessmentDialog.value = true
      break
    case 'settle':
      settleForm.settledAmount = claim.value?.claimAmount ?? 0
      settleDialog.value = true
      break
    case 'reject':
      rejectDialog.value = true
      break
    case 'close':
      await ElMessageBox.confirm(
        `确认对报案号「${claim.value?.claimNumber}」执行结案归档？结案后案件不可再变更。`,
        '操作确认',
        { type: 'warning', confirmButtonText: '确认结案', cancelButtonText: '取消' },
      )
      actionLoading.value = true
      try {
        await closeClaim(claimId)
        ElMessage.success('结案归档成功')
        await loadDetail()
      } catch (e: unknown) {
        ElMessage.error(e instanceof Error ? e.message : '操作失败')
      } finally {
        actionLoading.value = false
      }
      break
  }
}

const submitSurveyForm = async () => {
  const valid = await surveyFormRef.value?.validate().catch(() => false)
  if (!valid) return
  actionLoading.value = true
  try {
    await submitSurvey(claimId, { ...surveyForm })
    ElMessage.success('查勘提交成功')
    surveyDialog.value = false
    await loadDetail()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    actionLoading.value = false
  }
}

const submitAssessmentForm = async () => {
  const valid = await assessmentFormRef.value?.validate().catch(() => false)
  if (!valid) return
  actionLoading.value = true
  try {
    await submitLossAssessment(claimId, { ...assessmentForm })
    ElMessage.success('定损提交成功')
    assessmentDialog.value = false
    await loadDetail()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    actionLoading.value = false
  }
}

const submitSettle = async () => {
  const valid = await settleFormRef.value?.validate().catch(() => false)
  if (!valid) return
  actionLoading.value = true
  try {
    await settleClaim(claimId, { ...settleForm })
    ElMessage.success('核赔结算成功，已进入赔付流程')
    settleDialog.value = false
    await loadDetail()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    actionLoading.value = false
  }
}

const submitReject = async () => {
  const valid = await rejectFormRef.value?.validate().catch(() => false)
  if (!valid) return
  actionLoading.value = true
  try {
    await rejectClaim(claimId, { ...rejectForm })
    ElMessage.success('拒赔完成')
    rejectDialog.value = false
    await loadDetail()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    actionLoading.value = false
  }
}
</script>

<style scoped lang="scss">
.ti-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;

  .header-left {
    display: flex;
    align-items: center;

    .header-title {
      font-size: 16px;
      font-weight: 600;
      color: #303133;
    }

    .header-tag {
      margin-left: 12px;
    }
  }
}

.ti-card {
  .card-title {
    font-weight: 600;
    color: #303133;
  }

  .mono {
    font-family: monospace;
  }

  .amount {
    color: #e6a23c;
    font-weight: 600;
  }
}

.ti-alert {
  margin-top: 12px;
}

.unit {
  margin-left: 8px;
  color: #909399;
}
</style>
