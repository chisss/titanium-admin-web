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
      :max-height="'var(--ti-table-max-height-default)'"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      :error="tableError"
      @refresh="retry"
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
      <el-table-column prop="createdAt" label="创建时间" width="160">
        <!-- 时间列统一走全局日期工具，避免直出后端 ISO 串（2026-09-18 全站实测 7 页 8 列） -->
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <!-- @vue-generic {UserListItem} -->
      <el-table-column label="操作" width="280" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" v-permission="'system:user:edit'" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" v-permission="'system:user:reset-pwd'" :loading="rowPending === actionKey(row.id, 'reset-pwd')" @click="handleResetPwd(row)">重置密码</el-button>
          <el-button
            size="small"
            :type="row.status === 'ACTIVE' ? 'danger' : 'success'"
            v-permission="'system:user:toggle'"
            :loading="rowPending === actionKey(row.id, 'toggle')"
            @click="handleToggle(row)"
          >
            {{ row.status === 'ACTIVE' ? '禁用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑用户' : '新增用户'" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
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
import { useRowAction, confirmAction, actionKey } from '@/composables/useRowAction'
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
import { formatDateTime } from '@/utils/date'
import { useDict } from '@/composables/useDict'

const { getLabel: commonStatusLabel } = useDict('COMMON_STATUS')

const queryParams = reactive({ username: '', nickname: '', status: undefined as string | undefined })

const { tableData, tableLoading, tableError, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange, retry } =
  useTable<UserListItem, typeof queryParams>((params) => getUserList(params), queryParams)

fetchData()

/** 行内动作（重置密码 / 启用禁用）的 pending 与错误兜底统一由 useRowAction 承担 */
const { rowPending, run } = useRowAction(fetchData)

const dialogVisible = ref(false)
const editId = ref<string | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()

const deptOptions = ref<DeptSimpleItem[]>([])
const roleOptions = ref<RoleVO[]>([])

const form = reactive({ username: '', password: '', nickname: '', mobile: '', email: '', deptId: '', roleIds: [] as string[] })

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入初始密码', trigger: 'blur' }, { min: 8, max: 64, message: '密码长度需为 8-64 位', trigger: 'blur' }],
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
    roleOptions.value = await getRoleList()
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
      if ((form.roleIds ?? []).length > 0) {
        await assignRoles(editId.value, form.roleIds)
      }
    } else {
      const createdUser = await createUser(form)
      // 创建后立即分配角色
      if ((form.roleIds ?? []).length > 0 && createdUser.id) {
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
  // 密码由管理员显式指定：后端已无「系统默认密码」语义，且不接受空口令
  let input: { value: string } | null = null
  try {
    input = await ElMessageBox.prompt(`请为用户「${row.username}」设置新密码`, '重置密码', {
      inputType: 'password',
      confirmButtonText: '确认重置',
      // 与后端 @Size(min = 8) 对齐，避免前端放行、后端 400 的契约错位
      inputValidator: (v) => (v && v.length >= 8 ? true : '密码长度需为 8-64 位'),
    })
  } catch {
    return // 用户取消：prompt 同样以 reject 表达取消，必须吞掉
  }
  if (!input?.value) return
  await run(actionKey(row.id, 'reset-pwd'), async () => {
    await resetPassword(row.id, input.value)
    ElMessage.success('密码已重置')
  })
}

/**
 * 启用 / 禁用账号。
 *
 * 「禁用」是破坏性操作：该账号**立即无法登录**，且列表行内没有撤销入口——
 * 误点只能靠管理员再点一次「启用」挽回，而误点者往往并不知道自己刚做了什么。
 * 故禁用必须二次确认；启用是恢复性操作，不额外增加摩擦（不对称是刻意的）。
 */
const handleToggle = async (row: UserListItem) => {
  const isDisabling = row.status === 'ACTIVE'
  if (isDisabling) {
    const ok = await confirmAction(
      `确定禁用用户「${row.username}」？禁用后该账号将立即无法登录系统。`,
      '禁用用户',
      { type: 'warning', confirmButtonText: '确定禁用', cancelButtonText: '取消' },
    )
    if (!ok) return
  }
  await run(actionKey(row.id, 'toggle'), async () => {
    await toggleUserStatus(row.id, isDisabling ? 'INACTIVE' : 'ACTIVE')
    ElMessage.success('操作成功')
  })
}

const getDeptName = (deptId?: string) => {
  if (!deptId) return '-'
  const dept = deptOptions.value.find(d => d.id === deptId)
  return dept?.deptName ?? deptId
}
</script>
