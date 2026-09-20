<template>
  <!-- 理赔案件详情 -->
  <div class="ti-page">
    <!-- 🔴 头部此前在卡片之外、且自带 .ti-detail-header/.header-left/.header-right 三套类名
         （全站唯一的竖线分隔写法）；卡片又同时挂了 el-card 与 .ti-card —— EP 的 padding 在
         .el-card__body 上、.ti-card 的 padding 在外层容器上，两者叠加成 40px 双内边距，
         外加 EP 的 1px 边框与 .ti-card 的阴影两种卡片语言并存。现统一为 TiDetailHeader + 单层卡片。 -->
    <div class="ti-card">
      <TiDetailHeader title="理赔案件详情">
        <template #meta>
          <TiStatusTag v-if="claim" :value="claim.status" :label="claimStatusLabel(claim.status)" />
        </template>
        <template #actions v-if="claim">
          <!-- 🔴 除 :disabled 外还须 :loading。原先只靠 :disabled，按钮只是变灰——
               写动作在途时（快赔支付等）用户看到的是「按钮不能点」，而不是「正在执行」，
               与各对话框 footer 的 :loading="actionLoading" 也是两套观感。二者补齐为同一套。 -->
          <el-button
            v-for="action in currentActions"
            :key="action.key"
            :type="action.type"
            :disabled="!claim || actionLoading"
            :loading="actionLoading"
            @click="onAction(action)"
          >
            {{ action.label }}
          </el-button>
        </template>
      </TiDetailHeader>

      <el-divider content-position="left">基础信息</el-divider>
      <el-descriptions v-if="claim" :column="detailColumns" border>
        <el-descriptions-item label="报案号">
          <el-text class="mono">{{ claim.claimNumber }}</el-text>
        </el-descriptions-item>
        <el-descriptions-item label="理赔类型">{{ claimTypeLabel(claim.claimType) }}</el-descriptions-item>
        <!-- 「时间」而非「日期」：与列表页同项统一，且后端 Claim.incidentDate 为 LocalDateTime -->
        <el-descriptions-item label="出险时间">{{ formatDateTime(claim.incidentDate) }}</el-descriptions-item>
        <el-descriptions-item label="申请赔付">
          <span class="amount">{{ formatAmount(claim.claimAmount) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="报案时间">{{ formatDateTime(claim.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ formatDateTime(claim.updatedAt) }}</el-descriptions-item>
        <el-descriptions-item v-if="claim.phase" label="处理阶段">{{ claimPhaseLabel(claim.phase) }}</el-descriptions-item>
        <el-descriptions-item v-if="claim.paymentStatus" label="赔付状态">
          <el-tag :type="claim.paymentStatus === 'PROCESSING' ? 'warning' : claim.paymentStatus === 'SUCCESS' ? 'success' : 'info'" size="small">
            {{ paymentStatusLabel(claim.paymentStatus) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-if="claim.assessedPayableAmount != null" label="定损核定">
          <span class="amount">{{ formatAmount(claim.assessedPayableAmount) }}</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="claim.settledAmount != null" label="核定赔付">
          <span class="amount">{{ formatAmount(claim.settledAmount) }}</span>
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
    </div>

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
          <div v-if="claim?.assessedPayableAmount != null" class="form-tip">
            本案件已定损，核定赔付金额须等于定损核定额 {{ formatAmount(claim.assessedPayableAmount) }}，不得人工调整
          </div>
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
      <!-- 🔴 不可逆提示：拒赔后案件只能结案归档，无回退操作，故与同页「结案」保持一致要给出后果说明
           （结案走 ElMessageBox.confirm 的 warning，本页用表单对话框，故以 el-alert 承载同样的信息）。
           与保单详情页「退保/终止」对话框的 el-alert type="warning" 是同一范式，不要删。 -->
      <el-alert type="warning" :closable="false" class="ti-dialog-alert">
        拒赔为终局决定，提交后不可撤销，案件将进入「已拒赔」状态并只能结案归档。
      </el-alert>
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
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
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
import { showErrorIfUnhandled } from '@/api/http'
import { useDict } from '@/composables/useDict'
import { useDetailColumns } from '@/composables/useDetailColumns'
import { formatAmount } from '@/utils/format'
// 日期格式化统一走全局工具：本文件此前自带一份 `replace('T',' ')` 的本地实现，
// 与 claim/list 各存一份（全站 29 个文件用全局工具，仅理赔域两处重复）。
// 本地实现是纯字符串替换：不校验有效性、遇毫秒会保留 `.123`、遇 `Z` 后缀会原样带出，
// 换后端序列化格式即静默出错（2026-09-18 全站实测）。
import { formatDateTime } from '@/utils/date'
import TiDetailHeader from '@/components/TiDetailHeader/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'


const route = useRoute()
const claimId = route.params.id as string

/** 理赔基础信息：字段中长（拒赔原因/事故描述已用 :span 独占整行），宽屏 3 档 */
const detailColumns = useDetailColumns(3)

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
      showErrorIfUnhandled(e, '操作失败')
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
        showErrorIfUnhandled(e, '操作失败')
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
      // 🔴 已定损案件以定损核定额为准（聚合会拒收与核定额不等的金额），未定损才回退申报金额
      settleForm.settledAmount = claim.value?.assessedPayableAmount ?? claim.value?.claimAmount ?? 0
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
        showErrorIfUnhandled(e, '操作失败')
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
    showErrorIfUnhandled(e, '操作失败')
  } finally {
    actionLoading.value = false
  }
}

/**
 * 责任比例量纲转换：页面按百分数录入（80 = 80%），契约口径是 0-1 小数（全责 1.0、同责 0.5）。
 * 🔴 这是全前端**唯一**的量纲转换点，不得在别处重复除以 100。
 * 空值返回 undefined（不参与计算），避免 null/100 = 0 造出「零责任」错值。
 */
const toLiabilityRatioDecimal = (percent: number | null | undefined): number | undefined =>
  percent == null ? undefined : percent / 100

const submitAssessmentForm = async () => {
  const valid = await assessmentFormRef.value?.validate().catch(() => false)
  if (!valid) return
  actionLoading.value = true
  try {
    await submitLossAssessment(claimId, {
      assessedAmount: assessmentForm.assessedAmount,
      liabilityRatio: toLiabilityRatioDecimal(assessmentForm.liabilityRatio),
      assessorId: assessmentForm.assessorId,
    })
    ElMessage.success('定损提交成功')
    assessmentDialog.value = false
    await loadDetail()
  } catch (e: unknown) {
    showErrorIfUnhandled(e, '操作失败')
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
    showErrorIfUnhandled(e, '操作失败')
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
    showErrorIfUnhandled(e, '操作失败')
  } finally {
    actionLoading.value = false
  }
}
</script>

<style scoped lang="scss">
.ti-card {
  .mono {
    font-family: monospace;
  }

  .amount {
    color: $warning-color;
    font-weight: 600;
  }
}

.ti-alert {
  margin-top: 12px;
}

.unit {
  margin-left: 8px;
  color: $text-secondary;
}

.form-tip {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: $warning-color;
}
</style>
