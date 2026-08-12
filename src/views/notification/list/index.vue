<template>
  <!-- 通知管理列表页 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="客户ID">
        <el-input v-model="queryParams.customerId" placeholder="精确查询" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="发送渠道">
        <el-select v-model="queryParams.channel" clearable placeholder="全部" style="width: 130px">
          <el-option label="短信" value="SMS" />
          <el-option label="邮件" value="EMAIL" />
          <el-option label="站内信" value="IN_APP" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="queryParams.status" clearable placeholder="全部" style="width: 130px">
          <el-option label="待发送" value="PENDING" />
          <el-option label="已发送" value="SENT" />
          <el-option label="发送失败" value="FAILED" />
          <el-option label="已读" value="READ" />
        </el-select>
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'notification:create'" @click="openDialog()">
          发送新通知
        </el-button>
        <el-button
          :icon="Check"
          :disabled="selectedIds.length === 0"
          v-permission="'notification:read'"
          @click="handleBatchRead"
        >
          批量标记已读
        </el-button>
      </div>
    </div>

    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="48" />
      <el-table-column prop="id" label="通知ID" width="180" show-overflow-tooltip />
      <el-table-column prop="customerName" label="客户" width="140">
        <template #default="{ row }">{{ row.customerName || row.customerId || '-' }}</template>
      </el-table-column>
      <el-table-column prop="channel" label="发送渠道" width="120">
        <template #default="{ row }">
          <el-icon class="ti-channel-icon"><component :is="CHANNEL_ICON[row.channel]" /></el-icon>
          <span>{{ CHANNEL_LABEL[row.channel] || row.channel }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="content" label="内容摘要" min-width="240">
        <template #default="{ row }">{{ truncate(row.content) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :color="STATUS_COLOR[row.status]" :label="STATUS_LABEL[row.status]" />
        </template>
      </el-table-column>
      <el-table-column prop="sentAt" label="发送时间" width="160">
        <template #default="{ row }">{{ row.sentAt || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="handleView(row)">详情</el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 发送新通知对话框 -->
    <el-dialog v-model="dialogVisible" title="发送新通知" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="发送渠道" prop="channel">
          <el-select v-model="form.channel" placeholder="请选择" style="width: 100%">
            <el-option label="短信" value="SMS" />
            <el-option label="邮件" value="EMAIL" />
            <el-option label="站内信" value="IN_APP" />
          </el-select>
        </el-form-item>
        <el-form-item label="客户ID" prop="customerId">
          <el-input v-model="form.customerId" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="form.title" />
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
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'

/** 渠道图标映射 */
const CHANNEL_ICON: Record<string, Component> = {
  SMS: ChatDotRound,
  EMAIL: Message,
  IN_APP: Bell,
}

/** 渠道中文标签映射 */
const CHANNEL_LABEL: Record<string, string> = {
  SMS: '短信',
  EMAIL: '邮件',
  IN_APP: '站内信',
}

/** 状态标签颜色映射 */
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'warning',
  SENT: 'success',
  FAILED: 'danger',
  READ: 'info',
}

/** 状态中文标签映射 */
const STATUS_LABEL: Record<string, string> = {
  PENDING: '待发送',
  SENT: '已发送',
  FAILED: '发送失败',
  READ: '已读',
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
  selectedIds.value = rows.map((r) => r.id)
}

/** 内容截断（60字） */
const truncate = (content?: string) => {
  if (!content) return '-'
  return content.length > 60 ? `${content.slice(0, 60)}...` : content
}

const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  channel: undefined as NotificationVO['channel'] | undefined,
  customerId: '',
  title: '',
  content: '',
})

const rules: FormRules = {
  channel: [{ required: true, message: '请选择发送渠道', trigger: 'change' }],
  customerId: [{ required: true, message: '请输入客户ID', trigger: 'blur' }],
  content: [{ required: true, message: '请输入通知内容', trigger: 'blur' }],
}

/** 打开发送对话框 */
const openDialog = () => {
  form.channel = undefined
  form.customerId = ''
  form.title = ''
  form.content = ''
  dialogVisible.value = true
}

/** 发送通知 */
const handleSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await sendNotification(form)
    ElMessage.success('发送成功')
    dialogVisible.value = false
    fetchData()
  } finally {
    saving.value = false
  }
}

/** 查看详情 */
const handleView = async (row: NotificationVO) => {
  const detail = await getNotificationDetail(row.id)
  ElMessageBox.alert(detail.content, detail.title || '通知详情')
}

/** 批量标记已读 */
const handleBatchRead = async () => {
  await ElMessageBox.confirm(`确认将选中的 ${selectedIds.value.length} 条通知标记为已读？`, '提示', { type: 'warning' })
  await batchMarkRead(selectedIds.value)
  ElMessage.success('操作成功')
  selectedIds.value = []
  fetchData()
}
</script>

<style scoped lang="scss">
.ti-channel-icon {
  margin-right: 4px;
  vertical-align: middle;
}
</style>
