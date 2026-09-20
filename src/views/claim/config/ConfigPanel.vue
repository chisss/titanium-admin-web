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
      <el-table-column label="操作" fixed="right" min-width="200" class-name="ti-action-column">
        <template #default="{ row }">
          <template v-for="action in visibleActions(row)" :key="action.key">
            <el-button size="small" :type="action.type" @click="runExtraAction(action, row)">
              {{ action.label }}
            </el-button>
          </template>
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" plain @click="confirmDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </TiTable>

    <!-- 新建/编辑弹窗（🔴 D-501-53：编辑入口与新建入口分离，新增不再隐式覆盖既有配置） -->
    <el-dialog v-model="dialogVisible" :title="`${editingId ? '编辑' : '新建'}${title}`" width="640px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
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
          <!--
            下拉选择（受控词表）：选项一律来自字段声明的 options，禁用 allow-create。
            开启 allow-create 时，本分支服务的全部下拉（险种线 / 案件类型 / 案件环节 /
            医院等级 / 协议状态 / 标的类型等）都能被手打文本覆盖，选项列表形同虚设，
            写进配置的值也再无值域约束。故去除创建能力，只保留选项内筛选（filterable）。
            注：全部 select 字段的 options 均为静态常量，删除后不存在「无选项可选」的字段。
          -->
          <el-select
            v-else-if="field.type === 'select'"
            v-model="form[field.key]"
            :placeholder="field.placeholder ?? `请选择${field.label}`"
            filterable
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
          <!--
            受控多选（保序）：选项一律来自字段声明的 options，禁用 allow-create。
            用于「环节序列」这类值域固定**且顺序即业务含义**的字段——顺序决定理赔流程走向，
            故必须保序，不能用手打 code 的 tags（那样操作员要背 REPORT/SURVEY/... 六个编码）。
          -->
          <el-select
            v-else-if="field.type === 'multi-select'"
            v-model="form[field.key]"
            multiple
            filterable
            :placeholder="field.placeholder ?? `请选择${field.label}（顺序即流程顺序）`"
            style="width: 100%"
          >
            <el-option v-for="opt in field.options ?? []" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
          <!-- 字典下拉（受控）：取值来自后端业务字典，与后端枚举逐字节对齐 -->
          <TiDictSelect
            v-else-if="field.type === 'dict'"
            v-model="form[field.key]"
            :dict-type="field.dictType ?? ''"
            :placeholder="field.placeholder ?? `请选择${field.label}`"
            style="width: 100%"
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
import { showErrorIfUnhandled } from '@/api/http'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import TiTable from '@/components/TiTable/index.vue'

/** 表单项类型 */
type FieldType = 'input' | 'number' | 'select' | 'multi-select' | 'dict' | 'switch' | 'tags' | 'textarea' | 'datetime'

/** 表单字段元数据 */
export interface FieldDef {
  key: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  /** select / multi-select 的受控选项（值域由声明方给定，控件不允许现场造值） */
  options?: Array<{ value: string; label: string }>
  /** dict 类型字段的字典类型码（取值来自后端业务字典，与后端枚举对齐） */
  dictType?: string
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
  /**
   * 该动作是否**破坏性**：执行后既有数据/权益状态不可恢复（暂停、终止、撤销）。
   * <p>
   * 不能从 `type` 推断——`type` 表达的是按钮观感（如「撤销黑名单」是解禁，观感用 success），
   * 而破坏性表达的是误点的代价。两者不是一回事，故独立声明。
   * </p>
   */
  destructive?: boolean
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
  /** 业务键字段（新建时校验占用；命中即拒绝，避免静默覆盖既有配置） */
  businessKeyFields?: string[]
  /** 行级状态动作（如医院暂停/恢复、黑名单撤销） */
  extraActions?: ExtraAction[]
}>()

const list = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()
/** 编辑中的行主键；为空表示当前是「新建」（新增与编辑走同一表单，但语义与校验不同） */
const editingId = ref<string | null>(null)
/** 表单模型：字段由元数据动态渲染，值类型按字段类型动态变化，故放宽为 any（对外提交仍为 Record<string, unknown>） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const form = reactive<Record<string, any>>({})
/** tags 类型字段的草稿文本（逗号分隔） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tagsDraft = reactive<Record<string, any>>({})

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
        // multi-select 与 select 同属「选择」语义：文案与触发时机都按选择处理
        const byChoice = field.type === 'select' || field.type === 'multi-select' || field.type === 'dict'
        result[field.key] = [{ required: true, message: `请${byChoice ? '选择' : '输入'}${field.label}`, trigger: byChoice ? 'change' : 'blur' }]
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
  editingId.value = null
  for (const key of Object.keys(form)) delete form[key]
  for (const key of Object.keys(tagsDraft)) delete tagsDraft[key]
  for (const field of props.fields) {
    if (field.type === 'switch') form[field.key] = true
    else if (field.type === 'number') form[field.key] = undefined
    else if (field.type === 'multi-select') form[field.key] = []
    else form[field.key] = ''
  }
  dialogVisible.value = true
}

/**
 * 打开编辑弹窗并回填该行（🔴 D-501-53）
 * <p>
 * 与「新建」分离：编辑携带行主键，后端按 ID 走全量更新分支；新建不带主键，
 * 若业务键已被占用则由后端显式拒绝（不再是静默覆盖）。
 * </p>
 */
const openEdit = (row: Record<string, unknown>) => {
  openCreate()
  editingId.value = String(row[props.idKey])
  for (const field of props.fields) {
    const value = row[field.key]
    if (field.type === 'tags') {
      tagsDraft[field.key] = Array.isArray(value) ? value.join(',') : ''
    } else if (field.type === 'switch') {
      form[field.key] = value ?? true
    } else if (field.type === 'number') {
      form[field.key] = typeof value === 'number' ? value : undefined
    } else if (field.type === 'multi-select') {
      // 后端存数组；非数组（含 null/undefined）一律回落空数组，避免 v-model 拿到 undefined
      form[field.key] = Array.isArray(value) ? value : []
    } else {
      form[field.key] = value ?? ''
    }
  }
}

/**
 * 业务键占用校验（新建路径）：命中既有行即拒绝并指向编辑入口。
 * <p>
 * 后端已有同判据的硬约束，此处前置只为把「新建失败」变成「当场说清原因」——
 * 否则用户看到的是保存报错，仍需自行猜测是哪个业务键撞了。
 * </p>
 */
const findBusinessKeyConflict = (): Record<string, unknown> | undefined => {
  const keys = props.businessKeyFields
  if (!keys?.length) return undefined
  return list.value.find((row) => keys.every((key) => String(row[key] ?? '') === String(form[key] ?? '')))
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

/** 保存（新建或编辑） */
const submit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!editingId.value) {
    const conflict = findBusinessKeyConflict()
    if (conflict) {
      ElMessage.warning(`该业务键已被配置「${conflict[props.idKey]}」占用，请改用「编辑」修改既有配置`)
      return
    }
  }
  saving.value = true
  try {
    const payload = buildPayload()
    if (editingId.value) payload[props.idKey] = editingId.value
    await props.saveFn(payload)
    ElMessage.success(`${props.title}${editingId.value ? '更新' : '保存'}成功`)
    dialogVisible.value = false
    await loadList()
  } catch (e: unknown) {
    showErrorIfUnhandled(e, '保存失败')
  } finally {
    saving.value = false
  }
}

/** 删除（中文确认框） */
const confirmDelete = async (row: Record<string, unknown>) => {
  const id = String(row[props.idKey])
  // 🔴 D-501-54：`.catch(() => null)` 会把「取消」的 reject 吞成 null，必须显式守卫，
  // 否则点「取消」后仍无条件执行删除（不可恢复）。此处与下方 runExtraAction 对齐。
  const confirmed = await ElMessageBox.confirm(`确认删除「${row[props.idKey]}」？删除后不可恢复。`, '删除确认', {
    type: 'warning',
    confirmButtonText: '确认删除',
    cancelButtonText: '取消',
    confirmButtonClass: 'el-button--danger',
  }).catch(() => null)
  if (!confirmed) return
  try {
    await props.deleteFn(id)
    ElMessage.success('删除成功')
    await loadList()
  } catch (e: unknown) {
    showErrorIfUnhandled(e, '删除失败')
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
      // 🔴 破坏性动作（暂停/终止协议、撤销黑名单）的确认按钮必须标红。
      // 不用「凡有 confirmText 就标红」的默认：那样将来给「恢复」加上一句确认文案，
      // 恢复按钮也会变红——把红色用在非危险动作上，等于训练用户忽略红色。
      confirmButtonClass: action.destructive ? 'el-button--danger' : '',
    }).catch(() => null)
    if (!confirmed) return
  }
  try {
    await action.run(id, row)
    ElMessage.success(`${action.label}成功`)
    await loadList()
  } catch (e: unknown) {
    showErrorIfUnhandled(e, `${action.label}失败`)
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
    color: $text-regular;
  }
}
</style>
