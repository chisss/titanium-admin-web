<template>
  <div class="ti-page">
    <TiSearchForm :model="query" @search="load" @reset="reset">
      <el-form-item label="保全项编码"><el-input v-model="query.itemCode" clearable placeholder="例如 POLICY_INFO_CHANGE" /></el-form-item>
      <el-form-item label="配置状态">
        <TiDictSelect v-model="query.status" dict-type="MAINTENANCE_CONFIG_STATUS" placeholder="全部" style="width: 150px" />
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar">
      <div class="ti-toolbar-left"><el-button type="primary" :icon="Plus" @click="openCreate">新建配置</el-button></div>
      <div class="ti-toolbar-right"><el-button :icon="Refresh" @click="load">刷新</el-button></div>
    </div>

    <TiTable
      :data="rows"
      :total="total"
      :page-num="pageNum"
      :page-size="pageSize"
      :loading="loading"
      @page-change="changePage"
      @size-change="changeSize"
    >
      <el-table-column prop="configurationId" label="配置 ID" min-width="180" class-name="ti-code-column" />
      <el-table-column label="保全项" min-width="190">
        <template #default="{ row }">{{ configurationName(row) }} <span class="muted">{{ configurationItemCode(row) }}</span></template>
      </el-table-column>
      <el-table-column label="版本" width="150"><template #default="{ row }">{{ configurationVersion(row) }}</template></el-table-column>
      <el-table-column prop="status" label="状态" width="120"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
      <el-table-column label="步骤/费用" min-width="150">
        <template #default="{ row }">{{ workflowLabel(row) }}</template>
      </el-table-column>
      <el-table-column prop="validFrom" label="生效起始" width="170"><template #default="{ row }">{{ formatDateTime(row.validFrom) }}</template></el-table-column>
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="openDetail(row.configurationId)">查看</el-button>
          <el-button v-if="row.status === 'DRAFT'" size="small" :icon="Edit" @click="openEdit(row.configurationId)">编辑</el-button>
          <el-tag v-if="isCurrentSubmitter(configurationRow(row))" type="info" effect="plain">需其他审批人</el-tag>
          <el-dropdown v-else-if="actionsFor(configurationRow(row)).length" @command="(action: string) => operate(row, action)">
            <el-button size="small" :icon="MoreFilled">生命周期</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="action in actionsFor(configurationRow(row))" :key="action.value" :command="action.value">{{ action.label }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </TiTable>

    <el-drawer v-model="drawerVisible" title="保全项配置详情" size="min(680px, 94vw)">
      <el-skeleton v-if="drawerLoading" :rows="8" animated />
      <template v-else-if="selected">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="配置 ID">{{ selected.configurationId }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ selected.definition?.version || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态"><TiStatusTag :value="selected.status" :label="statusLabel(selected.status)" /></el-descriptions-item>
          <el-descriptions-item label="有效期起始">{{ formatDateTime(selected.validFrom) }}</el-descriptions-item>
          <el-descriptions-item label="有效期结束">{{ formatDateTime(selected.validTo) }}</el-descriptions-item>
          <el-descriptions-item label="字段白名单"><span v-for="field in selected.definition?.fieldRules || []" :key="field.fieldCode" class="tag">{{ field.fieldCode }}</span></el-descriptions-item>
          <el-descriptions-item label="流程步骤"><div v-for="step in selected.definition?.steps || []" :key="`${step.sequence}-${step.stepType}`">{{ step.sequence }}. {{ stepTypeLabel(step.stepType) }} / {{ stepModeLabel(step.mode) }}</div></el-descriptions-item>
          <el-descriptions-item label="费用模式">{{ feeLabel(selected.definition?.feeMode) }}</el-descriptions-item>
          <el-descriptions-item label="配置哈希"><span class="hash-text">{{ selected.contentHash || '-' }}</span></el-descriptions-item>
          <el-descriptions-item label="发布证据">{{ selected.publicationEvidence?.catalogVersion || '-' }} / {{ selected.publicationEvidence?.catalogHash || '-' }} · {{ formatDateTime(selected.publicationEvidence?.validatedAt) }}</el-descriptions-item>
        </el-descriptions>
        <div class="drawer-actions">
          <el-button v-if="selected.status === 'DRAFT'" type="primary" :icon="Edit" @click="editSelected">编辑草稿</el-button>
          <el-button v-if="['PUBLISHED', 'RETIRED'].includes(selected.status)" :icon="CopyDocument" @click="createRevision(selected)">创建修订</el-button>
        </div>
        <el-divider>生命周期审计</el-divider>
        <el-timeline>
          <el-timeline-item v-for="audit in selected.lifecycleAudits || []" :key="`${audit.action}-${audit.occurredAt}`" :timestamp="formatDateTime(audit.occurredAt)">{{ audit.action }} · {{ audit.operatorId }}<div class="muted">{{ audit.detail || '' }}</div></el-timeline-item>
        </el-timeline>
      </template>
      <el-empty v-else description="暂无配置详情" />
    </el-drawer>

    <MaintenanceConfigurationEditor
      v-model="editorVisible"
      :source="editorSource"
      :saving="editorSaving"
      @save="saveConfiguration"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Edit, MoreFilled, Plus, Refresh, View } from '@element-plus/icons-vue'
import {
  createMaintenanceConfiguration,
  createMaintenanceConfigurationRevision,
  getMaintenanceConfiguration,
  getMaintenanceConfigurations,
  operateMaintenanceConfiguration,
  replaceMaintenanceConfiguration,
} from '@/api/maintenance'
import type { MaintenanceConfigurationPayload, MaintenanceConfigurationSummary } from '@/api/maintenance'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiTable from '@/components/TiTable/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'
import { formatDateTime } from '@/utils/date'
import { useUserStore } from '@/stores/user'
import MaintenanceConfigurationEditor from './MaintenanceConfigurationEditor.vue'

const userStore = useUserStore()
const query = reactive({ itemCode: '', status: '' })
const rows = ref<MaintenanceConfigurationSummary[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const drawerVisible = ref(false)
const drawerLoading = ref(false)
const selected = ref<MaintenanceConfigurationSummary>()
const editorVisible = ref(false)
const editorSaving = ref(false)
const editorSource = ref<MaintenanceConfigurationSummary>()

const { getLabel: statusLabel } = useDict('MAINTENANCE_CONFIG_STATUS')
const { getLabel: feeModeLabel } = useDict('MAINTENANCE_FEE_MODE')
const { getLabel: stepTypeLabel } = useDict('MAINTENANCE_STEP_TYPE')
const { getLabel: stepModeLabel } = useDict('MAINTENANCE_STEP_MODE')
const actions: Record<string, { label: string; value: string }[]> = {
  DRAFT: [{ label: '校验配置', value: 'validate' }, { label: '提交审批', value: 'submit' }],
  PENDING_APPROVAL: [{ label: '审批通过', value: 'approve' }, { label: '驳回', value: 'reject' }],
  APPROVED: [{ label: '发布', value: 'publish' }, { label: '退回草稿', value: 'return-to-draft' }],
  PUBLISHED: [{ label: '创建修订', value: 'revision' }, { label: '退役', value: 'retire' }],
  RETIRED: [{ label: '创建修订', value: 'revision' }],
}

const lastAuditOperator = (row: MaintenanceConfigurationSummary, action: string) =>
  [...(row.lifecycleAudits || [])].reverse().find((audit) => audit.action === action)?.operatorId
const isCurrentSubmitter = (row: MaintenanceConfigurationSummary) => row.status === 'PENDING_APPROVAL'
  && lastAuditOperator(row, 'SUBMITTED') === userStore.userInfo?.id
const actionsFor = (row: MaintenanceConfigurationSummary) => isCurrentSubmitter(row) ? [] : actions[row.status] || []
const feeLabel = (value?: string) => value ? feeModeLabel(value) : '-'
const configurationRow = (row: unknown) => row as MaintenanceConfigurationSummary
const configurationItemCode = (rawRow: unknown) => {
  const row = configurationRow(rawRow)
  return row.itemCode || row.definition?.itemCode || '-'
}
const configurationName = (rawRow: unknown) => {
  const row = configurationRow(rawRow)
  return row.name || row.definition?.name || '-'
}
const configurationVersion = (rawRow: unknown) => {
  const row = configurationRow(rawRow)
  return row.configurationVersion || row.definition?.version || '-'
}
const workflowLabel = (rawRow: unknown) => {
  const row = configurationRow(rawRow)
  const stepCount = row.stepCount ?? (row.definition
    ? row.definition.steps?.length
    : undefined)
  const feeMode = row.feeMode || row.definition?.feeMode
  return stepCount == null ? '-' : `${stepCount} 步 · ${feeLabel(feeMode)}`
}

const load = async () => {
  loading.value = true
  try {
    const result = await getMaintenanceConfigurations({ ...query, pageNum: pageNum.value, pageSize: pageSize.value })
    rows.value = await Promise.all((result.list || []).map(async (row) => {
      if (row.status !== 'PENDING_APPROVAL') return row
      try { return await getMaintenanceConfiguration(row.configurationId) } catch { return row }
    }))
    total.value = result.total || 0
  } finally { loading.value = false }
}
const reset = () => { query.itemCode = ''; query.status = ''; pageNum.value = 1; load() }
const changePage = (value: number) => { pageNum.value = value; load() }
const changeSize = (value: number) => { pageSize.value = value; pageNum.value = 1; load() }
const openDetail = async (id: string) => {
  drawerVisible.value = true
  drawerLoading.value = true
  selected.value = undefined
  try { selected.value = await getMaintenanceConfiguration(id) } finally { drawerLoading.value = false }
}
const openCreate = () => { editorSource.value = undefined; editorVisible.value = true }
const openEdit = async (id: string) => {
  editorSource.value = await getMaintenanceConfiguration(id)
  editorVisible.value = true
}
const editSelected = () => {
  if (!selected.value) return
  editorSource.value = selected.value
  drawerVisible.value = false
  editorVisible.value = true
}
const currentWithEtag = async (id: string) => {
  const current = await getMaintenanceConfiguration(id)
  if (!current.etag) throw new Error('配置详情未返回 ETag，请刷新后重试')
  return current
}
const createRevision = async (rawRow: MaintenanceConfigurationSummary) => {
  const current = await currentWithEtag(rawRow.configurationId)
  const versionResult = await ElMessageBox.prompt('请输入新修订版本', '创建修订', {
    inputValue: current.definition?.version ? `${current.definition.version}.1` : '',
    inputValidator: (value) => value.trim() ? true : '版本不能为空',
  })
  const created = await createMaintenanceConfigurationRevision(current.configurationId, current.etag!, {
    version: versionResult.value,
    validFrom: new Date().toISOString().slice(0, 19),
  })
  ElMessage.success('修订草稿已创建')
  await load()
  await openEdit(created.configurationId)
}
const operate = async (rawRow: unknown, action: string) => {
  const row = rawRow as MaintenanceConfigurationSummary
  if (action === 'revision') { await createRevision(row); return }
  const needsReason = action === 'reject' || action === 'return-to-draft'
  const message = needsReason ? '请输入操作原因' : `确认执行“${actionsFor(row).find((item) => item.value === action)?.label || action}”？`
  let reason: string | undefined
  if (needsReason) {
    const result = await ElMessageBox.prompt(message, '生命周期操作', { inputType: 'textarea', inputValidator: (value) => value.trim() ? true : '原因不能为空' })
    reason = result.value
  } else { await ElMessageBox.confirm(message, '生命周期操作', { type: 'warning' }) }
  const validationActions = ['validate', 'submit', 'approve', 'publish']
  const body = reason ? { reason } : validationActions.includes(action)
    ? { businessDate: new Date().toISOString().slice(0, 10) }
    : {}
  const current = await currentWithEtag(row.configurationId)
  await operateMaintenanceConfiguration(row.configurationId, action, current.etag, body)
  ElMessage.success(action === 'validate' ? '配置校验通过' : '操作成功')
  await load()
}

const saveConfiguration = async (payload: MaintenanceConfigurationPayload) => {
  editorSaving.value = true
  try {
    if (editorSource.value) {
      const current = await currentWithEtag(editorSource.value.configurationId)
      await replaceMaintenanceConfiguration(current.configurationId, current.etag!, payload)
    } else {
      await createMaintenanceConfiguration(payload)
    }
    ElMessage.success('配置草稿已保存')
    editorVisible.value = false
    await load()
  } finally { editorSaving.value = false }
}

onMounted(load)
</script>

<style scoped>
.toolbar-hint, .muted { color: var(--el-text-color-secondary); font-size: 12px; }
.tag { display: inline-block; margin: 0 6px 6px 0; padding: 2px 8px; background: var(--el-fill-color-light); border-radius: 3px; }
.hash-text { word-break: break-all; font-family: monospace; }
.el-dropdown { margin-left: 6px; }
.drawer-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
@media (max-width: 600px) { :deep(.el-table .el-table-fixed-column--right) { position: static !important; right: auto !important; } }
</style>
