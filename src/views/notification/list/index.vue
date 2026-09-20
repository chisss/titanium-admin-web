<template>
  <!-- 通知管理列表页 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="发送渠道">
        <TiDictSelect v-model="queryParams.channel" dict-type="NOTIFICATION_CHANNEL" placeholder="全部" style="width: 130px" />
      </el-form-item>
      <el-form-item label="状态">
        <TiDictSelect v-model="queryParams.status" dict-type="NOTIFICATION_STATUS" placeholder="全部" style="width: 130px" />
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <!-- 🔴 权限码修正：原写 `notification:create`，该码在 admin 的 t_permission/t_menu 种子里
             0 命中 ⇒ 对**所有非超管永久隐藏**（超管因权限集含 "*" 通配而掩盖了问题）。
             `POST /web/v1/proxy/notifications` 的 @PreAuthorize 是 NOTIFICATION_SEND（=notification:send）。 -->
        <el-button type="primary" :icon="Plus" v-permission="'notification:send'" @click="openDialog()">
          发送新通知
        </el-button>
        <!-- 🔴 D-501-67：下游语义为 PENDING → SENT（确认送达），状态机无 READ ⇒ 按钮文案须与系统事实一致 -->
        <!-- 🔴 权限码修正：原写 `notification:read`（种子 0 命中，同属永久隐藏）。
             注意这里未照抄后端：`PUT /notifications/batch-read` 的 @PreAuthorize 是
             `isAuthenticated()`——**后端不要求任何权限码**。改用该页的准入门槛 notification:list，
             即「能打开本页就能确认送达」：比后端严一档但绝不会 403，同时修掉永久隐藏。 -->
        <el-button
          :icon="Check"
          :disabled="selectedIds.length === 0"
          :loading="batchSaving"
          v-permission="'notification:list'"
          @click="handleBatchRead"
        >
          批量确认送达
        </el-button>
      </div>
    </div>

    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      :max-height="'var(--ti-table-max-height-lean)'"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="48" />
      <!-- D-501-63：字段名对齐下游（recipient / notificationType），此前读 customerName/channel 恒空 -->
      <el-table-column prop="recipient" label="接收人" width="160">
        <template #default="{ row }">{{ row.recipient || '-' }}</template>
      </el-table-column>
      <el-table-column prop="notificationType" label="发送渠道" width="120">
        <template #default="{ row }">
          <el-icon class="ti-channel-icon"><component :is="CHANNEL_ICON[row.notificationType]" /></el-icon>
          <span>{{ notificationChannelLabel(row.notificationType) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="subject" label="标题" min-width="160">
        <template #default="{ row }">{{ row.subject || '-' }}</template>
      </el-table-column>
      <el-table-column prop="content" label="内容摘要" min-width="240">
        <template #default="{ row }">{{ truncate(row.content) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :color="STATUS_COLOR[row.status]" :label="notificationStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="sentAt" label="发送时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.sentAt) }}</template>
      </el-table-column>
      <!-- @vue-generic {NotificationVO} -->
      <el-table-column label="操作" min-width="100" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="handleView(row)">详情</el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 发送新通知对话框 -->
    <el-dialog v-model="dialogVisible" title="发送新通知" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <!-- D-501-63：表单字段名对齐下游 SendNotificationRequest（notificationType/recipient/subject），此前 3/4 字段落空 -->
        <el-form-item label="发送渠道" prop="notificationType">
          <TiDictSelect v-model="form.notificationType" dict-type="NOTIFICATION_CHANNEL" placeholder="请选择" style="width: 100%" />
        </el-form-item>
        <el-form-item label="接收方" prop="recipient">
          <el-input v-model="form.recipient" placeholder="手机号 / 邮箱 / openId" />
        </el-form-item>
        <el-form-item label="标题" prop="subject">
          <el-input v-model="form.subject" />
        </el-form-item>
        <el-form-item label="通知内容" prop="content">
          <el-input v-model="form.content" type="textarea" :rows="4" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, View, Check, Message, ChatDotRound, Bell } from '@element-plus/icons-vue'
import type { Component } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { getNotificationList, getNotificationDetail, sendNotification, batchMarkRead } from '@/api/notification'
import type { NotificationVO } from '@/api/notification'
import { useTable } from '@/composables/useTable'
import { confirmAction } from '@/composables/useRowAction'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'
import { formatDateTime } from '@/utils/date'

/** 渠道图标映射 */
const CHANNEL_ICON: Record<string, Component> = {
  SMS: ChatDotRound,
  EMAIL: Message,
  INTERNAL: Bell,
}

const { getLabel: notificationChannelLabel } = useDict('NOTIFICATION_CHANNEL')
const { getLabel: notificationStatusLabel } = useDict('NOTIFICATION_STATUS')

/** 状态标签颜色映射：后端状态机只有 PENDING/SENT/FAILED（无 READ，见 D-501-67） */
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'warning',
  SENT: 'success',
  FAILED: 'danger',
}

const queryParams = reactive({
  customerId: '',
  channel: undefined as string | undefined,
  status: undefined as string | undefined,
})

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<NotificationVO, typeof queryParams>((params) => getNotificationList(params), queryParams)

fetchData()

// 表格选中项
const selectedIds = ref<string[]>([])
const onSelectionChange = (rows: NotificationVO[]) => {
  // D-501-67：id 必须取 notificationId，此前取 row.id（undefined）⇒ 请求体 ids=[null,null] 实质无效
  selectedIds.value = rows.map((r) => r.notificationId)
}

/** 内容截断（60字） */
const truncate = (content?: string) => {
  if (!content) return '-'
  return content.length > 60 ? `${content.slice(0, 60)}...` : content
}

const dialogVisible = ref(false)
const saving = ref(false)
/**
 * 工具栏「批量确认送达」的在途标志。
 *
 * <p>🔴 与上面的 `saving`（发送通知对话框 footer）**分开两个变量**，不合并：两者作用域不同
 * （模态对话框 vs 工具栏批量动作），合并后 `:loading` 会同时点亮一个看不到的按钮，
 * 读者也再说不清这个 ref 到底代表谁在途。</p>
 *
 * <p>🔴 原先该按钮只有 `:disabled="selectedIds.length === 0"`——点下去按钮既不变灰也不转圈
 * （选中项非空，disabled 条件不成立），而它要按选中条数逐条改状态并重查列表，
 * 是本站交互中「最静默」的一个写操作。</p>
 */
const batchSaving = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  notificationType: undefined as NotificationVO['notificationType'] | undefined,
  recipient: '',
  subject: '',
  content: '',
})

const rules: FormRules = {
  notificationType: [{ required: true, message: '请选择发送渠道', trigger: 'change' }],
  recipient: [{ required: true, message: '请输入接收方', trigger: 'blur' }],
  content: [{ required: true, message: '请输入通知内容', trigger: 'blur' }],
}

/** 打开发送对话框 */
const openDialog = () => {
  form.notificationType = undefined
  form.recipient = ''
  form.subject = ''
  form.content = ''
  dialogVisible.value = true
}

/** 发送通知 */
const handleSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    const notificationId = await sendNotification({
      notificationType: form.notificationType!,
      recipient: form.recipient,
      subject: form.subject || undefined,
      content: form.content,
    })
    // D-501-63：不得无条件宣告成功 —— 下游返回的 id 是该通知确实创建的凭据
    ElMessage.success(notificationId ? `已提交发送，通知ID：${notificationId}` : '已提交发送')
    dialogVisible.value = false
    fetchData()
  } finally {
    saving.value = false
  }
}

/** 查看详情 */
const handleView = async (row: NotificationVO) => {
  // D-501-63：此前取 row.id（undefined）⇒ 请求 /notifications/undefined 恒 404 静默失败
  const detail = await getNotificationDetail(row.notificationId)
  ElMessageBox.alert(detail.content, detail.subject || '通知详情')
}

/**
 * 批量确认送达（下游 PUT /batch-read）。
 * 🔴 D-501-67：`data` 是**实际标记条数**，必须消费 —— 此前无条件提示「操作成功」，
 * 而后端如实返回 0（未标记任何通知）时界面仍在谎报成功。
 */
const handleBatchRead = async () => {
  const selected = [...selectedIds.value]
  // 确认框在置位之前：用户取消不该让按钮进过一次 loading
  if (!(await confirmAction(
    `确认将选中的 ${selected.length} 条通知标记为已送达？`,
    '提示',
    { type: 'warning' },
  ))) return
  batchSaving.value = true
  try {
    const marked = await batchMarkRead(selected)
    selectedIds.value = []
    await fetchData()
    const total = Number(marked) || 0
    if (total === 0) {
      ElMessage.warning('未标记任何通知：所选通知均已是终态（已发送/失败）')
    } else if (total < selected.length) {
      // 后端按条独立处理，非法/非 PENDING 的 id 会被跳过并如实反映在计数差上
      ElMessage.warning(`已标记 ${total} 条，另有 ${selected.length - total} 条因非待发送状态被跳过`)
    } else {
      ElMessage.success(`已标记 ${total} 条通知为已送达`)
    }
  } finally {
    batchSaving.value = false
  }
}
</script>

<style scoped lang="scss">
.ti-channel-icon {
  margin-right: 4px;
  vertical-align: middle;
}
</style>
