<template>
  <el-drawer v-model="visible" :title="source ? '编辑保全项配置' : '新建保全项配置'" size="min(1040px, 96vw)" destroy-on-close>
    <!-- 🔴 标签排布随视口切换，不再无条件 label-position="top"（用户点名：「表单标题全部竖向显示，很丑」）：
         本抽屉宽 1040px、双列栅格下每格约 500px，标签堆在输入框上方会让 20 余个字段纵向拉长一倍，
         且「标签-值」的对应关系要跨行才看得出。宽屏改右侧对齐，窄屏（≤768px）退回上方——
         后者是必须的：单列窄屏下横向标签会把输入框挤到 200px 以内，反而更难用。
         范式抄自 product/pricing-plans:99 与 channel/commission-schemes:72（全站既有的正确写法）。 -->
    <el-form ref="editorFormRef" :model="form" :rules="editorRules" :label-position="isNarrowScreen ? 'top' : 'right'" :label-width="isNarrowScreen ? 'auto' : '110px'" class="editor-form">
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
      <!-- 🔴 10 列原合计 1228px（210/130/160/190/180/70/70/80/80/58），而抽屉 860px 下内容区仅约 812px
           ⇒ 溢出 416px，「校验提示」列整列被切在可视区外，且九列里有四列是纯 checkbox 却各占 70-80px。
           现按「控件真实所需」重排：可输入的列给到能看见内容的宽度，四个勾选框列统一 68px（容 3 字表头），
           合计 986px ≤ 抽屉加宽后（1040px）的内容区 —— 宽屏不横滚；更窄视口由 el-table 自带横滚兜底，
           列宽有 min-width 下限，不会被压到看不见内容。 -->
      <el-table :data="form.definition.fieldRules" border size="small" empty-text="暂无字段规则，点「添加字段」新增">
        <el-table-column label="字段编码" min-width="150"><template #default="{ row }"><el-input v-model="row.fieldCode" /></template></el-table-column>
        <el-table-column label="字段类型" width="120"><template #default="{ row }"><TiDictSelect v-model="row.expectedValueType" dict-type="POLICY_FIELD_VALUE_TYPE" /></template></el-table-column>
        <el-table-column label="格式校验" min-width="128"><template #default="{ row }"><TiDictSelect v-model="row.validationType" dict-type="MAINTENANCE_FIELD_VALIDATION_TYPE" /></template></el-table-column>
        <el-table-column label="规则参数" min-width="140">
          <template #default="{ row }">
            <el-input v-if="row.validationType === 'CUSTOM_REGEX'" v-model="row.validationPattern" placeholder="完整匹配正则表达式" maxlength="256" />
            <span v-else class="muted-text">预置规则</span>
          </template>
        </el-table-column>
        <el-table-column label="校验提示" min-width="140"><template #default="{ row }"><el-input v-model="row.validationMessage" placeholder="可选，自定义错误提示" maxlength="200" /></template></el-table-column>
        <el-table-column label="必填" width="68"><template #default="{ row }"><el-checkbox v-model="row.required" /></template></el-table-column>
        <el-table-column label="可见" width="68"><template #default="{ row }"><el-checkbox v-model="row.visible" /></template></el-table-column>
        <el-table-column label="可编辑" width="68"><template #default="{ row }"><el-checkbox v-model="row.editable" /></template></el-table-column>
        <el-table-column label="可清空" width="68"><template #default="{ row }"><el-checkbox v-model="row.allowClear" /></template></el-table-column>
        <el-table-column width="46"><template #default="{ $index }"><el-button text type="danger" aria-label="删除字段规则" :icon="Delete" @click="form.definition.fieldRules.splice($index, 1)" /></template></el-table-column>
      </el-table>
      <el-button class="add-row" :icon="Plus" @click="addField">添加字段</el-button>

      <el-divider>流程步骤</el-divider>
      <el-table :data="form.definition.steps" border size="small" empty-text="暂无流程步骤，点「添加步骤」新增">
        <el-table-column label="序号" width="90"><template #default="{ row }"><el-input-number v-model="row.sequence" :min="1" :max="100" controls-position="right" /></template></el-table-column>
        <el-table-column label="步骤" min-width="170"><template #default="{ row }"><TiDictSelect v-model="row.stepType" dict-type="MAINTENANCE_STEP_TYPE" /></template></el-table-column>
        <el-table-column label="模式" width="130"><template #default="{ row }"><TiDictSelect v-model="row.mode" dict-type="MAINTENANCE_STEP_MODE" /></template></el-table-column>
        <el-table-column label="条件规则" min-width="150"><template #default="{ row }"><el-input v-model="row.conditionRuleCode" /></template></el-table-column>
        <el-table-column width="58"><template #default="{ $index }"><el-button text type="danger" aria-label="删除流程步骤" :icon="Delete" @click="removeStep($index)" /></template></el-table-column>
      </el-table>
      <el-button class="add-row" :icon="Plus" @click="addStep">添加步骤</el-button>

      <el-divider>费用与权限控制</el-divider>
      <!-- 🔴 实读结论（2026-09-20）：这两项**当前没有任何执行点**，必须如实说明。
           后端对 `accessRule` 的全部生产读取只有 3 类，均非鉴权：
             ① `MaintenanceConfigurationValidator:159/176-177` —— 校验引用的权限码在注册表中存在
                （`PERMISSION_NOT_FOUND: 引用不存在`），以及敏感字段必须声明 sensitive:view；
             ② `MaintenanceItemConfigurationHasher:118` —— 计入配置内容哈希（版本/审计）；
             ③ `MaintenanceConfigurationWebMapper:163/240-241` —— DTO/VO 进出映射。
           案件受理、审核、执行、查询**均不读取** operationPermissionCodes / viewPermissionCodes。
           真正生效的敏感字段查看权限走服务端硬编码判定（`MaintenanceCaseQueryAccessResolver`
           的 `maintenance:sensitive:view` 常量），与这里配的值无关。
           ⇒ 不写这句提示，运营会以为「配了就只有指定角色能操作」，而实际毫无拦截——
             这是合规口径下的静默失效，比缺功能更危险。执行器另行立项，此处只做如实披露。 -->
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="操作权限 / 查看权限当前仅登记，尚未参与鉴权"
        description="这两项会随配置保存并计入版本哈希，后端也只校验「权限码在注册表中存在」；案件受理、审核、执行与查询都不读取它们。请勿据此认为访问已被限制——敏感字段的查看权限由服务端固定判定，与此处配置无关。"
        style="margin-bottom: 12px"
      />
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
import { useMediaQuery } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import type { MaintenanceConfigurationPayload, MaintenanceConfigurationSummary } from '@/api/maintenance'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'
import { MEDIA_MAX_MOBILE } from '@/constants/layout'

const props = defineProps<{ modelValue: boolean; source?: MaintenanceConfigurationSummary; saving?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; save: [value: MaintenanceConfigurationPayload] }>()
const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) })
/** 窄屏（≤768px）时标签退回输入框上方，见模板 el-form 处注释 */
const isNarrowScreen = useMediaQuery(MEDIA_MAX_MOBILE)
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
      // 预置值的出处（勿误认为权威码表）：`LocalMaintenanceConfigurationReferenceAdapter` 是
      // **dev profile 的本地验收白名单**，生产环境由外部权威注册表提供。此处置为默认值只为
      // 让新建配置能过引用校验；实际是否解析得出，取决于部署环境的注册表内容。
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
/* 🔴 `repeat(2, minmax(0, 1fr))` 而非 `1fr 1fr`：grid 子项默认 `min-width: auto`，
   会让「内容最小宽度」成为列宽下限——日期选择器、多选下拉一旦比 1fr 算出的宽度更宽，
   就把所在列顶宽、另一列被挤扁（同族缺陷在保全工作台 .two-column 上是 600/298 的实测量级）。
   minmax(0, …) 把下限归零，两列严格等宽。本仓既有正确写法见 product/actuarial-workbench:454、
   channel/commission-schemes:266 —— 本处与 workbench:714 是仅有的两处异类，一并收敛。 */
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.full-width { width: 100%; }
.add-row { margin-top: 10px; }
.muted-text { color: var(--el-text-color-secondary); font-size: 13px; }
@media (max-width: $breakpoint-mobile) { .form-grid { grid-template-columns: 1fr; } }
</style>
