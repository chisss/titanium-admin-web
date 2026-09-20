<template>
  <div class="ti-page">
    <TiSearchForm :model="query" @search="load" @reset="reset">
      <el-form-item label="保全项编码"><el-input v-model="query.itemCode" clearable placeholder="例如 POLICY_INFO_CHANGE" /></el-form-item>
      <el-form-item label="配置状态">
        <TiDictSelect v-model="query.status" dict-type="MAINTENANCE_CONFIG_STATUS" placeholder="全部" style="width: 150px" />
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar">
      <div class="ti-toolbar-left"><el-button type="primary" :icon="Plus" v-permission="'maintenance:config:create'" @click="openCreate">新建配置</el-button></div>
      <div class="ti-toolbar-right"><el-button :icon="Refresh" @click="load">刷新</el-button></div>
    </div>

    <TiTable
      :data="rows"
      :total="total"
      :page-num="pageNum"
      :page-size="pageSize"
      :loading="loading"
      :max-height="'var(--ti-table-max-height-default)'"
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
      <el-table-column label="操作" min-width="200" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <!-- 🔴 下面几处权限一律判进 `v-if`/`v-else-if` 表达式，**不用** v-permission 指令：
               指令在 mounted 里直接 `el.parentNode.removeChild(el)` 改真实 DOM，与同一元素上的
               v-if 动态挂载/卸载叠在一起时，Vue 的 vnode 树与实际 DOM 会不一致（详见保全工作台同款说明）。 -->
          <el-button size="small" :icon="View" @click="openDetail(row.configurationId)">查看</el-button>
          <el-button
            v-if="row.status === 'DRAFT' && hasPermission('maintenance:config:edit')"
            size="small" :icon="Edit"
            @click="openEdit(row.configurationId)"
          >
            编辑
          </el-button>
          <el-tag v-if="isCurrentSubmitter(configurationRow(row))" type="info" effect="plain">需其他审批人</el-tag>
          <!-- 🔴 trigger="click" 不可省：EP 的 el-dropdown 默认 hover 触发，而全站另外 8 个
               下拉（Topbar ×2、login、policy/detail 等）一律用 click。此处曾是唯一例外，
               后果是①同一后台两种操作习惯；②触摸设备无 hover，展开不稳定；
               ③键盘用户聚焦按钮后按 Enter/Space 不展开（click 语义才匹配）。
               生命周期操作是低频高危动作，须显式点击，不宜悬停即弹。 -->
          <el-dropdown v-else-if="actionsFor(configurationRow(row)).length" trigger="click" @command="(action: string) => operate(row, action)">
            <!-- 下拉内含 7 类生命周期命令，无法把 loading 绑到具体下拉项；绑在本行触发器上
                 表示「这一行有生命周期操作在途」，pending 归属仍然正确 -->
            <el-button size="small" :icon="MoreFilled" :loading="isRowBusy(row)">生命周期</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="action in actionsFor(configurationRow(row))" :key="action.value" :command="action.value" :class="{ 'ti-dropdown-item--danger': action.destructive }">{{ action.label }}</el-dropdown-item>
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
          <el-button v-if="selected.status === 'DRAFT' && hasPermission('maintenance:config:edit')" type="primary" :icon="Edit" @click="editSelected">编辑草稿</el-button>
          <el-button v-if="['PUBLISHED', 'RETIRED'].includes(selected.status) && hasPermission('maintenance:config:create')" :icon="CopyDocument" :loading="revisionSaving" @click="createRevisionFromDrawer">创建修订</el-button>
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
import { useRowAction, confirmAction, actionKey } from '@/composables/useRowAction'
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
import { usePermission } from '@/composables/usePermission'
import { formatDateTime } from '@/utils/date'
import { useUserStore } from '@/stores/user'
import MaintenanceConfigurationEditor from './MaintenanceConfigurationEditor.vue'

const userStore = useUserStore()
/**
 * 🔴 生命周期动作的鉴权码取自**下游真源**，不是照动作名猜的。
 *
 * <p>admin 侧 `MaintenanceCaseProxyController.operateConfiguration` 的守卫是
 * `hasAnyAuthority(SUBMIT, APPROVE, PUBLISH, RETIRE)` 的**并集**（它拦不住"用 submit 的权限去 approve"），
 * 真正逐动作鉴权在下游 `titanium-maintenance` 的 `MaintenanceConfigurationController`，
 * 它把 `authorities()` 透传进来后用 `contextResolver.require(servletRequest, <常量>)` 逐端点校验。
 * 下面每个动作的 perm 即照该文件的端点常量逐个抄录，两处容易记错的已按原文校正：
 * · `return-to-draft` 用的是 **APPROVE**（不是 PUBLISH——退回是审批动作的一部分）
 * · `validate` 用的是 **VIEW**（校验不改状态，只读权限即可）</p>
 */
const { hasPermission } = usePermission()
const query = reactive({ itemCode: '', status: '' })
const rows = ref<MaintenanceConfigurationSummary[]>([])
/** 总条数；null 表示总数未知（🔴 D-501-57），不得以当前页条数或 0 顶替 */
const total = ref<number | null>(0)
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
// 🔴 destructive 与 label 分离声明，不从文案猜：判据同 ConfigPanel.ExtraAction.destructive
//    ——「执行后既有数据/权益状态不可恢复」。驳回终结本次提交、退役终结该版本，
//    而「退回草稿」虽然后退但可重新提交，不算破坏性。
/** 生命周期动作表：perm 为下游 `MaintenanceConfigurationController` 逐端点校验的鉴权码（见上方注释） */
const actions: Record<string, { label: string; value: string; perm: string; destructive?: boolean }[]> = {
  DRAFT: [{ label: '校验配置', value: 'validate', perm: 'maintenance:config:view' }, { label: '提交审批', value: 'submit', perm: 'maintenance:config:submit' }],
  PENDING_APPROVAL: [{ label: '审批通过', value: 'approve', perm: 'maintenance:config:approve' }, { label: '驳回', value: 'reject', perm: 'maintenance:config:approve', destructive: true }],
  APPROVED: [{ label: '发布', value: 'publish', perm: 'maintenance:config:publish' }, { label: '退回草稿', value: 'return-to-draft', perm: 'maintenance:config:approve' }],
  PUBLISHED: [{ label: '创建修订', value: 'revision', perm: 'maintenance:config:create' }, { label: '退役', value: 'retire', perm: 'maintenance:config:retire', destructive: true }],
  RETIRED: [{ label: '创建修订', value: 'revision', perm: 'maintenance:config:create' }],
}

const lastAuditOperator = (row: MaintenanceConfigurationSummary, action: string) =>
  [...(row.lifecycleAudits || [])].reverse().find((audit) => audit.action === action)?.operatorId
const isCurrentSubmitter = (row: MaintenanceConfigurationSummary) => row.status === 'PENDING_APPROVAL'
  && lastAuditOperator(row, 'SUBMITTED') === userStore.userInfo?.id
/**
 * 🔴 可用动作 = 状态机允许的 ∩ 当前用户有权做的。
 *
 * <p>用 `hasPermission` 在前端先过滤，而不是把按钮全部渲染出来等后端 403：后端对无权动作返回的是
 * **错误**，用户点完只看到一句失败提示，既不知道"这个动作我根本没权限"、也不知道"该找谁开权限"。
 * 过滤后下拉里只剩真能执行的动作；无权用户若一个动作都没有，整个「生命周期」下拉直接不渲染
 * （模板上是 `v-else-if="actionsFor(...).length"`）。</p>
 */
const actionsFor = (row: MaintenanceConfigurationSummary) =>
  (isCurrentSubmitter(row) ? [] : actions[row.status] || []).filter((action) => hasPermission(action.perm))
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
    total.value = result.total ?? null
  } finally { loading.value = false }
}

/**
 * 行内生命周期操作（校验/提交/审批/发布/驳回/退回草稿/创建修订）的在途行键。
 *
 * 🔴 这些动作原先点下去**界面上毫无变化**：它们改的是配置的**生命周期状态**，
 * 且 `validate`/`submit`/`approve`/`publish` 走的是同一端点、同一权限，
 * 请求在途期间用户看不到任何区别，自然会以为没点中而重复点击。
 * 同页的编辑器保存（`saveConfiguration`）已有 `editorSaving` + finally，两套标准并存。
 */
const { rowPending, run } = useRowAction(load)

/**
 * 该配置行是否有生命周期操作在途。
 *
 * 键形如 `${configurationId}:${action}`（见 `actionKey`），故按**第一个冒号**切分取出行主键
 * 再全等比较——不用 `startsWith`：ID 之间可能有前缀关系（一个 ID 恰好是另一个的前缀），
 * 那样 A 行的操作会点亮 B 行的按钮。
 */
const isRowBusy = (row: unknown) =>
  rowPending.value !== null
  && String(rowPending.value).split(':')[0] === (row as MaintenanceConfigurationSummary).configurationId
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
  let versionResult: { value: string }
  try {
    versionResult = await ElMessageBox.prompt('请输入新修订版本', '创建修订', {
      inputValue: current.definition?.version ? `${current.definition.version}.1` : '',
      inputValidator: (value) => value.trim() ? true : '版本不能为空',
    })
  } catch {
    return null // 用户取消：prompt 以 reject 表达取消
  }
  const created = await createMaintenanceConfigurationRevision(current.configurationId, current.etag!, {
    version: versionResult.value,
    validFrom: new Date().toISOString().slice(0, 19),
  })
  ElMessage.success('修订草稿已创建')
  return created.configurationId
}
/**
 * 详情抽屉里「创建修订」的在途标志。
 *
 * <p>🔴 该按钮直连 `createRevision`（写接口），原先点下去毫无变化：确认框一关、
 * 抽屉还在原地，而创建修订会落一条新的配置草稿。</p>
 *
 * <p>与 `editorSaving`（编辑器保存）分开：抽屉与编辑器是两个不同的动作入口，
 * 合并后 `:loading` 会同时点亮一个看不见的按钮。</p>
 */
const revisionSaving = ref(false)
const createRevisionFromDrawer = async () => {
  if (!selected.value) return
  revisionSaving.value = true
  try { await createRevision(selected.value) } finally { revisionSaving.value = false }
}

const operate = async (rawRow: unknown, action: string) => {
  const row = rawRow as MaintenanceConfigurationSummary
  const needsReason = action === 'reject' || action === 'return-to-draft'
  const message = needsReason ? '请输入操作原因' : `确认执行“${actionsFor(row).find((item) => item.value === action)?.label || action}”？`
  // 确认/输入框都在 run 之外：用户取消不该让按钮进过一次 loading（进过就会闪一下，像是「执行了」）
  let revisionId: string | null | undefined
  if (action === 'revision') {
    revisionId = await createRevision(row)
    if (revisionId === null) return
  }
  let reason: string | undefined
  if (needsReason) {
    try {
      const result = await ElMessageBox.prompt(message, '生命周期操作', { inputType: 'textarea', inputValidator: (value) => value.trim() ? true : '原因不能为空' })
      reason = result.value
    } catch {
      return
    }
  } else if (action !== 'revision') {
    if (!(await confirmAction(message, '生命周期操作', { type: 'warning' }))) return
  }
  const validationActions = ['validate', 'submit', 'approve', 'publish']
  const body = reason ? { reason } : validationActions.includes(action)
    ? { businessDate: new Date().toISOString().slice(0, 10) }
    : {}
  await run(actionKey(row.configurationId, action), async () => {
    if (action === 'revision') {
      // 修订草稿已建，直接进编辑器（与原先一致：不刷新列表而是打开编辑）
      await openEdit(revisionId!)
      return
    }
    const current = await currentWithEtag(row.configurationId)
    await operateMaintenanceConfiguration(row.configurationId, action, current.etag, body)
    ElMessage.success(action === 'validate' ? '配置校验通过' : '操作成功')
  })
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

<style scoped lang="scss">
.toolbar-hint, .muted { color: var(--el-text-color-secondary); font-size: 12px; }
.tag { display: inline-block; margin: 0 6px 6px 0; padding: 2px 8px; background: var(--el-fill-color-light); border-radius: $radius-sm; }
.hash-text { word-break: break-all; font-family: monospace; }
.el-dropdown { margin-left: 6px; }
.drawer-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
@media (max-width: $breakpoint-mobile) { :deep(.el-table .el-table-fixed-column--right) { position: static !important; right: auto !important; } }
</style>
