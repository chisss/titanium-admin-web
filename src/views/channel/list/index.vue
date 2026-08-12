<template>
  <!-- 渠道管理列表页 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="渠道名称">
        <el-input v-model="queryParams.channelName" placeholder="模糊搜索" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="渠道代码">
        <el-input v-model="queryParams.channelCode" placeholder="精确查询" clearable style="width: 150px" />
      </el-form-item>
      <el-form-item label="渠道类型">
        <TiDictSelect v-model="queryParams.channelType" dict-type="CHANNEL_TYPE" style="width: 150px" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="queryParams.status" clearable placeholder="全部" style="width: 120px">
          <el-option label="启用" value="ACTIVE" />
          <el-option label="停用" value="INACTIVE" />
        </el-select>
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'channel:create'" @click="openDialog()">
          新建渠道
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
    >
      <el-table-column prop="channelCode" label="渠道代码" width="150" class-name="ti-code-column">
        <template #default="{ row }">
          <TiCopyText :text="row.channelCode" />
        </template>
      </el-table-column>
      <el-table-column prop="channelName" label="渠道名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="channelType" label="类型" width="120" />
      <el-table-column prop="contactName" label="联系人" width="110">
        <template #default="{ row }">{{ row.contactName || '-' }}</template>
      </el-table-column>
      <el-table-column prop="commissionRate" label="佣金比例" width="110">
        <template #default="{ row }">
          {{ row.commissionRate != null ? `${row.commissionRate}%` : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="row.status === 'ACTIVE' ? '启用' : '停用'" />
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="160" />
      <el-table-column label="操作" min-width="200" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="handleView(row)">详情</el-button>
          <el-button size="small" :icon="Edit" v-permission="'channel:edit'" @click="openDialog(row)">
            编辑
          </el-button>
          <el-button
            v-if="row.status === 'INACTIVE'"
            size="small" type="success"
            v-permission="'channel:activate'"
            @click="handleActivate(row)"
          >
            激活
          </el-button>
          <el-button
            v-if="row.status === 'ACTIVE'"
            size="small" type="danger"
            v-permission="'channel:deactivate'"
            @click="handleDeactivate(row)"
          >
            停用
          </el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 新建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑渠道' : '新建渠道'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="渠道代码" prop="channelCode">
          <el-input v-model="form.channelCode" :disabled="!!editId" />
        </el-form-item>
        <el-form-item label="渠道名称" prop="channelName">
          <el-input v-model="form.channelName" />
        </el-form-item>
        <el-form-item label="渠道类型" prop="channelType">
          <TiDictSelect v-model="form.channelType" dict-type="CHANNEL_TYPE" style="width: 100%" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contactName" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="form.contactPhone" />
        </el-form-item>
        <el-form-item label="佣金比例">
          <el-input-number v-model="form.commissionRate" :min="0" :max="100" :precision="2" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, View } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import {
  getChannelList, createChannel, updateChannel, activateChannel, deactivateChannel,
} from '@/api/channel'
import type { ChannelVO } from '@/api/channel'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'

const queryParams = reactive({
  channelName: '',
  channelCode: '',
  channelType: undefined as string | undefined,
  status: undefined as string | undefined,
})

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<ChannelVO, typeof queryParams>((params) => getChannelList(params), queryParams)

fetchData()

const dialogVisible = ref(false)
const editId = ref<string | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()

/** 表单默认值 */
const defaultForm = () => ({
  channelCode: '',
  channelName: '',
  channelType: undefined as string | undefined,
  contactName: '',
  contactPhone: '',
  commissionRate: undefined as number | undefined,
})

const form = reactive(defaultForm())

const rules: FormRules = {
  channelCode: [{ required: true, message: '请输入渠道代码', trigger: 'blur' }],
  channelName: [{ required: true, message: '请输入渠道名称', trigger: 'blur' }],
  channelType: [{ required: true, message: '请选择渠道类型', trigger: 'change' }],
}

/** 打开对话框（新建或编辑） */
const openDialog = (row?: ChannelVO) => {
  editId.value = row?.id ?? null
  Object.assign(form, defaultForm(), row ?? {})
  dialogVisible.value = true
}

/** 保存渠道 */
const handleSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (editId.value) {
      await updateChannel(editId.value, form)
    } else {
      await createChannel(form)
    }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    fetchData()
  } finally {
    saving.value = false
  }
}

/** 查看详情 */
const handleView = (row: ChannelVO) => {
  openDialog(row)
}

/** 激活渠道 */
const handleActivate = async (row: ChannelVO) => {
  await ElMessageBox.confirm(`确认激活渠道"${row.channelName}"？`, '提示', { type: 'warning' })
  await activateChannel(row.id)
  ElMessage.success('激活成功')
  fetchData()
}

/** 停用渠道 */
const handleDeactivate = async (row: ChannelVO) => {
  await ElMessageBox.confirm(`确认停用渠道"${row.channelName}"？`, '警告', { type: 'warning' })
  await deactivateChannel(row.id)
  ElMessage.success('停用成功')
  fetchData()
}
</script>
