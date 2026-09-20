<template>
  <!-- 角色权限管理页 -->
  <div class="ti-page">
    <!-- 搜索区：后端 /web/v1/roles 不接收过滤参数，按名称/编码在前端过滤（口径见脚本 fetchFn 注释） -->
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="角色名称">
        <el-input v-model="queryParams.name" clearable placeholder="模糊搜索" style="width: 180px" />
      </el-form-item>
      <el-form-item label="角色编码">
        <el-input v-model="queryParams.code" clearable placeholder="模糊搜索" style="width: 180px" />
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar" style="margin-bottom: 12px">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'system:role:create'" @click="openDialog()">
          新增角色
        </el-button>
      </div>
    </div>

    <!-- 🔴 :page-num / :page-size 必须传：TiTable 内部的 el-pagination 用
         `computed({ get: () => props.pageNum, set: v => emit('update:pageNum', v) })` 驱动 current-page，
         两个 prop 不传就恒为默认值 1/20 ⇒ 点第 2 页数据真的翻了（@page-change 照常触发并重新取数），
         但分页器高亮弹回第 1 页——用户看到「第 1 页的字样 + 第 2 页的数据」。 -->
    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      :max-height="'var(--ti-table-max-height-default)'"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
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
      <!-- @vue-generic {RoleVO} -->
      <el-table-column label="操作" min-width="160" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" v-permission="'system:role:edit'" @click="openDialog(row)">编辑</el-button>
          <!-- 「分配权限」是进入配置界面的中性入口，与「编辑」同类，故不着色。
               此前用 type="warning" 是**在中性动作上套警示色**——与 ConfigPanel 的
               destructive 判据同源：红色/警示色用在非危险动作上，等于训练用户忽略它。 -->
          <el-button size="small" v-permission="'system:role:assign'" @click="openPermDialog(row)">分配权限</el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 新增/编辑角色对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑角色' : '新增角色'" width="440px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
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
import { getRoleList, createRole, updateRole, assignPermissions, getRolePermissions } from '@/api/role'
import type { RoleVO } from '@/api/role'
import { getPermissionTree, type PermissionTreeNode } from '@/api/permission'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'

const queryParams = reactive({ name: '', code: '' })

/**
 * 角色列表 + 前端过滤。
 *
 * <p>🔴 过滤必须在前端做：后端 `RoleController.list()` 不接收任何过滤入参，
 * `getRoleList(params)` 把 params 当查询串发出去也只会被忽略。若照搬其它页写成
 * `useTable((params) => getRoleList(params), queryParams)`，接口会正常返回**完整列表**，
 * 界面在「搜索」后纹丝不动 —— 用户看到的是一个点了没反应、却毫无报错的搜索按钮。</p>
 *
 * <p>🔴 本页的切片必须自己算，且必须返回 PageResult 信封（见下方 return）。</p>
 */
const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<RoleVO, typeof queryParams>(async (params) => {
    // params 的键在重置后可能被整体删除（useTable.handleReset 会 delete 掉全部键再赋默认值），
    // 故按 undefined 兜底，不能直接 .trim()
    const name = (params.name ?? '').trim()
    const code = (params.code ?? '').trim()
    const all = await getRoleList()
    const filtered = !name && !code
      ? all
      : all.filter((role) => (!name || role.name.includes(name)) && (!code || role.code.includes(code)))
    // 🔴 必须返回 `{ list, total }` 信封，而不是裸数组：
    //    后端 RoleController.list() 不认 page/pageSize，一次返回**全量裸数组**；而 useTable 对裸数组
    //    只做「tableData = 整个数组，total = 数组长度」，TiTable 自身**也不切片**（它是服务端分页组件，
    //    认定 :data 就是当前页）。两者叠加 ⇒ 角色一旦超过 20 条，表格会**一次平铺全部 N 行**，
    //    分页器同时显示「共 N 条 / 共 2 页」；点第 2 页只是把高亮移到 2 再取回同一份全量，
    //    第 1、2 页内容逐行相同 —— 用户点了一次真正起作用的按钮，看到的却是原地不动的表格。
    //    total 取**过滤后**的条数（分页器据此算页数），list 只放当前页那一段。
    const start = (params.pageNum - 1) * params.pageSize
    return {
      list: filtered.slice(start, start + params.pageSize),
      total: filtered.length,
      pageNum: params.pageNum,
      pageSize: params.pageSize,
    }
  }, queryParams)

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
  // 列表 VO 不含权限，须单独拉取已授权限用于回显（否则恒为空 ⇒ 保存即清权）
  currentPerms.value = await getRolePermissions(row.id)
  permDialogVisible.value = true
  // 首次打开或树为空时加载权限树
  if (!permTree.value.length) {
    permTree.value = await getPermissionTree()
  }
}

const handleAssignPerms = async () => {
  if (!currentRoleId.value) return
  // 只取叶子节点：父级（目录/菜单）为聚合节点，提交后后端会因无对应权限点而落空
  const checked = permTreeRef.value?.getCheckedKeys(true) as string[]
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
