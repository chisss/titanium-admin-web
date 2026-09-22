<template>
  <!-- 菜单管理页 -->
  <div class="ti-page">
    <!-- 搜索区：菜单树按名称过滤。后端 /web/v1/menus/tree 不接收参数，且树已整棵在前端，故本地过滤不重新请求 -->
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="菜单名称">
        <el-input v-model="queryParams.name" clearable placeholder="模糊搜索" style="width: 180px" @keyup.enter="handleSearch" />
      </el-form-item>
    </TiSearchForm>

    <div class="ti-toolbar" style="margin-bottom: 12px">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'system:menu:create'" @click="openDialog()">
          新增菜单
        </el-button>
      </div>
    </div>

    <!-- 树形菜单表格：el-table 的树表能力（row-key / tree-props / default-expand-all）
         经 TiTable 的 $attrs 透传落到内层 el-table，无需 TiTable 为此开专用 prop -->
    <TiTable
      :data="visibleTree"
      :loading="loading"
      :max-height="'var(--ti-table-max-height-lean)'"
      row-key="id"
      :tree-props="{ children: 'children' }"
      default-expand-all
      :error="tableError"
      @refresh="loadMenu"
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
          <!-- 用语义色「文字变体」而非本体：本格**整格只有图标、无文字兜底**，图标即内容，
               按 WCAG 1.4.11 非文本对比须 ≥3:1，而本体色实测 danger 2.90 / success 2.24 均不达标 -->
          <el-icon :color="row.hidden ? 'var(--ti-danger-text)' : 'var(--ti-success-text)'">
            <component :is="row.hidden ? 'Hide' : 'View'" />
          </el-icon>
        </template>
      </el-table-column>
      <!-- @vue-generic {MenuNode} -->
      <el-table-column label="操作" width="200" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" v-permission="'system:menu:edit'" @click="openDialog(row)">编辑</el-button>
          <el-button
            size="small"
            type="danger"
            v-permission="'system:menu:delete'"
            :loading="rowPending === actionKey(row.id, 'delete')"
            @click="handleDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑菜单' : '新增菜单'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="上级菜单">
          <el-tree-select
            v-model="form.parentId"
            :data="menuTree"
            node-key="id"
            :props="{ label: 'title', children: 'children' }"
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
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useRowAction, confirmAction, actionKey } from '@/composables/useRowAction'
import { useTableError } from '@/composables/useTable'
import { Plus, Edit } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { getMenuTree, createMenu, updateMenu, deleteMenu } from '@/api/menu'
import type { MenuNode } from '@/types/menu.d'
import { filterTree } from '@/utils/filterTree'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiTable from '@/components/TiTable/index.vue'

const loading = ref(false)
// 失败态：接口挂了不得渲染成「暂无数据」（🔴 R7-13）
const { tableError, clearTableError, setTableError } = useTableError()
const menuTree = ref<MenuNode[]>([])
const queryParams = reactive({ name: '' })

/**
 * 已生效的检索关键字，与输入框分开。
 *
 * <p>🔴 不做「边打字边过滤」：那样列表会随每次击键变化，「搜索」按钮便成了摆设 ——
 * 用户按不按都一样，一旦某天过滤逻辑出错，也没有一个明确的动作可以复现。
 * 故输入归输入，按下搜索（或回车）才把关键字交给列表。</p>
 */
const appliedKeyword = ref('')

/**
 * 表格实际渲染的树。
 *
 * <p>「未检索时直接用原树」这条短路必须由调用方给出：`filterTree` 的 `match` 是不透明谓词，
 * 它无从判断关键字是不是空的（见其文档注释）。</p>
 */
const visibleTree = computed(() =>
  appliedKeyword.value
    ? filterTree(menuTree.value, (node) => node.title.includes(appliedKeyword.value))
    : menuTree.value,
)

const handleSearch = () => {
  appliedKeyword.value = queryParams.name.trim()
}

/** 重置：整棵树本来就在手上，清掉关键字即可，无需重新请求 */
const handleReset = () => {
  appliedKeyword.value = ''
}

const loadMenu = async () => {
  loading.value = true
  try {
    menuTree.value = await getMenuTree()
    clearTableError()
  } catch (err) {
    // 失败与「确实没有菜单」必须可区分：清空数据并置错误，界面才会说「加载失败」
    menuTree.value = []
    setTableError(err)
  } finally {
    loading.value = false
  }
}

onMounted(loadMenu)

/** 菜单树行内动作（删除）的 pending 与错误兜底统一由 useRowAction 承担 */
const { rowPending, run } = useRowAction(loadMenu)

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

/**
 * 删除菜单节点（连同其子菜单）。
 *
 * <p>需要 pending 的理由：这是树上唯一会改变结构、且删完要重拉整棵树的动作，
 * 断链的子菜单是一并消失的，代价不可逆。请求在途时若界面毫无变化，
 * 用户会以为没点中而重复点击——菜单删除没有「撤销」可挽回。</p>
 */
const handleDelete = async (row: MenuNode) => {
  const ok = await confirmAction(
    `确认删除菜单"${row.title}"？如有子菜单将一并删除。`,
    '警告',
    { type: 'warning', confirmButtonClass: 'el-button--danger' },
  )
  if (!ok) return
  // 本行并排「编辑」「删除」两个动作按钮，pending 键带上动作名，与同行其它动作区分开
  await run(actionKey(row.id, 'delete'), async () => {
    await deleteMenu(row.id)
    ElMessage.success('删除成功')
  })
}
</script>
