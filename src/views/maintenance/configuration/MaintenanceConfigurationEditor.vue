<template>
  <el-drawer v-model="visible" :title="source ? '编辑保全项配置' : '新建保全项配置'" size="min(860px, 96vw)" destroy-on-close>
    <el-form ref="editorFormRef" :model="form" :rules="editorRules" label-position="top" class="editor-form">
      <div class="form-grid">
        <el-form-item label="保全项编码" prop="definition.itemCode"><el-input v-model="form.definition.itemCode" :disabled="Boolean(source)" /></el-form-item>
        <el-form-item label="配置版本" prop="definition.version"><el-input v-model="form.definition.version" /></el-form-item>
        <el-form-item label="配置名称" prop="definition.name"><el-input v-model="form.definition.name" /></el-form-item>
        <el-form-item label="业务分类" prop="definition.category">
          <TiDictSelect v-model="form.definition.category" dict-type="MAINTENANCE_ITEM_CATEGORY" class="full-width" />
        </el-form-item>
        <el-form-item label="有效期起始" prop="validFrom"><el-date-picker v-model="form.validFrom" type="datetime" format="YYYY-MM-DD HH:mm:ss" value-format="YYYY-MM-DDTHH:mm:ss" class="full-width" /></el-form-item>
        <el-form-item label="有效期结束"><el-date-picker v-model="form.validTo" type="datetime" format="YYYY-MM-DD HH:mm:ss" value-format="YYYY-MM-DDTHH:mm:ss" class="full-width" /></el-form-item>
      </div>

      <el-divider>渠道与生效</el-divider>
      <div class="form-grid">
        <el-form-item label="支持渠道" prop="definition.channels"><el-checkbox-group v-model="form.definition.channels"><el-checkbox v-for="option in channelOptions" :key="option.value" :value="option.value">{{ option.label }}</el-checkbox></el-checkbox-group></el-form-item>
        <el-form-item label="费用模式" prop="definition.feeMode"><TiDictSelect v-model="form.definition.feeMode" dict-type="MAINTENANCE_FEE_MODE" class="full-width" /></el-form-item>
        <el-form-item label="允许生效方式" prop="definition.effectiveRule.allowedModes"><TiDictSelect v-model="form.definition.effectiveRule.allowedModes" dict-type="MAINTENANCE_EFFECTIVE_TIME_TYPE" multiple class="full-width" /></el-form-item>
        <el-form-item label="默认生效方式" prop="definition.effectiveRule.defaultMode"><el-select v-model="form.definition.effectiveRule.defaultMode" class="full-width"><el-option v-for="option in allowedDefaultModes" :key="option.value" :label="option.label" :value="option.value" /></el-select></el-form-item>
        <el-form-item label="最大追溯天数"><el-input-number v-model="form.definition.effectiveRule.maxRetroactiveDays" :min="0" :max="36500" /></el-form-item>
        <el-form-item label="最大未来天数"><el-input-number v-model="form.definition.effectiveRule.maxFutureDays" :min="0" :max="36500" /></el-form-item>
      </div>

      <el-divider>字段白名单</el-divider>
      <el-table :data="form.definition.fieldRules" border size="small">
        <el-table-column label="字段编码" min-width="210"><template #default="{ row }"><el-input v-model="row.fieldCode" /></template></el-table-column>
        <el-table-column label="字段类型" width="130"><template #default="{ row }"><TiDictSelect v-model="row.expectedValueType" dict-type="POLICY_FIELD_VALUE_TYPE" /></template></el-table-column>
        <el-table-column label="格式校验" min-width="160"><template #default="{ row }"><TiDictSelect v-model="row.validationType" dict-type="MAINTENANCE_FIELD_VALIDATION_TYPE" /></template></el-table-column>
        <el-table-column label="规则参数" min-width="190">
          <template #default="{ row }">
            <el-input v-if="row.validationType === 'CUSTOM_REGEX'" v-model="row.validationPattern" placeholder="完整匹配正则表达式" maxlength="256" />
            <span v-else class="muted-text">预置规则</span>
          </template>
        </el-table-column>
        <el-table-column label="校验提示" min-width="180"><template #default="{ row }"><el-input v-model="row.validationMessage" placeholder="可选，自定义错误提示" maxlength="200" /></template></el-table-column>
        <el-table-column label="必填" width="70"><template #default="{ row }"><el-checkbox v-model="row.required" /></template></el-table-column>
        <el-table-column label="可见" width="70"><template #default="{ row }"><el-checkbox v-model="row.visible" /></template></el-table-column>
        <el-table-column label="可编辑" width="80"><template #default="{ row }"><el-checkbox v-model="row.editable" /></template></el-table-column>
        <el-table-column label="可清空" width="80"><template #default="{ row }"><el-checkbox v-model="row.allowClear" /></template></el-table-column>
        <el-table-column width="58"><template #default="{ $index }"><el-button text type="danger" aria-label="删除字段规则" :icon="Delete" @click="form.definition.fieldRules.splice($index, 1)" /></template></el-table-column>
      </el-table>
      <el-button class="add-row" :icon="Plus" @click="addField">添加字段</el-button>

      <el-divider>流程步骤</el-divider>
      <el-table :data="form.definition.steps" border size="small">
        <el-table-column label="序号" width="90"><template #default="{ row }"><el-input-number v-model="row.sequence" :min="1" :max="100" controls-position="right" /></template></el-table-column>
        <el-table-column label="步骤" min-width="170"><template #default="{ row }"><TiDictSelect v-model="row.stepType" dict-type="MAINTENANCE_STEP_TYPE" /></template></el-table-column>
        <el-table-column label="模式" width="130"><template #default="{ row }"><TiDictSelect v-model="row.mode" dict-type="MAINTENANCE_STEP_MODE" /></template></el-table-column>
        <el-table-column label="条件规则" min-width="150"><template #default="{ row }"><el-input v-model="row.conditionRuleCode" /></template></el-table-column>
        <el-table-column width="58"><template #default="{ $index }"><el-button text type="danger" aria-label="删除流程步骤" :icon="Delete" @click="removeStep($index)" /></template></el-table-column>
      </el-table>
      <el-button class="add-row" :icon="Plus" @click="addStep">添加步骤</el-button>

      <el-divider>费用与权限控制</el-divider>
      <div class="form-grid">
        <el-form-item label="费用公式"><el-input v-model="form.definition.controls.feeRule.formulaCode" :disabled="form.definition.feeMode === 'NONE'" /></el-form-item>
        <el-form-item label="结算门禁规则"><el-input v-model="form.definition.controls.feeRule.settlementGateRuleCode" :disabled="form.definition.feeMode === 'NONE'" /></el-form-item>
        <el-form-item label="保费重算时点"><TiDictSelect v-model="form.definition.controls.feeRule.recalculationTiming" dict-type="MAINTENANCE_RECALCULATION_TIMING" class="full-width" /></el-form-item>
        <el-form-item label="审批策略"><el-input v-model="form.definition.controls.approvalPolicyCode" /></el-form-item>
        <el-form-item label="操作权限"><el-select v-model="form.definition.controls.accessRule.operationPermissionCodes" multiple filterable allow-create class="full-width" /></el-form-item>
        <el-form-item label="查看权限"><el-select v-model="form.definition.controls.accessRule.viewPermissionCodes" multiple filterable allow-create class="full-width" /></el-form-item>
      </div>
      <el-form-item><el-checkbox v-model="form.definition.atomicOnly">该保全项只能单独办理</el-checkbox></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存草稿</el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, ref, toRaw, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import type { MaintenanceConfigurationPayload, MaintenanceConfigurationSummary } from '@/api/maintenance'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'

const props = defineProps<{ modelValue: boolean; source?: MaintenanceConfigurationSummary; saving?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; save: [value: MaintenanceConfigurationPayload] }>()
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) })
const { dictOptions: channelOptions } = useDict('MAINTENANCE_CHANNEL')
const { dictOptions: effectiveTimeOptions } = useDict('MAINTENANCE_EFFECTIVE_TIME_TYPE')
const cloneRaw = <T>(value: T): T => structuredClone(toRaw(value))

const blank = (): MaintenanceConfigurationPayload => ({
  definition: {
    itemCode: '', version: '1.0.0', name: '', category: 'BASIC_INFORMATION', channels: ['MANUAL', 'API'],
    fieldRules: [],
    steps: [
      { sequence: 1, stepType: 'CREATE', mode: 'REQUIRED' },
      { sequence: 2, stepType: 'DATA_ENTRY', mode: 'REQUIRED' },
      { sequence: 3, stepType: 'REVIEW', mode: 'REQUIRED' },
      { sequence: 4, stepType: 'EFFECT', mode: 'REQUIRED' },
      { sequence: 5, stepType: 'COMPLETE', mode: 'REQUIRED' },
    ],
    feeMode: 'NONE',
    effectiveRule: { allowedModes: ['IMMEDIATE'], defaultMode: 'IMMEDIATE', maxRetroactiveDays: 0, maxFutureDays: 0 },
    incompatibleItemCodes: [], atomicOnly: false,
    controls: {
      channelCapabilities: [], materialRequirements: [], crossFieldRuleCodes: [], approvalPolicyCode: '',
      feeRule: { formulaCode: '', settlementGateRuleCode: '', recalculationTiming: 'NOT_APPLICABLE' },
      accessRule: { operationPermissionCodes: ['maintenance:item:operate'], viewPermissionCodes: ['maintenance:item:view'] },
      outputRule: { voucherTemplateCode: '', notificationTemplateCodes: [], archiveTemplateCode: '' },
    },
  },
  validFrom: new Date().toISOString().slice(0, 19),
})
const form = reactive<MaintenanceConfigurationPayload>(blank())
const allowedDefaultModes = computed(() => effectiveTimeOptions.value.filter((option) =>
  form.definition.effectiveRule.allowedModes.includes(option.value)))

/**
 * 抽屉表单的实例与规则。
 * 🔴 原先这个表单**没有 `:model`、没有任何 rules**：9 个 `required` 属性纯属装饰
 * （EP 的 required 只在标签前加星号，不产生校验），`submit` 里那一串 `if` 才是唯一防线，
 * 而 `if` 只弹全局消息条 —— 这个抽屉有 20 多个字段、还有两张可增删的表格，用户无法定位。
 *
 * ⚠️ 三处 `required` 原先**连 submit 的 if 都没覆盖**（业务分类 / 费用模式 / 默认生效方式）：
 * 新建时 `blank()` 给了默认值所以看不出来，但编辑一条存量空值配置就能直接保存落库。
 *
 * `definition.steps` 与「DATA_ENTRY 步骤需至少一个可编辑字段」「CUSTOM_REGEX 需填正则」
 * 这三条仍留在 submit 的 if 里：它们在界面上没有可挂载的 form-item（步骤表是裸表格），
 * 校验结论无法落到某个输入框上。
 */
const editorFormRef = ref<FormInstance>()

const editorRules: FormRules = {
  'definition.itemCode': [{ required: true, whitespace: true, message: '请输入保全项编码', trigger: 'blur' }],
  'definition.version': [{ required: true, whitespace: true, message: '请输入配置版本', trigger: 'blur' }],
  'definition.name': [{ required: true, whitespace: true, message: '请输入配置名称', trigger: 'blur' }],
  'definition.category': [{ required: true, message: '请选择业务分类', trigger: 'change' }],
  validFrom: [{ required: true, message: '请选择有效期起始', trigger: 'change' }],
  'definition.channels': [{ required: true, type: 'array', message: '请至少选择一个支持渠道', trigger: 'change' }],
  'definition.feeMode': [{ required: true, message: '请选择费用模式', trigger: 'change' }],
  'definition.effectiveRule.allowedModes': [
    { required: true, type: 'array', message: '请至少选择一种允许生效方式', trigger: 'change' },
  ],
  'definition.effectiveRule.defaultMode': [
    { required: true, message: '请选择默认生效方式', trigger: 'change' },
    {
      // 跨字段一致性：默认方式必须落在「允许生效方式」里。
      // 判据为新补（原 submit 完全未检查）——用户可先选默认、再取消勾选其所在的允许项，
      // 构造出矛盾配置直接落库。实时联动提示需 TiDictSelect 透传 change，本次只保证提交时必拦。
      validator: (_r, v: string, cb) => (
        !v || form.definition.effectiveRule.allowedModes.includes(v)
          ? cb()
          : cb(new Error('默认生效方式必须包含在「允许生效方式」内'))),
      trigger: 'change',
    },
  ],
}

watch(() => [props.modelValue, props.source] as const, () => {
  if (!props.modelValue) return
  const next = props.source?.definition ? {
    definition: cloneRaw(props.source.definition), validFrom: props.source.validFrom, validTo: props.source.validTo,
  } as MaintenanceConfigurationPayload : blank()
  next.definition.fieldRules = next.definition.fieldRules.map((field) => ({
    ...field,
    validationType: field.validationType || 'NONE',
  }))
  Object.assign(form, next)
}, { immediate: true })

const addField = () => form.definition.fieldRules.push({
  fieldCode: '', required: true, visible: true, editable: true, allowClear: false,
  expectedValueType: 'TEXT', validationType: 'NONE',
})
const addStep = () => form.definition.steps.push({ sequence: form.definition.steps.length + 1, stepType: 'VALIDATION', mode: 'REQUIRED' })
const removeStep = (index: number) => { form.definition.steps.splice(index, 1); form.definition.steps.forEach((step, position) => { step.sequence = position + 1 }) }
const submit = async () => {
  // 字段级校验先行：前者把错误落到具体输入框，后者兜住没有挂载点的跨行规则
  if (!(await editorFormRef.value?.validate().then(() => true).catch(() => false))) return
  if (!form.definition.steps.length) {
    ElMessage.warning('流程步骤不能为空')
    return
  }
  if (form.definition.steps.some((step) => step.stepType === 'DATA_ENTRY')
      && !form.definition.fieldRules.some((field) => field.editable && field.fieldCode.trim())) {
    ElMessage.warning('包含信息录入步骤时至少配置一个可编辑字段')
    return
  }
  const incompleteValidation = form.definition.fieldRules.find((field) =>
    field.validationType === 'CUSTOM_REGEX' && !field.validationPattern?.trim())
  if (incompleteValidation) {
    ElMessage.warning(`字段 ${incompleteValidation.fieldCode || '未命名字段'} 的自定义正则不能为空`)
    return
  }
  form.definition.controls.channelCapabilities = form.definition.channels.map((channel) => ({ channel, autoApprovalAllowed: channel === 'API' }))
  emit('save', cloneRaw(form))
}
</script>

<style scoped lang="scss">
.editor-form { padding-right: 8px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
.full-width { width: 100%; }
.add-row { margin-top: 10px; }
.muted-text { color: var(--el-text-color-secondary); font-size: 13px; }
@media (max-width: $breakpoint-mobile) { .form-grid { grid-template-columns: 1fr; } }
</style>
