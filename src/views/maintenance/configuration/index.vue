<template>
  <div class="ti-page">
    <TiSearchForm :model="query" @search="load" @reset="reset">
      <el-form-item label="保全项编码"><el-input v-model="query.itemCode" clearable placeholder="例如 POLICY_INFO_CHANGE" /></el-form-item>
      <el-form-item label="配置状态">
        <el-select v-model="query.status" clearable placeholder="全部" style="width: 150px">
          <el-option v-for="status in statuses" :key="status.value" v-bind="status" />
        </el-select>
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar">
      <div class="ti-toolbar-left"><span class="toolbar-hint">配置决定字段白名单、流程步骤、费用模式和生效规则</span></div>
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
      <el-table-column prop="status" label="状态" width="120"><template #default="{ row }"><TiStatusTag :value="row.status" /></template></el-table-column>
      <el-table-column label="步骤/费用" min-width="150">
        <template #default="{ row }">{{ workflowLabel(row) }}</template>
      </el-table-column>
      <el-table-column prop="validFrom" label="生效起始" width="170" />
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="openDetail(row.configurationId)">查看</el-button>
          <el-dropdown @command="(action: string) => operate(row, action)">
            <el-button size="small" :icon="MoreFilled">生命周期</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="action in actionsFor(row.status)" :key="action.value" :command="action.value">{{ action.label }}</el-dropdown-item>
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
          <el-descriptions-item label="状态"><TiStatusTag :value="selected.status" /></el-descriptions-item>
          <el-descriptions-item label="字段白名单"><span v-for="field in selected.definition?.fieldRules || []" :key="field.fieldCode" class="tag">{{ field.fieldCode }}</span></el-descriptions-item>
          <el-descriptions-item label="流程步骤"><div v-for="step in selected.definition?.steps || []" :key="`${step.sequence}-${step.stepType}`">{{ step.sequence }}. {{ step.stepType }} / {{ step.mode }}</div></el-descriptions-item>
          <el-descriptions-item label="费用模式">{{ feeLabel(selected.definition?.feeMode) }}</el-descriptions-item>
          <el-descriptions-item label="配置哈希"><span class="hash-text">{{ selected.contentHash || '-' }}</span></el-descriptions-item>
          <el-descriptions-item label="发布证据">{{ selected.publicationEvidence?.catalogVersion || '-' }} / {{ selected.publicationEvidence?.catalogHash || '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-divider>生命周期审计</el-divider>
        <el-timeline>
          <el-timeline-item v-for="audit in selected.lifecycleAudits || []" :key="`${audit.action}-${audit.occurredAt}`" :timestamp="audit.occurredAt">{{ audit.action }} · {{ audit.operatorId }}<div class="muted">{{ audit.detail || '' }}</div></el-timeline-item>
        </el-timeline>
      </template>
      <el-empty v-else description="暂无配置详情" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MoreFilled, Refresh, View } from '@element-plus/icons-vue'
import { getMaintenanceConfiguration, getMaintenanceConfigurations, operateMaintenanceConfiguration } from '@/api/maintenance'
import type { MaintenanceConfigurationSummary } from '@/api/maintenance'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiTable from '@/components/TiTable/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'

const query = reactive({ itemCode: '', status: '' })
const rows = ref<MaintenanceConfigurationSummary[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const drawerVisible = ref(false)
const drawerLoading = ref(false)
const selected = ref<MaintenanceConfigurationSummary>()

const statuses = [
  { label: '草稿', value: 'DRAFT' }, { label: '待审批', value: 'PENDING_APPROVAL' },
  { label: '已审批', value: 'APPROVED' }, { label: '已发布', value: 'PUBLISHED' }, { label: '已退役', value: 'RETIRED' },
]
const actions: Record<string, { label: string; value: string }[]> = {
  DRAFT: [{ label: '提交审批', value: 'submit' }],
  PENDING_APPROVAL: [{ label: '审批通过', value: 'approve' }, { label: '驳回', value: 'reject' }],
  APPROVED: [{ label: '发布', value: 'publish' }, { label: '退回草稿', value: 'return-to-draft' }],
  PUBLISHED: [{ label: '退役', value: 'retire' }],
  RETIRED: [],
}

const actionsFor = (status: string) => actions[status] || []
const feeLabel = (value?: string) => value === 'NONE' ? '无收退费' : value === 'REFUND_ONLY' ? '仅退费' : value === 'COLLECTION_ONLY' ? '仅收费' : value === 'RECALCULATE' ? '费用重算' : value || '-'
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
  return row.definition
    ? `${row.definition.steps?.length || 0} 步 · ${feeLabel(row.definition.feeMode)}`
    : '-'
}

const load = async () => {
  loading.value = true
  try {
    const result = await getMaintenanceConfigurations({ ...query, pageNum: pageNum.value, pageSize: pageSize.value })
    rows.value = result.list || []
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
const operate = async (rawRow: unknown, action: string) => {
  const row = rawRow as MaintenanceConfigurationSummary
  const needsReason = action === 'reject' || action === 'return-to-draft'
  const message = needsReason ? '请输入操作原因' : `确认执行“${actionsFor(row.status).find((item) => item.value === action)?.label || action}”？`
  let reason: string | undefined
  if (needsReason) {
    const result = await ElMessageBox.prompt(message, '生命周期操作', { inputType: 'textarea', inputValidator: (value) => value.trim() ? true : '原因不能为空' })
    reason = result.value
  } else { await ElMessageBox.confirm(message, '生命周期操作', { type: 'warning' }) }
  const validationActions = ['submit', 'approve', 'publish']
  const body = reason ? { reason } : validationActions.includes(action)
    ? { businessDate: new Date().toISOString().slice(0, 10) }
    : {}
  await operateMaintenanceConfiguration(row.configurationId, action, row.rowVersion == null ? undefined : String(row.rowVersion), body)
  ElMessage.success('操作成功')
  await load()
}

onMounted(load)
</script>

<style scoped>
.toolbar-hint, .muted { color: var(--el-text-color-secondary); font-size: 12px; }
.tag { display: inline-block; margin: 0 6px 6px 0; padding: 2px 8px; background: var(--el-fill-color-light); border-radius: 3px; }
.hash-text { word-break: break-all; font-family: monospace; }
.el-dropdown { margin-left: 6px; }
@media (max-width: 600px) { :deep(.el-table .el-table-fixed-column--right) { position: static !important; right: auto !important; } }
</style>
