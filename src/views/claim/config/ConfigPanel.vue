<template>
  <!-- 理赔配置通用面板：表格 + 新建弹窗 + 删除 + 状态动作（元数据驱动） -->
  <div class="config-panel">
    <!-- 工具栏 -->
    <div class="panel-toolbar">
      <span class="panel-count">共 <b>{{ list.length }}</b> 条配置</span>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建{{ title }}</el-button>
    </div>

    <!-- 表格 -->
    <TiTable :data="list" :total="list.length" :page-size="9999" :loading="loading" :row-key="idKey">
      <el-table-column
        v-for="col in columns"
        :key="col.prop"
        :prop="col.prop"
        :label="col.label"
        :min-width="col.minWidth"
        :width="col.width"
        show-overflow-tooltip
      >
        <template #default="{ row }">
          <template v-if="col.formatter">{{ col.formatter(row[col.prop], row) }}</template>
          <template v-else>{{ row[col.prop] ?? '-' }}</template>
        </template>
      </el-table-column>
      <el-table-column label="操作" :min-width="operationWidth" fixed="right">
        <template #default="{ row }">
          <template v-for="action in visibleActions(row)" :key="action.key">
            <el-button size="small" :type="action.type" @click="runExtraAction(action, row)">
              {{ action.label }}
            </el-button>
          </template>
          <el-button size="small" type="danger" plain @click="confirmDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 新建/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="`新建${title}`" width="640px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item v-for="field in fields" :key="field.key" :label="field.label" :prop="field.key">
          <!-- 文本输入 -->
          <el-input
            v-if="field.type === 'input'"
            v-model="form[field.key]"
            :placeholder="field.placeholder ?? `请输入${field.label}`"
            clearable
            style="width: 100%"
          />
          <!-- 数字输入 -->
          <el-input-number
            v-else-if="field.type === 'number'"
            v-model="form[field.key]"
            :min="field.min ?? 0"
            :max="field.max"
            :precision="field.precision ?? 2"
            :placeholder="field.placeholder"
            style="width: 180px"
          />
          <!-- 下拉选择（支持手动输入自定义值） -->
          <el-select
            v-else-if="field.type === 'select'"
            v-model="form[field.key]"
            :placeholder="field.placeholder ?? `请选择${field.label}`"
            filterable
            allow-create
            default-first-option
            style="width: 100%"
          >
            <el-option v-for="opt in field.options" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
          <!-- 开关 -->
          <el-switch
            v-else-if="field.type === 'switch'"
            v-model="form[field.key]"
            :active-text="field.activeText ?? '启用'"
            :inactive-text="field.inactiveText ?? '停用'"
          />
          <!-- 标签列表（逗号分隔输入 → 数组提交） -->
          <el-input
            v-else-if="field.type === 'tags'"
            v-model="tagsDraft[field.key]"
            :placeholder="field.placeholder ?? '多个值用英文逗号分隔'"
            clearable
            style="width: 100%"
          />
          <!-- 多行文本 -->
          <el-input
            v-else-if="field.type === 'textarea'"
            v-model="form[field.key]"
            type="textarea"
            :rows="2"
            :placeholder="field.placeholder"
          />
          <!-- 日期时间 -->
          <el-date-picker
            v-else-if="field.type === 'datetime'"
            v-model="form[field.key]"
            type="datetime"
            placeholder="留空则立即生效"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import TiTable from '@/components/TiTable/index.vue'

/** 表单项类型 */
type FieldType = 'input' | 'number' | 'select' | 'switch' | 'tags' | 'textarea' | 'datetime'

/** 表单字段元数据 */
export interface FieldDef {
  key: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  /** select 选项（allow-create 允许输入自定义值） */
  options?: Array<{ value: string; label: string }>
  /** number 边界 */
  min?: number
  max?: number
  precision?: number
  /** switch 文案 */
  activeText?: string
  inactiveText?: string
}

/** 表格列元数据 */
export interface ColumnDef {
  prop: string
  label: string
  width?: string
  minWidth?: string
  /** 自定义渲染（value 为该列原始值，row 为整行） */
  formatter?: (value: unknown, row: Record<string, unknown>) => string
}

/** 行级状态动作 */
export interface ExtraAction {
  key: string
  label: string
  type: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  /** 返回 null 表示该行不显示此动作 */
  visible?: (row: Record<string, unknown>) => boolean
  /** 执行动作（id 为该行主键值） */
  run: (id: string, row: Record<string, unknown>) => Promise<void>
  /** 确认文案 */
  confirmText?: string
}

const props = defineProps<{
  /** 面板标题（用于按钮/弹窗文案） */
  title: string
  /** 表单字段定义 */
  fields: FieldDef[]
  /** 表格列定义 */
  columns: ColumnDef[]
  /** 列表加载 */
  listFn: () => Promise<Record<string, unknown>[]>
  /** 保存（新增），返回新 ID */
  saveFn: (data: Record<string, unknown>) => Promise<string>
  /** 删除 */
  deleteFn: (id: string) => Promise<void>
  /** 行主键字段名（删除/状态动作传参） */
  idKey: string
  /** 行级状态动作（如医院暂停/恢复、黑名单撤销） */
  extraActions?: ExtraAction[]
}>()

const list = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()
/** 表单模型：字段由元数据动态渲染，值类型按字段类型动态变化，故放宽为 any（对外提交仍为 Record<string, unknown>） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const form = reactive<Record<string, any>>({})
/** tags 类型字段的草稿文本（逗号分隔） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tagsDraft = reactive<Record<string, any>>({})

const operationWidth = computed(() => {
  const extraCount = (props.extraActions ?? []).length
  return `${Math.max(140, 90 + extraCount * 90)}px`
})

const rules = computed<FormRules>(() => {
  const result: FormRules = {}
  for (const field of props.fields) {
    if (field.required) {
      if (field.type === 'tags') {
        // tags 字段输入绑定 tagsDraft（逗号分隔草稿），必填校验须校验草稿而非 form 模型
        result[field.key] = [{
          validator: (_rule, _value, callback) => {
            const draft = tagsDraft[field.key]?.trim()
            draft ? callback() : callback(new Error(`请输入${field.label}`))
          },
          trigger: 'change',
        }]
      } else {
        result[field.key] = [{ required: true, message: `请${field.type === 'select' ? '选择' : '输入'}${field.label}`, trigger: field.type === 'select' ? 'change' : 'blur' }]
      }
    }
  }
  return result
})

const visibleActions = (row: Record<string, unknown>) =>
  (props.extraActions ?? []).filter((action) => !action.visible || action.visible(row))

/** 加载列表 */
const loadList = async () => {
  loading.value = true
  try {
    list.value = await props.listFn()
  } finally {
    loading.value = false
  }
}

loadList()

/** 打开新建弹窗并重置表单 */
const openCreate = () => {
  for (const key of Object.keys(form)) delete form[key]
  for (const key of Object.keys(tagsDraft)) delete tagsDraft[key]
  for (const field of props.fields) {
    if (field.type === 'switch') form[field.key] = true
    else if (field.type === 'number') form[field.key] = undefined
    else form[field.key] = ''
  }
  dialogVisible.value = true
}

/** 组装提交数据：tags 字段按逗号拆分；空值剔除 */
const buildPayload = (): Record<string, unknown> => {
  const payload: Record<string, unknown> = { ...form }
  for (const field of props.fields) {
    if (field.type === 'tags') {
      const draft = tagsDraft[field.key]?.trim()
      payload[field.key] = draft ? draft.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) : []
    }
    // 空串/undefined 不入参（后端按空=不限处理）
    if (payload[field.key] === '' || payload[field.key] === undefined) {
      delete payload[field.key]
    }
  }
  return payload
}

/** 保存 */
const submit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await props.saveFn(buildPayload())
    ElMessage.success(`${props.title}保存成功`)
    dialogVisible.value = false
    await loadList()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

/** 删除（中文确认框） */
const confirmDelete = async (row: Record<string, unknown>) => {
  const id = String(row[props.idKey])
  await ElMessageBox.confirm(`确认删除「${row[props.idKey]}」？删除后不可恢复。`, '删除确认', {
    type: 'warning',
    confirmButtonText: '确认删除',
    cancelButtonText: '取消',
  }).catch(() => null)
  try {
    await props.deleteFn(id)
    ElMessage.success('删除成功')
    await loadList()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  }
}

/** 行级状态动作 */
const runExtraAction = async (action: ExtraAction, row: Record<string, unknown>) => {
  const id = String(row[props.idKey])
  if (action.confirmText) {
    const confirmed = await ElMessageBox.confirm(action.confirmText, '操作确认', {
      type: 'warning',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    }).catch(() => null)
    if (!confirmed) return
  }
  try {
    await action.run(id, row)
    ElMessage.success(`${action.label}成功`)
    await loadList()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : `${action.label}失败`)
  }
}
</script>

<style scoped lang="scss">
.panel-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;

  .panel-count {
    font-size: 13px;
    color: #606266;
  }
}
</style>
