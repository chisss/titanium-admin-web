<template>
  <!-- 字典管理页 - 核心功能：字典国际化配置 -->
  <div class="ti-page dict-page">
    <el-row :gutter="16" class="dict-layout">
      <!-- 左侧：字典类型列表 -->
      <el-col :xs="24" :sm="8">
        <div class="ti-card dict-type-panel">
          <div class="dict-type-panel__header">
            <span class="dict-type-panel__title">字典类型</span>
            <el-button type="primary" :icon="Plus" size="small" v-permission="'system:dict:create'" @click="openTypeDialog()">新增</el-button>
          </div>
          <el-input v-model="typeSearch" placeholder="搜索字典类型" :prefix-icon="Search" clearable style="margin-bottom: 12px" />
          <el-scrollbar>
            <div
              v-for="type in filteredTypes"
              :key="type.id"
              class="dict-type-item"
              :class="{
                'dict-type-item--active': selectedType?.id === type.id,
                'dict-type-item--busy': typeRowPending === actionKey(type.id, 'delete'),
              }"
              @click="selectType(type)"
            >
              <div class="dict-type-item__main">
                <span class="dict-type-item__name">{{ type.name }}</span>
                <span class="dict-type-item__code">{{ type.code }}</span>
              </div>
              <div class="dict-type-item__actions">
                <el-button size="small" :icon="Edit" v-permission="'system:dict:edit'" @click.stop="openTypeDialog(type)" />
                <el-button
                  size="small"
                  type="danger"
                  :icon="Delete"
                  v-permission="'system:dict:delete'"
                  :loading="typeRowPending === actionKey(type.id, 'delete')"
                  @click.stop="handleDeleteType(type)"
                />
              </div>
            </div>
          </el-scrollbar>
        </div>
      </el-col>

      <!-- 右侧：选中类型的字典数据 -->
      <el-col :xs="24" :sm="16">
        <div class="ti-card dict-data-panel">
          <div class="dict-data-header">
            <span class="dict-data-title">
              {{ selectedType ? `${selectedType.name}（${selectedType.code}）` : '请选择字典类型' }}
            </span>
            <!-- 🔴 权限判在 v-if 表达式里（本按钮自带 `v-if="selectedType"`），不用 v-permission 指令：
                 指令在 mounted 里直接摘真实 DOM，与同一元素上的动态挂载/卸载叠加会让 vnode 树与
                 实际 DOM 不一致。权限码取自 admin 自身种子：类型与字典项的增删改共用
                 system:dict:create / :edit / :delete 三码（后端没有把「类型」和「字典项」分成两套）。 -->
            <el-button
              v-if="selectedType && hasPermission('system:dict:create')"
              type="primary"
              :icon="Plus"
              size="small"
              @click="openDataDialog()"
            >
              新增字典项
            </el-button>
          </div>

          <!-- 右栏字典项表格：嵌在 .dict-data-panel 这张卡片里，须用 --flush 免得卡中卡。
               高度令牌用 split 档——本页是「左类型列表 / 右明细」双栏骨架，
               页面自身高度被定死（见 <style> 的 .dict-page），与整页流式布局的可用高无换算关系 -->
          <TiTable
            v-if="selectedType"
            class="ti-table--flush"
            :data="dictDataList"
            :loading="dataLoading"
            :max-height="'var(--ti-table-max-height-split)'"
          >
            <el-table-column prop="value" label="字典值" width="160" />
            <el-table-column prop="label" label="默认标签" width="140" />
            <el-table-column label="多语言" min-width="200">
              <template #default="{ row }">
                <div v-if="row.i18nLabels" class="i18n-labels">
                  <el-tag
                    v-for="(label, lang) in row.i18nLabels"
                    :key="lang"
                    size="small"
                    type="info"
                    style="margin: 2px"
                  >
                    {{ lang }}: {{ label }}
                  </el-tag>
                </div>
                <span v-else class="no-i18n">-</span>
              </template>
            </el-table-column>
            <el-table-column prop="sort" label="排序" width="70" />
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <TiStatusTag :value="row.status" />
              </template>
            </el-table-column>
            <!-- @vue-generic {DictData} -->
            <el-table-column label="操作" min-width="160" fixed="right" class-name="ti-action-column">
              <template #default="{ row }">
                <el-button size="small" :icon="Edit" v-permission="'system:dict:edit'" @click="openDataDialog(row)">编辑</el-button>
                <el-button
                  size="small"
                  type="danger"
                  :icon="Delete"
                  v-permission="'system:dict:delete'"
                  :loading="dataRowPending === actionKey(row.id, 'delete')"
                  @click="handleDeleteData(row)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </TiTable>
          <el-empty v-else description="请从左侧选择字典类型" :image-size="80" style="margin-top: 60px" />
        </div>
      </el-col>
    </el-row>

    <!-- 字典类型对话框 -->
    <el-dialog v-model="typeDialogVisible" :title="editTypeId ? '编辑字典类型' : '新增字典类型'" width="440px">
      <el-form ref="typeFormRef" :model="typeForm" :rules="typeRules" label-width="100px">
        <el-form-item label="类型编码" prop="code">
          <el-input v-model="typeForm.code" :disabled="!!editTypeId" placeholder="如：POLICY_STATUS" />
        </el-form-item>
        <el-form-item label="类型名称" prop="name">
          <el-input v-model="typeForm.name" placeholder="如：保单状态" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="typeForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="typeForm.statusActive" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="typeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveType">确认</el-button>
      </template>
    </el-dialog>

    <!-- 字典数据对话框 - 含多语言配置 -->
    <el-dialog
      v-model="dataDialogVisible"
      :title="editDataId ? '编辑字典项' : '新增字典项'"
      width="560px"
    >
      <el-form ref="dataFormRef" :model="dataForm" :rules="dataRules" label-width="120px">
        <el-form-item label="字典值" prop="value">
          <el-input v-model="dataForm.value" placeholder="如：ACTIVE" />
        </el-form-item>
        <el-form-item label="默认标签" prop="label">
          <el-input v-model="dataForm.label" placeholder="默认显示标签" />
        </el-form-item>

        <!-- 多语言配置区 -->
        <el-form-item label="多语言配置">
          <div class="i18n-editor">
            <div
              v-for="(item, index) in i18nEntries"
              :key="index"
              class="i18n-editor__row"
            >
              <TiDictSelect v-model="item.lang" dict-type="SUPPORTED_LOCALE" placeholder="语言" style="width: 140px" />
              <el-input v-model="item.label" :placeholder="`${item.lang} 标签`" style="flex: 1" />
              <el-button text type="danger" :icon="Delete" @click="removeI18nEntry(index)" />
            </div>
            <el-button text :icon="Plus" @click="addI18nEntry" style="margin-top: 4px">
              添加语言
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="排序">
          <el-input-number v-model="dataForm.sort" :min="0" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="dataForm.remark" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="dataForm.statusActive" active-text="启用" inactive-text="禁用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dataDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveData">确认保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRowAction, confirmAction, actionKey } from '@/composables/useRowAction'
import { Plus, Edit, Delete, Search } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import {
  getDictTypeList,
  createDictType, updateDictType, deleteDictType,
  getDictDataByType, createDictData, updateDictData, deleteDictData,
} from '@/api/dict'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiTable from '@/components/TiTable/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDictStore } from '@/stores/dict'
import { usePermission } from '@/composables/usePermission'
import type { DictType, DictData } from '@/types/business.d'

/** 字典类型/字典项的新增按钮权限判定（判在 v-if 表达式里，见模板注释） */
const { hasPermission } = usePermission()

// 字典类型列表
const typeList = ref<DictType[]>([])
const dictStore = useDictStore()
const typeSearch = ref('')
const selectedType = ref<DictType | null>(null)
const filteredTypes = computed(() =>
  typeList.value.filter((t) =>
    !typeSearch.value || t.name.includes(typeSearch.value) || t.code.includes(typeSearch.value),
  ),
)

const loadTypes = async () => {
  // 🔴 原写法 `getDictTypeList({ pageNum: 1, pageSize: 200 })` 单次只拉 200 条：
  //    字典类型超过 200 个时，第 201 条起**既不在左栏列表里、也搜不到**——因为搜索框走的是
  //    前端过滤（filteredTypes 过滤 typeList），而且**没有任何提示**，属静默截断。
  //    本列表的设计意图是全量（el-scrollbar 滚动浏览 + 前端搜索），故改为按页取完，
  //    不改变交互形态（加分页器会让「搜索」只搜到已加载的那一页，语义反而更差）。
  const PAGE_SIZE = 200
  const MAX_PAGES = 50 // 兜底 10000 条：真实字典类型远达不到，触顶只可能是后端分页异常（防死循环）
  const all: DictType[] = []
  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const page = await getDictTypeList({ pageNum, pageSize: PAGE_SIZE })
    all.push(...page.list)
    // 🔴 到底的判据用「本页未取满」，**不用 total**：代理层在下游只返回裸数组且本页已满时
    //    会如实返回 total=null（总数未知，见 types/api.d 的 PageResult 注释），拿 null 比大小必错。
    if (page.list.length < PAGE_SIZE) break
  }
  typeList.value = all
}

// 字典数据
const dictDataList = ref<DictData[]>([])
const dataLoading = ref(false)

const selectType = async (type: DictType) => {
  selectedType.value = type
  dataLoading.value = true
  try {
    dictDataList.value = await getDictDataByType(type.code, true)
  } finally {
    dataLoading.value = false
  }
}

onMounted(loadTypes)

/** 重新拉取当前选中类型的字典项：右栏表格的刷新口径（删项后按类型重查，重查期间由 dataLoading 给出反馈） */
const reloadDictData = async () => {
  const current = selectedType.value
  if (current) await selectType(current)
}

/**
 * 左栏（字典类型）与右栏（字典项）**各持一个** useRowAction，而不是共用一个：
 * 两块面板同时可见、行主键都叫 id、刷新口径也各自不同（重拉类型列表 / 重查当前类型的字典项），
 * 合用一个 ref 会让「这次转圈属于哪块面板」无从分辨，也分不清该刷新谁。
 * 行内删除的 pending 与错误兜底统一由 useRowAction 承担。
 */
const { rowPending: typeRowPending, run: runTypeAction } = useRowAction(loadTypes)
const { rowPending: dataRowPending, run: runDataAction } = useRowAction(reloadDictData)

// 字典类型对话框
const typeDialogVisible = ref(false)
const editTypeId = ref<string | null>(null)
const saving = ref(false)
const typeFormRef = ref<FormInstance>()
const typeForm = reactive({ code: '', name: '', description: '', statusActive: true })

const typeRules: FormRules = {
  code: [{ required: true, message: '请输入类型编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入类型名称', trigger: 'blur' }],
}

const openTypeDialog = (row?: DictType) => {
  editTypeId.value = row?.id ?? null
  Object.assign(typeForm, row ? {
    code: row.code,
    name: row.name,
    description: row.description || '',
    statusActive: row.status === 'ACTIVE',
  } : { code: '', name: '', description: '', statusActive: true })
  typeDialogVisible.value = true
}

const handleSaveType = async () => {
  const valid = await typeFormRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    const payload: Partial<DictType> = {
      code: typeForm.code,
      name: typeForm.name,
      description: typeForm.description || undefined,
      status: typeForm.statusActive ? 'ACTIVE' : 'INACTIVE',
    }
    if (editTypeId.value) { await updateDictType(editTypeId.value, payload) } else { await createDictType(payload) }
    ElMessage.success('保存成功')
    typeDialogVisible.value = false
    loadTypes()
  } finally {
    saving.value = false
  }
}

/**
 * 删除字典类型（连同其下的字典项）。
 *
 * <p>需要 pending 的理由：级联删除不可逆，删完还要重拉整个类型列表，
 * 请求在途时若左栏毫无变化，用户会以为没点中而重复点击。</p>
 */
const handleDeleteType = async (row: DictType) => {
  const ok = await confirmAction(
    `确认删除字典类型"${row.name}"？关联字典数据将一并删除。`,
    '警告',
    { type: 'warning', confirmButtonClass: 'el-button--danger' },
  )
  if (!ok) return
  // 类型项上并排「编辑」「删除」两个动作按钮，pending 键带上动作名以区分
  await runTypeAction(actionKey(row.id, 'delete'), async () => {
    await deleteDictType(row.id)
    dictStore.clearCache(row.code)
    ElMessage.success('删除成功')
    // 删掉的正是当前选中项时必须清空选中，否则右栏会继续展示已不存在的类型的字典项
    if (selectedType.value?.id === row.id) selectedType.value = null
  })
}

// 字典数据对话框（含 i18n）
const dataDialogVisible = ref(false)
const editDataId = ref<string | null>(null)
const dataFormRef = ref<FormInstance>()

// i18n 条目（动态行）
interface I18nEntry { lang: string; label: string }
const i18nEntries = ref<I18nEntry[]>([
  { lang: 'zh-CN', label: '' },
  { lang: 'en-US', label: '' },
])

const dataForm = reactive({
  value: '',
  label: '',
  sort: 0,
  remark: '',
  statusActive: true,
})

const dataRules: FormRules = {
  value: [{ required: true, message: '请输入字典值', trigger: 'blur' }],
  label: [{ required: true, message: '请输入默认标签', trigger: 'blur' }],
}

const addI18nEntry = () => {
  i18nEntries.value.push({ lang: '', label: '' })
}

const removeI18nEntry = (index: number) => {
  i18nEntries.value.splice(index, 1)
}

const openDataDialog = (row?: DictData) => {
  editDataId.value = row?.id ?? null
  if (row) {
    Object.assign(dataForm, {
      value: row.value,
      label: row.label,
      sort: row.sort,
      remark: row.remark,
      statusActive: row.status === 'ACTIVE',
    })
    // 填充 i18n 条目
    if (row.i18nLabels && Object.keys(row.i18nLabels).length > 0) {
      i18nEntries.value = Object.entries(row.i18nLabels).map(([lang, label]) => ({ lang, label }))
    } else {
      i18nEntries.value = [{ lang: 'zh-CN', label: '' }, { lang: 'en-US', label: '' }]
    }
  } else {
    Object.assign(dataForm, { value: '', label: '', sort: 0, remark: '', statusActive: true })
    i18nEntries.value = [{ lang: 'zh-CN', label: '' }, { lang: 'en-US', label: '' }]
  }
  dataDialogVisible.value = true
}

const handleSaveData = async () => {
  const valid = await dataFormRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!selectedType.value) return

  // 构建 i18nLabels map
  const i18nLabels: Record<string, string> = {}
  i18nEntries.value.forEach(({ lang, label }) => {
    if (lang && label) i18nLabels[lang] = label
  })

  const payload: Partial<DictData> = {
    dictTypeId: selectedType.value.id,
    dictTypeCode: selectedType.value.code,
    value: dataForm.value,
    label: dataForm.label,
    i18nLabels,
    sort: dataForm.sort,
    status: dataForm.statusActive ? 'ACTIVE' : 'INACTIVE',
    remark: dataForm.remark || undefined,
  }

  saving.value = true
  try {
    if (editDataId.value) {
      await updateDictData(editDataId.value, payload)
    } else {
      await createDictData(payload)
    }
    dictStore.clearCache(selectedType.value.code)
    ElMessage.success('保存成功')
    dataDialogVisible.value = false
    selectType(selectedType.value)
  } finally {
    saving.value = false
  }
}

/**
 * 删除字典项。
 *
 * <p>需要 pending 的理由：确认框一关、请求在途的这段时间里右栏表格还没有任何变化
 * （表格自身的 loading 要等删除成功后重查才亮），按钮不转圈就等于这段时间零反馈。</p>
 */
const handleDeleteData = async (row: DictData) => {
  const ok = await confirmAction(`确认删除字典项"${row.label}"？`, '警告', {
    type: 'warning',
    confirmButtonClass: 'el-button--danger',
  })
  if (!ok) return
  // 本行并排「编辑」「删除」两个动作按钮，pending 键带上动作名以区分
  await runDataAction(actionKey(row.id, 'delete'), async () => {
    await deleteDictData(row.id)
    if (selectedType.value) dictStore.clearCache(selectedType.value.code)
    ElMessage.success('删除成功')
  })
}
</script>

<style scoped lang="scss">
.dict-page {
  height: calc(100vh - 120px);

  .dict-layout, .el-col {
    height: 100%;
  }
}

.dict-type-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  &__title {
    font-size: $font-size-lg;
    font-weight: 600;
  }
}

.dict-type-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: $radius-md;
  cursor: pointer;
  margin-bottom: 2px;
  transition: background 0.15s;

  &:hover {
    background: #f4f6f8;
  }

  &--active {
    background: #e8f0fb;

    .dict-type-item__name {
      color: $primary-color;
      font-weight: 600;
    }
  }

  &__main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__name {
    font-size: 13px;
    color: $text-primary;
  }

  &__code {
    font-size: 11px;
    color: $text-secondary;
    font-family: monospace;
  }

  &__actions {
    display: none;
  }

  &:hover &__actions {
    display: flex;
  }

  // 🔴 删除在途时强制显示操作区。操作区平时只在 :hover 下可见，而确认框关闭后
  //    指针往往已离开该项 —— 删除请求在途的那几秒，转圈恰好被 display:none 一起藏起来，
  //    用户看到的仍是「点了没有任何反应」。这条规则让在途的那一行始终露出操作区。
  &--busy &__actions {
    display: flex;
  }
}

.dict-data-panel {
  height: 100%;
}

.dict-data-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.dict-data-title {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
}

.i18n-labels {
  display: flex;
  flex-wrap: wrap;
}

.no-i18n {
  color: $text-disabled;
}

.i18n-editor {
  width: 100%;

  &__row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
}

@media (max-width: $breakpoint-mobile) {
  .dict-page {
    height: auto;
    min-height: calc(100vh - 96px);

    .dict-layout {
      height: auto;
      row-gap: 12px;
    }

    .el-col {
      height: auto;
    }
  }

  .dict-type-panel {
    height: 300px;
    padding: 12px;
  }

  .dict-type-item {
    gap: 8px;

    &__name,
    &__code {
      overflow-wrap: anywhere;
    }

    &__actions {
      display: flex;
      flex: none;
    }
  }

  .dict-data-panel {
    min-height: 420px;
  }

  .dict-data-header {
    align-items: flex-start;
    gap: 8px;
  }

  .dict-data-title {
    overflow-wrap: anywhere;
  }
}
</style>
