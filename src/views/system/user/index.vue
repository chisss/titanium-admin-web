<template>
  <!-- 用户管理页 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="用户名">
        <el-input v-model="queryParams.username" clearable style="width: 150px" />
      </el-form-item>
      <el-form-item label="昵称">
        <el-input v-model="queryParams.nickname" clearable style="width: 150px" />
      </el-form-item>
      <el-form-item label="状态">
        <TiDictSelect v-model="queryParams.status" dict-type="COMMON_STATUS" placeholder="全部" style="width: 110px" />
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'system:user:create'" @click="openDialog()">
          新增用户
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
      <el-table-column prop="username" label="用户名" width="140" />
      <el-table-column prop="nickname" label="昵称" width="120" />
      <el-table-column prop="deptId" label="部门" width="120">
        <template #default="{ row }">
          {{ getDeptName(row.deptId) }}
        </template>
      </el-table-column>
      <el-table-column prop="email" label="邮箱" min-width="180" show-overflow-tooltip />
      <el-table-column prop="mobile" label="手机号" width="130" />
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="commonStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="160" />
      <!-- @vue-generic {UserListItem} -->
      <el-table-column label="操作" min-width="200" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" v-permission="'system:user:edit'" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" v-permission="'system:user:reset-pwd'" @click="handleResetPwd(row)">重置密码</el-button>
          <el-button
            size="small"
            :type="row.status === 'ACTIVE' ? 'danger' : 'success'"
            v-permission="'system:user:toggle'"
            @click="handleToggle(row)"
          >
            {{ row.status === 'ACTIVE' ? '禁用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑用户' : '新增用户'" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" :disabled="!!editId" />
        </el-form-item>
        <el-form-item v-if="!editId" label="初始密码" prop="password">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="form.nickname" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="form.mobile" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item label="部门">
          <el-select v-model="form.deptId" clearable placeholder="请选择部门" style="width: 100%">
            <el-option v-for="dept in deptOptions" :key="dept.id" :label="dept.deptName" :value="dept.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.roleIds" multiple clearable placeholder="请选择角色" style="width: 100%">
            <el-option v-for="role in roleOptions" :key="role.id" :label="role.name" :value="role.id" />
          </el-select>
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
import { getUserList, createUser, updateUser, toggleUserStatus, resetPassword, assignRoles } from '@/api/user'
import type { UserListItem } from '@/api/user'
import { getDeptSimpleList, type DeptSimpleItem } from '@/api/dept'
import { getRoleList, type RoleVO } from '@/api/role'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'

const { getLabel: commonStatusLabel } = useDict('COMMON_STATUS')

const queryParams = reactive({ username: '', nickname: '', status: undefined as string | undefined })

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<UserListItem, typeof queryParams>((params) => getUserList(params), queryParams)

fetchData()

const dialogVisible = ref(false)
const editId = ref<string | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()

const deptOptions = ref<DeptSimpleItem[]>([])
const roleOptions = ref<RoleVO[]>([])

const form = reactive({ username: '', password: '', nickname: '', mobile: '', email: '', deptId: '', roleIds: [] as string[] })

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入初始密码', trigger: 'blur' }, { min: 6, message: '密码不少于6位', trigger: 'blur' }],
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
}

const openDialog = async (row?: UserListItem) => {
  editId.value = row?.id ?? null
  Object.assign(form, row ?? { username: '', password: '', nickname: '', mobile: '', email: '', deptId: '', roleIds: [] })

  // 首次打开时加载选项
  if (!deptOptions.value.length) {
    deptOptions.value = await getDeptSimpleList()
  }
  if (!roleOptions.value.length) {
    const res = await getRoleList({ pageNum: 1, pageSize: 100 })
    roleOptions.value = res.list
  }

  dialogVisible.value = true
}

const handleSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (editId.value) {
      await updateUser(editId.value, form)
      // 编辑时也分配角色
      if (form.roleIds.length > 0) {
        await assignRoles(editId.value, form.roleIds)
      }
    } else {
      const createdUser = await createUser(form)
      // 创建后立即分配角色
      if (form.roleIds.length > 0 && createdUser.id) {
        await assignRoles(createdUser.id, form.roleIds)
      }
    }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    fetchData()
  } finally {
    saving.value = false
  }
}

const handleResetPwd = async (row: UserListItem) => {
  await ElMessageBox.prompt(`请输入"${row.username}"的新密码`, '重置密码', {
    inputType: 'password',
    inputPattern: /.{6,}/,
    inputErrorMessage: '密码不少于6位',
    confirmButtonText: '确认重置',
  }).then(async ({ value }) => {
    await resetPassword(row.id, value)
    ElMessage.success('密码已重置')
  }).catch(() => {})
}

const handleToggle = async (row: UserListItem) => {
  const nextStatus = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
  await toggleUserStatus(row.id, nextStatus)
  ElMessage.success('操作成功')
  fetchData()
}

const getDeptName = (deptId?: string) => {
  if (!deptId) return '-'
  const dept = deptOptions.value.find(d => d.id === deptId)
  return dept?.deptName ?? deptId
}
</script>
