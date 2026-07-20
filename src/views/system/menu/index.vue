<template>
  <!-- 菜单管理页 -->
  <div class="ti-page">
    <div class="ti-toolbar" style="margin-bottom: 12px">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'system:menu:create'" @click="openDialog()">
          新增菜单
        </el-button>
      </div>
    </div>

    <!-- 树形菜单表格 -->
    <div class="ti-table-wrap">
      <el-table
        v-loading="loading"
        :data="menuTree"
        row-key="id"
        :tree-props="{ children: 'children' }"
        default-expand-all
        border
      >
        <el-table-column prop="title" label="菜单名称" min-width="180">
          <template #default="{ row }">
            <el-icon v-if="row.icon" style="margin-right: 6px; vertical-align: middle">
              <component :is="row.icon" />
            </el-icon>
            {{ row.title }}
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="row.type === 'DIRECTORY' ? 'info' : row.type === 'MENU' ? 'primary' : 'warning'" size="small">
              {{ row.type === 'DIRECTORY' ? '目录' : row.type === 'MENU' ? '菜单' : '按钮' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="路由路径" width="180" />
        <el-table-column prop="permission" label="权限标识" width="200" />
        <el-table-column prop="sort" label="排序" width="70" />
        <el-table-column prop="hidden" label="隐藏" width="70">
          <template #default="{ row }">
            <el-icon :color="row.hidden ? '#f56c6c' : '#67c23a'">
              <component :is="row.hidden ? 'Hide' : 'View'" />
            </el-icon>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" :icon="Edit" v-permission="'system:menu:edit'" @click="openDialog(row)">编辑</el-button>
            <el-button text size="small" type="danger" v-permission="'system:menu:delete'" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑菜单' : '新增菜单'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="上级菜单">
          <el-tree-select
            v-model="form.parentId"
            :data="menuTree"
            :props="{ label: 'title', value: 'id', children: 'children' }"
            clearable
            placeholder="选择上级菜单（不选则为顶级）"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="菜单类型" prop="type">
          <el-radio-group v-model="form.type">
            <el-radio value="DIRECTORY">目录</el-radio>
            <el-radio value="MENU">菜单</el-radio>
            <el-radio value="BUTTON">按钮</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="菜单标题" prop="title">
          <el-input v-model="form.title" placeholder="展示名称" />
        </el-form-item>
        <el-form-item label="i18n Key" prop="name">
          <el-input v-model="form.name" placeholder="如：policyList" />
        </el-form-item>
        <el-form-item v-if="form.type !== 'BUTTON'" label="路由路径">
          <el-input v-model="form.path" placeholder="如：/policy/list" />
        </el-form-item>
        <el-form-item v-if="form.type !== 'BUTTON'" label="图标">
          <el-input v-model="form.icon" placeholder="Element Plus 图标名称" />
        </el-form-item>
        <el-form-item label="权限标识">
          <el-input v-model="form.permission" placeholder="如：policy:list" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" />
        </el-form-item>
        <el-form-item v-if="form.type !== 'BUTTON'" label="是否隐藏">
          <el-switch v-model="form.hidden" />
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
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { getMenuTree, createMenu, updateMenu, deleteMenu } from '@/api/menu'
import type { MenuNode } from '@/types/menu.d'

const loading = ref(false)
const menuTree = ref<MenuNode[]>([])

const loadMenu = async () => {
  loading.value = true
  try {
    menuTree.value = await getMenuTree()
  } finally {
    loading.value = false
  }
}

onMounted(loadMenu)

const dialogVisible = ref(false)
const editId = ref<string | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  parentId: undefined as string | undefined,
  type: 'MENU' as 'DIRECTORY' | 'MENU' | 'BUTTON',
  title: '',
  name: '',
  path: '',
  icon: '',
  permission: '',
  sort: 0,
  hidden: false,
})

const rules: FormRules = {
  type: [{ required: true, message: '请选择菜单类型', trigger: 'change' }],
  title: [{ required: true, message: '请输入菜单标题', trigger: 'blur' }],
  name: [{ required: true, message: '请输入 i18n Key', trigger: 'blur' }],
}

const openDialog = (row?: MenuNode) => {
  editId.value = row?.id ?? null
  Object.assign(form, row ?? { parentId: undefined, type: 'MENU', title: '', name: '', path: '', icon: '', permission: '', sort: 0, hidden: false })
  dialogVisible.value = true
}

const handleSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (editId.value) { await updateMenu(editId.value, form) } else { await createMenu(form) }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    loadMenu()
  } finally {
    saving.value = false
  }
}

const handleDelete = async (row: MenuNode) => {
  await ElMessageBox.confirm(`确认删除菜单"${row.title}"？如有子菜单将一并删除。`, '警告', { type: 'warning' })
  await deleteMenu(row.id)
  ElMessage.success('删除成功')
  loadMenu()
}
</script>
