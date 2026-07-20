<template>
  <!-- 租户管理页 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="租户名称">
        <el-input v-model="queryParams.name" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="租户编码">
        <el-input v-model="queryParams.code" clearable style="width: 150px" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="queryParams.status" clearable placeholder="全部" style="width: 110px">
          <el-option label="正常" value="ACTIVE" />
          <el-option label="禁用" value="INACTIVE" />
          <el-option label="试用" value="TRIAL" />
        </el-select>
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'system:tenant:create'" @click="openDialog()">
          新增租户
        </el-button>
      </div>
    </div>

    <TiTable
      :data="tableData.value"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="code" label="租户编码" width="140" />
      <el-table-column prop="name" label="租户名称" min-width="160" />
      <el-table-column prop="contactName" label="联系人" width="100" />
      <el-table-column prop="contactMobile" label="联系电话" width="130" />
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" />
        </template>
      </el-table-column>
      <el-table-column prop="expireAt" label="到期时间" width="110" />
      <el-table-column prop="createdAt" label="创建时间" width="160" />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button text size="small" :icon="Edit" @click="openDialog(row)">编辑</el-button>
          <el-button
            text size="small"
            :type="row.status === 'ACTIVE' ? 'danger' : 'success'"
            @click="handleToggleStatus(row)"
          >
            {{ row.status === 'ACTIVE' ? '禁用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑租户' : '新增租户'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="租户编码" prop="code">
          <el-input v-model="form.code" :disabled="!!editId" />
        </el-form-item>
        <el-form-item label="租户名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="联系人" prop="contactName">
          <el-input v-model="form.contactName" />
        </el-form-item>
        <el-form-item label="联系电话" prop="contactMobile">
          <el-input v-model="form.contactMobile" />
        </el-form-item>
        <el-form-item label="联系邮箱">
          <el-input v-model="form.contactEmail" />
        </el-form-item>
        <el-form-item label="到期时间">
          <el-date-picker v-model="form.expireAt" value-format="YYYY-MM-DD" style="width: 100%" />
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
import { Plus, Edit } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { getTenantList, createTenant, updateTenant, toggleTenantStatus } from '@/api/tenant'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import type { TenantVO } from '@/types/business.d'

const queryParams = reactive({ name: '', code: '', status: undefined as string | undefined })

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<TenantVO, typeof queryParams>((params) => getTenantList(params), queryParams)

fetchData()

const dialogVisible = ref(false)
const editId = ref<string | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  code: '', name: '', contactName: '', contactMobile: '', contactEmail: '', expireAt: undefined as string | undefined,
})

const rules: FormRules = {
  code: [{ required: true, message: '请输入租户编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入租户名称', trigger: 'blur' }],
  contactName: [{ required: true, message: '请输入联系人', trigger: 'blur' }],
  contactMobile: [{ required: true, message: '请输入联系电话', trigger: 'blur' }],
}

const openDialog = (row?: TenantVO) => {
  editId.value = row?.id ?? null
  Object.assign(form, row ?? { code: '', name: '', contactName: '', contactMobile: '', contactEmail: '', expireAt: undefined })
  dialogVisible.value = true
}

const handleSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (editId.value) { await updateTenant(editId.value, form) } else { await createTenant(form) }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    fetchData()
  } finally {
    saving.value = false
  }
}

const handleToggleStatus = async (row: TenantVO) => {
  const nextStatus = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
  await ElMessageBox.confirm(`确认${nextStatus === 'ACTIVE' ? '启用' : '禁用'}租户"${row.name}"？`, '提示', { type: 'warning' })
  await toggleTenantStatus(row.id, nextStatus)
  ElMessage.success('操作成功')
  fetchData()
}
</script>
