<template>
  <div class="ti-page" v-loading="loading">
    <div class="ti-card" v-if="detail">
      <div class="workbench-heading">
        <div>
          <el-button text :icon="ArrowLeft" @click="router.back()">返回</el-button>
          <h3>保全工作台</h3>
        </div>
        <div class="heading-actions">
          <TiStatusTag :value="detail.status" :label="maintenanceCaseStatusLabel(detail.status)" />
          <el-button :icon="Refresh" @click="load">刷新</el-button>
        </div>
      </div>
      <el-descriptions :column="detailColumns" border>
        <el-descriptions-item label="保单">{{ detail.policyNumber || detail.policyId }}</el-descriptions-item>
        <el-descriptions-item label="客户">{{ detail.customerId }}</el-descriptions-item>
        <el-descriptions-item label="来源">{{ maintenanceChannelLabel(detail.source) }}</el-descriptions-item>
        <el-descriptions-item label="生效方式">{{ maintenanceEffectiveTypeLabel(detail.effectiveTimeType) }}</el-descriptions-item>
        <el-descriptions-item label="约定生效时间">{{ formatCaseEffectiveTime() }}</el-descriptions-item>
        <el-descriptions-item label="基准版本">{{ detail.policyBaselineVersion ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="产品/计划版本">{{ detail.productVersion || '-' }} / {{ detail.planVersion || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDateTime(detail.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="说明" :span="detailColumns">{{ detail.description || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-alert
        v-if="hasCreatorOwnedReview"
        class="role-alert"
        type="info"
        :closable="false"
        title="该案件需要由其他复核员完成审核"
      />
    </div>

    <template v-if="detail">
      <div class="ti-card section-card">
        <div class="section-heading"><h4>保全项与字段变更</h4><span>基准值 → 当前值 → 拟变更值 → 已应用值</span></div>
        <el-table :data="fieldEntryRows" border stripe class="responsive-table">
          <el-table-column prop="itemCode" label="保全项" min-width="150" />
          <el-table-column label="变更对象" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.objectId || '保单主体' }}</template>
          </el-table-column>
          <el-table-column prop="fieldCode" label="字段" min-width="150" />
          <el-table-column prop="baseValue" label="基准值" min-width="140" show-overflow-tooltip />
          <el-table-column prop="currentValue" label="当前值" min-width="140" show-overflow-tooltip />
          <el-table-column label="拟变更值" min-width="190">
            <template #default="{ row }"><el-input v-model="draftValues[changeKey(row)]" size="small" :disabled="isReadOnly" :placeholder="row.proposedValue || '请输入'" /></template>
          </el-table-column>
          <el-table-column prop="appliedValue" label="已应用值" min-width="140" show-overflow-tooltip />
          <el-table-column prop="conflictStatus" label="冲突" width="110" />
          <el-table-column v-if="!isReadOnly" label="冲突处理" min-width="260">
            <template #default="{ row }">
              <template v-if="isConflict(row)">
                <el-button size="small" @click="resolveConflict(row, 'USE_CURRENT')">采用当前值</el-button>
                <el-button size="small" type="primary" @click="resolveConflict(row, 'USE_PROPOSED')">采用拟值</el-button>
                <el-button size="small" @click="resolveConflict(row, 'REENTER')">重新录入</el-button>
              </template>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!isReadOnly" class="section-actions"><el-button type="primary" :loading="savingChanges" @click="saveChanges">保存字段草稿</el-button></div>
      </div>

      <div class="ti-card section-card">
        <div class="section-heading"><h4>流程任务</h4><span>按冻结配置顺序执行，越序操作由服务端拒绝</span></div>
        <el-table :data="detail.workflowTasks" border stripe class="responsive-table">
          <el-table-column prop="sequence" label="序号" width="70" />
          <el-table-column prop="itemCode" label="保全项" min-width="150" />
          <el-table-column prop="stepType" label="步骤" min-width="160" />
          <el-table-column prop="mode" label="模式" width="110" />
          <el-table-column prop="status" label="状态" width="130"><template #default="{ row }"><TiStatusTag :value="row.status" /></template></el-table-column>
          <el-table-column label="操作" min-width="280" fixed="right">
            <template #default="{ row }">
              <el-button v-if="isClaimable(row)" size="small" @click="taskAction(row, 'claim')">领取</el-button>
              <el-button v-if="isStartable(row)" size="small" type="primary" @click="taskAction(row, 'start')">开始</el-button>
              <el-button v-if="canReview(row)" size="small" type="success" @click="review(row, 'APPROVE')">审核通过</el-button>
              <el-button v-if="canReview(row)" size="small" type="danger" @click="review(row, 'REJECT')">审核拒绝</el-button>
              <el-button v-if="canCompleteDataEntry(row)" size="small" type="success" @click="taskAction(row, 'complete')">完成</el-button>
              <el-button v-if="isEffectReady(row)" size="small" type="success" @click="applyEffect(row)">立即生效</el-button>
              <el-button v-if="row.status === 'FAILED'" size="small" type="warning" @click="taskAction(row, 'retry')">重试</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="two-column">
        <div class="ti-card section-card">
          <div class="section-heading"><h4>配置与 Offering 快照</h4></div>
          <el-table :data="detail.items" border size="small">
            <el-table-column prop="itemCode" label="保全项" min-width="150" />
            <el-table-column prop="configurationVersion" label="配置版本" width="110" />
            <el-table-column prop="configurationContentHash" label="配置哈希" min-width="180" show-overflow-tooltip />
            <el-table-column prop="offeringVersion" label="Offering 版本" width="120" />
          </el-table>
        </div>
        <div class="ti-card section-card">
          <div class="section-heading"><h4>生效计划与回执</h4><span>{{ detail.effectStatus || '-' }}</span></div>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="计划状态">{{ detail.effectSchedule?.status || '-' }}</el-descriptions-item>
            <el-descriptions-item label="下次执行">{{ formatScheduleTime(detail.effectSchedule?.nextExecutionAt) }}</el-descriptions-item>
            <el-descriptions-item label="尝试次数">{{ detail.effectSchedule?.attemptCount ?? 0 }}</el-descriptions-item>
            <el-descriptions-item label="最后尝试">{{ formatScheduleTime(detail.effectSchedule?.lastAttemptAt) }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.effectSchedule?.lastErrorCode" label="失败码">{{ detail.effectSchedule.lastErrorCode }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.effectSchedule?.lastErrorMessage" label="失败原因">{{ detail.effectSchedule.lastErrorMessage }}</el-descriptions-item>
            <el-descriptions-item label="回执版本">{{ detail.workflowTasks.find((task) => task.effectEvidence?.application)?.effectEvidence?.application?.actualPolicyVersion || '-' }}</el-descriptions-item>
            <el-descriptions-item label="回执哈希"><span class="hash-text">{{ detail.workflowTasks.find((task) => task.effectEvidence?.application)?.effectEvidence?.application?.applicationHash || '-' }}</span></el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <div v-if="financialTasks.length" class="ti-card section-card">
        <div class="section-heading"><h4>保全收退费与资金凭证</h4><span>报价 → Billing 入账 → Payment 收退费</span></div>
        <div v-for="task in financialTasks" :key="task.taskId" class="financial-evidence">
          <el-descriptions :column="detailColumns" border>
            <el-descriptions-item label="保全项">{{ task.itemCode }}</el-descriptions-item>
            <el-descriptions-item label="收退费">{{ money(task.premiumQuoteEvidence?.amount, task.premiumQuoteEvidence?.currency) }} · {{ task.premiumQuoteEvidence?.direction || '-' }}</el-descriptions-item>
            <el-descriptions-item label="报价版本">{{ task.premiumQuoteEvidence?.quoteVersion || task.premiumQuoteEvidence?.pricingPlanVersion || '-' }}</el-descriptions-item>
            <el-descriptions-item label="计算明细" :span="detailColumns">{{ task.premiumQuoteEvidence?.detailSummary || '-' }}</el-descriptions-item>
            <el-descriptions-item label="Billing 状态">{{ task.billingPostingEvidence?.status || '-' }}</el-descriptions-item>
            <el-descriptions-item label="Billing 单号"><span class="hash-text">{{ task.billingPostingEvidence?.postingId || '-' }}</span></el-descriptions-item>
            <el-descriptions-item label="Payment 状态">{{ task.fundSettlementEvidence?.type || '-' }} / {{ task.fundSettlementEvidence?.status || task.fundSettlementEvidence?.externalStatus || '-' }}</el-descriptions-item>
            <el-descriptions-item label="Payment 单号"><span class="hash-text">{{ task.fundSettlementEvidence?.orderId || task.fundSettlementEvidence?.instructionId || '-' }}</span></el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <div class="ti-card section-card">
        <div class="section-heading"><h4>追溯、冲突与撤销</h4></div>
        <el-descriptions :column="detailColumns" border>
          <el-descriptions-item label="追溯影响">{{ detail.retroactiveImpactAnalysis?.status || '未发起' }} / {{ detail.retroactiveImpactAnalysis?.itemCount ?? 0 }} 项</el-descriptions-item>
          <el-descriptions-item label="追溯期间重算">{{ detail.retroactivePeriodRecalculation?.status || '未发起' }}</el-descriptions-item>
          <el-descriptions-item label="冲突字段">{{ conflictCount }}</el-descriptions-item>
          <el-descriptions-item label="快照引用">{{ snapshotCount }} 份</el-descriptions-item>
        </el-descriptions>
        <div v-if="!isReadOnly" class="section-actions">
          <el-button @click="refreshConflicts">刷新冲突</el-button>
          <template v-if="detail.effectSchedule?.scheduleId">
            <el-button v-if="detail.effectSchedule.status === 'ACTIVE'" type="warning" @click="scheduleAction('pause')">暂停生效计划</el-button>
            <el-button v-if="['PAUSED', 'FAILED'].includes(detail.effectSchedule.status || '')" type="primary" @click="scheduleAction('resume')">恢复生效计划</el-button>
            <el-button v-if="canExecuteScheduleNow" type="success" @click="scheduleAction('execute-now')">立即执行生效计划</el-button>
          </template>
        </div>
      </div>
    </template>
    <el-empty v-else-if="!loading" description="未找到案件" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Refresh } from '@element-plus/icons-vue'
import {
  getMaintenanceConfiguration,
  getMaintenanceCaseDetail,
  operateMaintenanceCase,
  operateMaintenanceTask,
  recordMaintenanceFieldChanges,
} from '@/api/maintenance'
import { getPolicyBeneficiaries } from '@/api/policy'
import type { PolicyBeneficiaryVO } from '@/api/policy'
import type {
  MaintenanceCaseDetail,
  MaintenanceConfigurationFieldRule,
  MaintenanceFieldChange,
  MaintenanceWorkflowTask,
} from '@/api/maintenance'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import { useUserStore } from '@/stores/user'
import { formatDateTime, formatDateTimeInZone } from '@/utils/date'
import { useDict } from '@/composables/useDict'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const { getLabel: maintenanceCaseStatusLabel } = useDict('MAINTENANCE_CASE_STATUS')
const { getLabel: maintenanceChannelDictLabel } = useDict('MAINTENANCE_CHANNEL')
const { getLabel: maintenanceEffectiveTypeDictLabel } = useDict('MAINTENANCE_EFFECTIVE_TIME_TYPE')
const maintenanceChannelLabel = (value?: string) => value ? maintenanceChannelDictLabel(value) : '-'
const maintenanceEffectiveTypeLabel = (value?: string) => value ? maintenanceEffectiveTypeDictLabel(value) : '-'
const loading = ref(false)
const savingChanges = ref(false)
const detail = ref<MaintenanceCaseDetail>()
const draftValues = reactive<Record<string, string>>({})
const fieldRulesByItem = ref<Record<string, MaintenanceConfigurationFieldRule[]>>({})
const beneficiaryObjectsByItem = ref<Record<string, PolicyBeneficiaryVO[]>>({})
const detailColumns = computed(() => window.innerWidth < 768 ? 1 : 3)
const snapshotCount = computed(() => Object.values(detail.value?.snapshots || {}).filter(Boolean).length)
const isReadOnly = computed(() => ['COMPLETED', 'REJECTED', 'WITHDRAWN'].includes(detail.value?.status || ''))
const conflictCount = computed(() => detail.value?.fieldChanges.filter(isConflict).length || 0)
const financialTasks = computed(() => detail.value?.workflowTasks.filter((task) =>
  task.premiumQuoteEvidence || task.billingPostingEvidence || task.fundSettlementEvidence) || [])
const hasCreatorOwnedReview = computed(() => detail.value?.createdBy === userStore.userInfo?.id
  && detail.value?.workflowTasks.some((task) => isReview(task) && ['READY', 'IN_PROGRESS'].includes(task.status)))
const canExecuteScheduleNow = computed(() => {
  const schedule = detail.value?.effectSchedule
  if (!schedule?.scheduleId || schedule.status !== 'ACTIVE' || !schedule.nextExecutionAt) return false
  return new Date(`${schedule.nextExecutionAt}Z`).getTime() <= Date.now()
})
const isBeneficiaryField = (fieldCode: string) => fieldCode.startsWith('policy.beneficiary.')
const beneficiaryValue = (beneficiary: PolicyBeneficiaryVO, fieldCode: string) => {
  if (fieldCode === 'policy.beneficiary.name') return beneficiary.beneficiaryName
  if (fieldCode === 'policy.beneficiary.relationship') return beneficiary.beneficiaryType
  if (fieldCode === 'policy.beneficiary.share') return beneficiary.shareRatio?.toString()
  return undefined
}
const fieldEntryRows = computed<MaintenanceFieldChange[]>(() => {
  if (!detail.value) return []
  const savedItems = new Set(detail.value.fieldChanges.map((field) => field.itemCode))
  const unsavedRows = detail.value.items
    .filter((item) => !savedItems.has(item.itemCode))
    .flatMap((item) => {
      const rules = (fieldRulesByItem.value[item.itemCode] || [])
        .filter((rule) => rule.visible && rule.editable)
      const scalarRows = rules
        .filter((rule) => !isBeneficiaryField(rule.fieldCode))
        .map((rule) => ({
          itemCode: item.itemCode,
          fieldCode: rule.fieldCode,
          dataType: rule.expectedValueType || 'TEXT',
        }))
      const beneficiaryRows = (beneficiaryObjectsByItem.value[item.itemCode] || [])
        .flatMap((beneficiary) => rules
          .filter((rule) => isBeneficiaryField(rule.fieldCode))
          .map((rule) => {
            const currentValue = beneficiaryValue(beneficiary, rule.fieldCode)
            return {
              itemCode: item.itemCode,
              objectId: beneficiary.beneficiaryId,
              fieldCode: rule.fieldCode,
              dataType: rule.expectedValueType || 'TEXT',
              baseValue: currentValue,
              currentValue,
            }
          }))
      return [...scalarRows, ...beneficiaryRows]
    })
  return [...detail.value.fieldChanges, ...unsavedRows]
})
const caseId = String(route.params.id)

const formatCaseEffectiveTime = () => {
  if (!detail.value) return '-'
  if (detail.value.specificEffectiveDate) return formatDateTime(detail.value.specificEffectiveDate)
  if (detail.value.effectiveTimeType === 'IMMEDIATE') return '立即生效'
  return formatDateTime(detail.value.businessEffectiveAt)
}
const formatScheduleTime = (value?: string) => {
  if (!value) return '-'
  const zoneId = detail.value?.effectSchedule?.tenantZoneId || 'Asia/Shanghai'
  const parsed = new Date(value.endsWith('Z') ? value : `${value}Z`)
  if (Number.isNaN(parsed.getTime())) return formatDateTime(value)
  return formatDateTimeInZone(parsed, zoneId)
}
const money = (amount?: number, currency?: string) => amount == null ? '-' : `${amount.toFixed(2)} ${currency || ''}`.trim()
const changeKey = (rawRow: unknown) => {
  const row = rawRow as MaintenanceFieldChange
  return `${row.itemCode}:${row.objectId}:${row.fieldCode}`
}
const isReview = (rawRow: unknown) => (rawRow as MaintenanceWorkflowTask).stepType.toUpperCase().includes('REVIEW')
const isDataEntry = (rawRow: unknown) => ['DATA_ENTRY', 'VALIDATION'].includes((rawRow as MaintenanceWorkflowTask).stepType)
const isAssignedToCurrentUser = (rawRow: unknown) => {
  const task = rawRow as MaintenanceWorkflowTask
  return task.assignment?.assignee === userStore.userInfo?.id
}
const isOwnedInProgress = (rawRow: unknown) => (rawRow as MaintenanceWorkflowTask).status === 'IN_PROGRESS'
  && isAssignedToCurrentUser(rawRow)
const canReview = (row: unknown) => isOwnedInProgress(row) && isReview(row)
  && detail.value?.createdBy !== userStore.userInfo?.id
const canCompleteDataEntry = (rawRow: unknown) => isOwnedInProgress(rawRow) && isDataEntry(rawRow)
  && fieldEntryRows.value.some((field) => field.itemCode === (rawRow as MaintenanceWorkflowTask).itemCode)
const isConflict = (rawRow: unknown) => ['DETECTED', 'CONFLICT'].includes(
  (rawRow as MaintenanceFieldChange).conflictStatus || '',
)
const isEffect = (rawRow: unknown) => (rawRow as MaintenanceWorkflowTask).stepType === 'EFFECT'
const isCreatorReviewTask = (rawRow: unknown) => isReview(rawRow)
  && detail.value?.createdBy === userStore.userInfo?.id
const isClaimable = (rawRow: unknown) => {
  const task = rawRow as MaintenanceWorkflowTask
  return task.status === 'READY' && !task.assignment && !isEffect(task)
    && task.stepType !== 'COMPLETE' && !isCreatorReviewTask(task)
}
const isStartable = (rawRow: unknown) => {
  const task = rawRow as MaintenanceWorkflowTask
  return task.status === 'READY' && isAssignedToCurrentUser(task)
    && !isEffect(task) && !isCreatorReviewTask(task)
}
const isEffectReady = (rawRow: unknown) => isEffect(rawRow)
  && (rawRow as MaintenanceWorkflowTask).status === 'READY'
const operationId = () => `manual-${Date.now()}`
const waitForProjection = () => new Promise((resolve) => window.setTimeout(resolve, 300))

const loadFieldRules = async (caseDetail: MaintenanceCaseDetail) => {
  const missingItems = caseDetail.items.filter((item) => item.configurationId && !fieldRulesByItem.value[item.itemCode])
  const configurations = await Promise.all(missingItems.map((item) => getMaintenanceConfiguration(item.configurationId!)))
  missingItems.forEach((item, index) => {
    fieldRulesByItem.value[item.itemCode] = configurations[index].definition?.fieldRules || []
  })
}

const loadBeneficiaryObjects = async (caseDetail: MaintenanceCaseDetail) => {
  const beneficiaryItems = caseDetail.items.filter((item) =>
    (fieldRulesByItem.value[item.itemCode] || []).some((rule) => isBeneficiaryField(rule.fieldCode)),
  )
  if (!beneficiaryItems.length || caseDetail.fieldChanges.some((field) => isBeneficiaryField(field.fieldCode))) return
  const beneficiaries = await getPolicyBeneficiaries(caseDetail.policyId)
  const editableBeneficiaries = beneficiaries.filter((beneficiary) => beneficiary.beneficiaryId)
  const contexts = editableBeneficiaries.length ? editableBeneficiaries : [{
    beneficiaryId: globalThis.crypto.randomUUID().replaceAll('-', ''),
  }]
  beneficiaryItems.forEach((item) => { beneficiaryObjectsByItem.value[item.itemCode] = contexts })
}

const load = async () => {
  loading.value = true
  try {
    detail.value = await getMaintenanceCaseDetail(caseId)
    await loadFieldRules(detail.value)
    await loadBeneficiaryObjects(detail.value)
    fieldEntryRows.value.forEach((row) => {
      draftValues[changeKey(row)] = row.proposedValue
        || draftValues[changeKey(row)]
        || row.currentValue
        || ''
    })
  } finally { loading.value = false }
}

const refreshAfterMutation = async () => {
  await waitForProjection()
  await load()
}

const taskAction = async (rawTask: unknown, action: string) => {
  const task = rawTask as MaintenanceWorkflowTask
  const body: Record<string, unknown> = { operationId: operationId() }
  if (action === 'complete') Object.assign(body, { resultCode: 'PASS', reason: '后台操作完成' })
  if (action === 'retry') body.reason = '后台人工重试'
  await operateMaintenanceTask(caseId, task.taskId, action, body)
  ElMessage.success('任务操作成功')
  await refreshAfterMutation()
}

const review = async (rawTask: unknown, decision: string) => {
  const task = rawTask as MaintenanceWorkflowTask
  const result = await ElMessageBox.prompt('请输入审核意见', '人工审核', { inputValue: decision === 'APPROVE' ? '审核通过' : '', inputType: 'textarea' })
  await operateMaintenanceTask(caseId, task.taskId, 'review-decision', {
    operationId: operationId(), decision, policyVersion: task.reviewEvidence?.policyVersion || '1', comment: result.value,
  })
  ElMessage.success('审核结果已提交')
  await refreshAfterMutation()
}

const applyEffect = async (rawTask: unknown) => {
  const task = rawTask as MaintenanceWorkflowTask
  await operateMaintenanceTask(caseId, task.taskId, 'effect', { operationId: operationId() })
  ElMessage.success('保全已生效')
  await refreshAfterMutation()
}

const saveChanges = async () => {
  if (!detail.value) return
  savingChanges.value = true
  try {
    const groups = new Map<string, Array<Record<string, unknown>>>()
    fieldEntryRows.value.forEach((row) => {
      const list = groups.get(row.itemCode) || []
      list.push({ objectId: row.objectId || null, fieldCode: row.fieldCode, dataType: row.dataType || 'TEXT', canonicalValue: draftValues[changeKey(row)] || null })
      groups.set(row.itemCode, list)
    })
    for (const [itemCode, proposals] of groups) await recordMaintenanceFieldChanges(caseId, itemCode, proposals)
    ElMessage.success('字段草稿已保存')
    await refreshAfterMutation()
  } finally { savingChanges.value = false }
}

const refreshConflicts = async () => {
  await operateMaintenanceCase(caseId, 'field-conflicts/refresh', { operationId: operationId() })
  ElMessage.success('冲突状态已刷新')
  await refreshAfterMutation()
}

const resolveConflict = async (rawField: unknown, action: 'USE_CURRENT' | 'USE_PROPOSED' | 'REENTER') => {
  const field = rawField as MaintenanceFieldChange
  let canonicalValue: string | undefined
  if (action === 'REENTER') {
    const result = await ElMessageBox.prompt('请输入新的字段值', '重新录入冲突字段', {
      inputValue: draftValues[changeKey(field)] || field.proposedValue || '',
    })
    canonicalValue = result.value
  }
  await operateMaintenanceCase(caseId, 'field-conflicts/resolve', {
    operationId: operationId(),
    itemCode: field.itemCode,
    objectId: field.objectId || detail.value?.policyId,
    fieldCode: field.fieldCode,
    action,
    ...(action === 'REENTER' ? { dataType: field.dataType || 'TEXT', canonicalValue } : {}),
    reason: '后台操作员解决字段冲突',
  })
  ElMessage.success('冲突字段已处理')
  await refreshAfterMutation()
}

const scheduleAction = async (action: 'pause' | 'resume' | 'execute-now') => {
  let reason = '后台操作员提前执行'
  if (action !== 'execute-now') {
    const result = await ElMessageBox.prompt(
      action === 'pause' ? '请输入暂停原因' : '请输入恢复原因',
      action === 'pause' ? '暂停生效计划' : '恢复生效计划',
      { inputType: 'textarea', inputValidator: (value) => value.trim() ? true : '原因不能为空' },
    )
    reason = result.value
  }
  await operateMaintenanceCase(caseId, `effect-schedule/${action}`, { operationId: operationId(), reason })
  ElMessage.success('操作成功')
  await refreshAfterMutation()
}

onMounted(load)
</script>

<style scoped>
.workbench-heading, .section-heading, .heading-actions, .section-actions { display: flex; align-items: center; gap: 12px; }
.workbench-heading, .section-heading { justify-content: space-between; }
.workbench-heading h3 { margin: 10px 0 0; }
.case-id { color: var(--el-text-color-secondary); font-size: 13px; font-weight: 400; margin-left: 8px; }
.section-heading { margin-bottom: 14px; }
.section-heading h4 { margin: 0; }
.section-heading span { color: var(--el-text-color-secondary); font-size: 12px; }
.section-card { margin-top: 16px; }
.role-alert { margin-top: 14px; }
.section-actions { justify-content: flex-end; margin-top: 14px; }
.two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.hash-text { word-break: break-all; font-family: monospace; }
.financial-evidence + .financial-evidence { margin-top: 14px; }
@media (max-width: 900px) { .two-column { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .workbench-heading, .section-heading { align-items: flex-start; flex-direction: column; } .heading-actions { align-self: stretch; justify-content: space-between; } .responsive-table { min-width: 900px; } }
</style>
