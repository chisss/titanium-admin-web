<template>
  <!-- 角色权限管理页 -->
  <div class="ti-page">
    <div class="ti-toolbar" style="margin-bottom: 12px">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'system:role:create'" @click="openDialog()">
          新增角色
        </el-button>
      </div>
    </div>

    <TiTable :data="tableData" :total="pagination.total" :loading="tableLoading" @page-change="onPageChange" @size-change="onSizeChange">
      <el-table-column prop="code" label="角色编码" width="160" class-name="ti-code-column">
        <template #default="{ row }">
          <TiCopyText :text="row.code" />
        </template>
      </el-table-column>
      <el-table-column prop="name" label="角色名称" min-width="160" />
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" />
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="160" />
      <!-- @vue-generic {RoleVO} -->
      <el-table-column label="操作" min-width="160" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" v-permission="'system:role:edit'" @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="warning" v-permission="'system:role:assign'" @click="openPermDialog(row)">分配权限</el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 新增/编辑角色对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑角色' : '新增角色'" width="440px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="角色编码" prop="code">
          <el-input v-model="form.code" :disabled="!!editId" />
        </el-form-item>
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">确认</el-button>
      </template>
    </el-dialog>

    <!-- 分配权限对话框 -->
    <el-dialog v-model="permDialogVisible" title="分配权限" width="500px">
      <el-tree
        ref="permTreeRef"
        :data="permTree"
        show-checkbox
        node-key="id"
        :default-checked-keys="currentPerms"
        :props="{ label: 'label', children: 'children' }"
      />
      <template #footer>
        <el-button @click="permDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleAssignPerms">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Edit } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { getRoleList, createRole, updateRole, assignPermissions } from '@/api/role'
import type { RoleVO } from '@/api/role'
import { getPermissionTree, type PermissionTreeNode } from '@/api/permission'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'

const { tableData, tableLoading, pagination, fetchData, onPageChange, onSizeChange } =
  useTable<RoleVO, Record<string, unknown>>((params) => getRoleList(params))

fetchData()

const dialogVisible = ref(false)
const editId = ref<string | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ code: '', name: '', description: '' })

const rules: FormRules = {
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
}

const openDialog = (row?: RoleVO) => {
  editId.value = row?.id ?? null
  Object.assign(form, row ?? { code: '', name: '', description: '' })
  dialogVisible.value = true
}

const handleSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (editId.value) { await updateRole(editId.value, form) } else { await createRole(form) }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    fetchData()
  } finally {
    saving.value = false
  }
}

// 权限分配
const permDialogVisible = ref(false)
const permTreeRef = ref()
const currentRoleId = ref<string | null>(null)
const currentPerms = ref<string[]>([])
const permTree = ref<PermissionTreeNode[]>([])

/** 打开权限分配对话框,加载真实权限树 */
const openPermDialog = async (row: RoleVO) => {
  currentRoleId.value = row.id
  currentPerms.value = row.permissions || []
  permDialogVisible.value = true
  // 首次打开或树为空时加载权限树
  if (!permTree.value.length) {
    permTree.value = await getPermissionTree()
  }
}

const handleAssignPerms = async () => {
  if (!currentRoleId.value) return
  const checked = permTreeRef.value?.getCheckedKeys() as string[]
  saving.value = true
  try {
    await assignPermissions(currentRoleId.value, checked)
    ElMessage.success('权限分配成功')
    permDialogVisible.value = false
    fetchData()
  } finally {
    saving.value = false
  }
}
</script>
