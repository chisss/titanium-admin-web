<template>
  <!-- 保单详情页 - 含5个 Tab + 寿险生命周期操作按钮 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <TiDetailHeader :title="`保单详情 - ${policy?.policyNo ?? ''}`">
        <!-- 🔴 状态徽章须传 label：TiStatusTag 只有颜色映射、没有域内文案（D-501-42，此前裸显 TERMINATED） -->
        <template #meta>
          <TiStatusTag v-if="policy" :value="policy.status" :label="policyStatusLabel(policy.status)" />
        </template>
        <template #actions v-if="policy">
          <!-- 状态相关操作按钮 -->
          <!-- 🔴 :loading 不可删：下拉里 cancel/waive/dividend/annuityStart/annuityPay/mature
               六类操作**不经过对话框**，直接由 ElMessageBox 确认后调 doAction。doAction 虽会置
               submitting=true，但其原先唯一的绑定处是 4 个 dialog footer 按钮——对话框此时并未
               打开，于是这六类操作**全程无任何可见反馈**（接口慢时界面像卡死）。
               绑到下拉触发按钮后，操作期间按钮转圈，且顺带防止重复点击。 -->
          <el-dropdown trigger="click" @command="handleAction">
            <el-button type="primary" :loading="submitting">
              操作 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="suspend" class="ti-dropdown-item--danger" v-if="policy.status === 'ACTIVE' || policy.status === 'EFFECTIVE'">
                  <el-icon><VideoPause /></el-icon> 中止保单
                </el-dropdown-item>
                <el-dropdown-item command="resume" v-if="policy.status === 'SUSPENDED'">
                  <el-icon><VideoPlay /></el-icon> 恢复保单
                </el-dropdown-item>
                <el-dropdown-item command="terminate" divided class="ti-dropdown-item--danger">
                  <el-icon><CircleClose /></el-icon> 退保/终止
                </el-dropdown-item>
                <el-dropdown-item command="cancel" class="ti-dropdown-item--danger" v-if="canCancel">
                  <el-icon><Delete /></el-icon> 撤销保单
                </el-dropdown-item>
                <el-dropdown-item command="waive" divided>
                  <el-icon><Discount /></el-icon> 保费豁免
                </el-dropdown-item>
                <el-dropdown-item command="dividend">
                  <el-icon><Money /></el-icon> 红利派发
                </el-dropdown-item>
                <el-dropdown-item command="annuityStart">
                  <el-icon><Coin /></el-icon> 启动年金给付
                </el-dropdown-item>
                <el-dropdown-item command="annuityPay">
                  <el-icon><Wallet /></el-icon> 执行年金给付
                </el-dropdown-item>
                <el-dropdown-item command="mature" divided>
                  <el-icon><Flag /></el-icon> 满期给付
                </el-dropdown-item>
                <el-dropdown-item command="endorsement">
                  <el-icon><Edit /></el-icon> 申请批改
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </TiDetailHeader>

      <el-tabs v-if="policy" v-model="activeTab" class="policy-tabs">
        <!-- Tab1：基本信息 -->
        <el-tab-pane label="基本信息" name="basic">
          <el-descriptions :column="detailColumns" border>
            <el-descriptions-item label="保单号">
              <span>{{ policy.policyNo }}</span>
              <el-button text size="small" :icon="CopyDocument" @click="copyText(policy.policyNo)" />
            </el-descriptions-item>
            <el-descriptions-item label="保单形态">{{ policy.policyForm || '-' }}</el-descriptions-item>
            <el-descriptions-item label="产品名称">{{ policy.productName }}</el-descriptions-item>
            <el-descriptions-item label="投保人">{{ policy.policyHolderName }}</el-descriptions-item>
            <el-descriptions-item label="被保人">{{ policy.insuredName }}</el-descriptions-item>
            <el-descriptions-item label="年缴保费">{{ formatAmount(policy.premium) }}</el-descriptions-item>
            <el-descriptions-item label="基本保额">{{ formatAmount(policy.sumInsured) }}</el-descriptions-item>
            <el-descriptions-item label="生效日期">{{ formatDate(policy.effectiveDate) }}</el-descriptions-item>
            <el-descriptions-item label="到期日期">{{ formatDate(policy.expiryDate) }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDateTime(policy.createTime) }}</el-descriptions-item>
          </el-descriptions>

          <section v-if="subjects.length" class="subject-section">
            <div class="subject-section__header">
              <h4>被保标的</h4>
              <span>{{ subjects.length }} 项</span>
            </div>
            <div class="subject-list">
              <article v-for="subject in subjects" :key="subject.subjectId || subject.subjectName" class="subject-item">
                <div class="subject-item__title">
                  <strong>{{ subject.subjectName || subjectTypeLabel(subject.subjectType) }}</strong>
                  <TiStatusTag v-if="subject.riskLevel" :value="subject.riskLevel" />
                </div>
                <el-descriptions :column="detailColumns" border size="small">
                  <el-descriptions-item label="标的类型">{{ subjectTypeLabel(subject.subjectType) }}</el-descriptions-item>
                  <el-descriptions-item label="标的保额">{{ formatAmount(subject.subjectSumInsured) }}</el-descriptions-item>
                  <el-descriptions-item v-for="field in subjectFields(subject)" :key="field.key" :label="field.label">
                    {{ field.value }}
                  </el-descriptions-item>
                </el-descriptions>
              </article>
            </div>
          </section>
          <el-empty v-else-if="!loading" description="暂无被保标的信息" :image-size="64" />
        </el-tab-pane>

        <!-- Tab2：理赔记录 -->
        <el-tab-pane label="理赔记录" name="claims">
          <el-empty description="暂无理赔记录" :image-size="80" />
        </el-tab-pane>

        <!-- Tab3：缴费记录 -->
        <el-tab-pane label="缴费记录" name="payments">
          <el-empty description="暂无缴费记录" :image-size="80" />
        </el-tab-pane>

        <!-- Tab4：保全记录 -->
        <el-tab-pane label="保全记录" name="maintenance">
          <el-table v-loading="maintenanceLoading" :data="maintenanceRecords" border stripe>
            <el-table-column label="保全项" min-width="190"><template #default="{ row }">{{ row.itemCodes?.join('、') || '-' }}</template></el-table-column>
            <el-table-column prop="source" label="来源" width="110"><template #default="{ row }">{{ row.source === 'MANUAL' ? '后台人工' : 'API 自动' }}</template></el-table-column>
            <el-table-column prop="status" label="案件状态" width="120"><template #default="{ row }"><TiStatusTag :value="row.status" :label="maintenanceStatusLabel(row.status)" /></template></el-table-column>
            <el-table-column prop="effectStatus" label="生效状态" width="120"><template #default="{ row }"><TiStatusTag :value="row.effectStatus || 'NOT_STARTED'" :label="effectStatusLabel(row.effectStatus || 'NOT_STARTED')" /></template></el-table-column>
            <!-- 时间列统一走全局日期工具，避免直出后端 ISO 串（2026-09-18 全站实测） -->
            <el-table-column prop="createdAt" label="创建时间" width="175">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="查看" width="100"><template #default="{ row }"><el-button link type="primary" @click="$router.push(`/maintenance/workbench/${row.caseId}`)">工作台</el-button></template></el-table-column>
            <template #empty><el-empty description="暂无保全记录" :image-size="80" /></template>
          </el-table>
        </el-tab-pane>

        <!-- Tab5：操作日志 -->
        <el-tab-pane label="操作日志" name="logs">
          <el-empty description="暂无操作日志" :image-size="80" />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 中止保单对话框 -->
    <el-dialog v-model="dialogs.suspend" title="中止保单" width="400px">
      <el-form ref="suspendFormRef" :model="forms.suspend" :rules="suspendRules" label-width="100px">
        <el-form-item label="中止原因" prop="reason">
          <el-input v-model="forms.suspend.reason" type="textarea" :rows="3" placeholder="请输入中止原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogs.suspend = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitSuspend">确认中止</el-button>
      </template>
    </el-dialog>

    <!-- 恢复保单对话框 -->
    <el-dialog v-model="dialogs.resume" title="恢复保单" width="400px">
      <el-form ref="resumeFormRef" :model="forms.resume" :rules="resumeRules" label-width="100px">
        <el-form-item label="恢复原因" prop="reason">
          <el-input v-model="forms.resume.reason" type="textarea" :rows="3" placeholder="请输入恢复原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogs.resume = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitResume">确认恢复</el-button>
      </template>
    </el-dialog>

    <!-- 退保/终止对话框 -->
    <el-dialog v-model="dialogs.terminate" title="退保/终止保单" width="440px">
      <el-alert type="warning" :closable="false" class="ti-dialog-alert">
        <p>退保后将扣除手续费，按现金价值退还保费，操作不可撤销。</p>
      </el-alert>
      <el-form ref="terminateFormRef" :model="forms.terminate" :rules="terminateRules" label-width="120px">
        <el-form-item label="终止原因" prop="terminationReason">
          <TiDictSelect v-model="forms.terminate.terminationReason" dict-type="POLICY_TERMINATION_REASON" :clearable="false" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注说明">
          <el-input v-model="forms.terminate.reason" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogs.terminate = false">取消</el-button>
        <el-button type="danger" :loading="submitting" @click="submitTerminate">确认终止</el-button>
      </template>
    </el-dialog>

    <!-- 申请批改对话框 -->
    <el-dialog v-model="dialogs.endorsement" title="申请批改" width="480px">
      <el-form ref="endorsementFormRef" :model="forms.endorsement" :rules="endorsementRules" label-width="120px">
        <el-form-item label="批单号" prop="endorsementNo">
          <el-input v-model="forms.endorsement.endorsementNo" placeholder="请输入批单号" />
        </el-form-item>
        <el-form-item label="批改类型" prop="updateType">
          <TiDictSelect v-model="forms.endorsement.updateType" dict-type="MAINTENANCE_TYPE" :clearable="false" style="width: 100%" />
        </el-form-item>
        <el-form-item label="变更说明" prop="changeSummary">
          <el-input v-model="forms.endorsement.changeSummary" type="textarea" :rows="3" placeholder="请描述具体变更内容" />
        </el-form-item>
        <el-form-item label="生效日期">
          <el-date-picker v-model="forms.endorsement.endorsementEffectiveDate" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="默认今日" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogs.endorsement = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitEndorsement">提交批改申请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import {
  ArrowDown, VideoPause, VideoPlay, CircleClose,
  Delete, Discount, Money, Coin, Wallet, Flag, Edit, CopyDocument,
} from '@element-plus/icons-vue'
import {
  getPolicyDetail, getPolicySubjects, suspendPolicy, resumePolicy, terminatePolicy,
  cancelPolicy, waivePremium, distributeDividend, startAnnuityPayout,
  payAnnuityBenefit, maturePolicy, applyEndorsement,
  type PolicyDataUpdateType, type TerminationReason,
} from '@/api/policy'
import TiDetailHeader from '@/components/TiDetailHeader/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import type { PolicyVO } from '@/types/business.d'
import type { PolicySubjectVO } from '@/api/policy'
import { getMaintenanceCaseList, type MaintenanceCaseSummary } from '@/api/maintenance'
import { useDict } from '@/composables/useDict'
import { useDetailColumns } from '@/composables/useDetailColumns'
import { formatDate, formatDateTime } from '@/utils/date'
import { formatAmount } from '@/utils/format'

/** 状态文案取自后端字典（域内语义最准，D-501-42） */
const { getLabel: policyStatusLabel } = useDict('POLICY_STATUS')
const { getLabel: maintenanceStatusLabel } = useDict('MAINTENANCE_CASE_STATUS')
const { getLabel: effectStatusLabel } = useDict('MAINTENANCE_EFFECT_STATUS')

/** 保单信息各面板：字段短，宽屏 3 档 */
const detailColumns = useDetailColumns(3)

const route = useRoute()
const loading = ref(false)
const submitting = ref(false)
const policy = ref<PolicyVO | null>(null)
const subjects = ref<PolicySubjectVO[]>([])
const activeTab = ref('basic')
const maintenanceLoading = ref(false)
const maintenanceRecords = ref<MaintenanceCaseSummary[]>([])

/** 对话框开关 */
const dialogs = reactive({
  suspend: false,
  resume: false,
  terminate: false,
  endorsement: false,
})

/** 表单数据 */
const forms = reactive({
  suspend: { reason: '' },
  resume: { reason: '' },
  terminate: { reason: '', terminationReason: '' as TerminationReason | '' },
  endorsement: {
    endorsementNo: '', updateType: '' as PolicyDataUpdateType | '', endorsementEffectiveDate: '', changeSummary: '',
  },
})

/**
 * 四个操作弹窗的表单实例与校验规则。
 * 🔴 原先这四个表单**只有 `required` 属性、没有 rules**：required 在 Element Plus 里
 * 只是标签前的星号装饰，不产生任何校验（RulesProp 为空即不校验）。
 * 各 submit 里确有 `if (!x) { ElMessage.warning() }` —— 判断是对的，但反馈只落在全局
 * 消息条上：用户看不到**哪个**输入框有问题，弹窗里 4 个字段时尤其难定位。
 * 现在规则与这些 if 一一对应（判据不变，只是把结论落到字段上），if 保留为兜底。
 */
const suspendFormRef = ref<FormInstance>()
const resumeFormRef = ref<FormInstance>()
const terminateFormRef = ref<FormInstance>()
const endorsementFormRef = ref<FormInstance>()

/** 合同不可逆：reason 的必填判据来自既有 required 与 submitSuspend 的 if
 *  `whitespace: true` 不可省：async-validator 默认只判「非空字符串」，
 *  一串空格能通过 required —— 而原 if 用的是 `.trim()`，判据更严。 */
const suspendRules: FormRules = {
  reason: [{ required: true, whitespace: true, message: '请填写中止原因', trigger: 'blur' }],
}
const resumeRules: FormRules = {
  reason: [{ required: true, whitespace: true, message: '请填写恢复原因', trigger: 'blur' }],
}
const terminateRules: FormRules = {
  terminationReason: [{ required: true, message: '请选择终止原因', trigger: 'change' }],
}
const endorsementRules: FormRules = {
  endorsementNo: [{ required: true, whitespace: true, message: '请输入批单号', trigger: 'blur' }],
  updateType: [{ required: true, message: '请选择批改类型', trigger: 'change' }],
  changeSummary: [{ required: true, whitespace: true, message: '请描述具体变更内容', trigger: 'blur' }],
}

/** 是否可撤销（投保后15天内或待生效状态） */
const canCancel = computed(() =>
  policy.value?.status === 'PENDING' || policy.value?.status === 'PENDING_EFFECTIVE',
)

/** 处理操作菜单命令 */
const handleAction = async (cmd: string) => {
  switch (cmd) {
    case 'suspend': dialogs.suspend = true; break
    case 'resume': dialogs.resume = true; break
    case 'terminate': dialogs.terminate = true; break
    case 'cancel':
      await ElMessageBox.confirm('确认撤销该保单？此操作不可撤销。', '警告', { type: 'warning', confirmButtonClass: 'el-button--danger' })
      await doAction(() => cancelPolicy(policy.value!.policyId, '管理员操作撤销'))
      break
    case 'waive':
      await ElMessageBox.confirm('确认对该保单执行保费豁免？', '确认', { type: 'info' })
      await doAction(() => waivePremium(policy.value!.policyId, { reason: 'INSURED_CRITICAL_ILLNESS' }))
      break
    case 'dividend':
      await ElMessageBox.prompt('请输入本年度红利金额（元）', '红利派发', { inputType: 'number' }).then(({ value }) =>
        doAction(() => distributeDividend(policy.value!.policyId, {
          policyYear: new Date().getFullYear(),
          dividendAmount: Number(value),
          option: 'ACCUMULATE',
        })),
      )
      break
    case 'annuityStart':
      await ElMessageBox.prompt('请输入每期年金给付金额（元）', '启动年金给付', { inputType: 'number' }).then(({ value }) =>
        doAction(() => startAnnuityPayout(policy.value!.policyId, {
          startDate: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
          frequency: 'ANNUALLY', amountPerInstallment: Number(value), currency: 'CNY',
        })),
      )
      break
    case 'annuityPay':
      await ElMessageBox.confirm('确认执行本期年金给付？', '确认', { type: 'info' })
      await doAction(() => payAnnuityBenefit(policy.value!.policyId))
      break
    case 'mature':
      await ElMessageBox.prompt('请输入满期给付金额（元）', '满期给付', { inputType: 'number' }).then(({ value }) =>
        doAction(() => maturePolicy(policy.value!.policyId, { maturityBenefit: Number(value) })),
      )
      break
    case 'endorsement': dialogs.endorsement = true; break
  }
}

/** 通用操作执行（带loading + reload） */
const doAction = async (fn: () => Promise<void>) => {
  submitting.value = true
  try {
    await fn()
    ElMessage.success('操作成功')
    await loadPolicy()
  } finally {
    submitting.value = false
  }
}

/** 提交中止 */
const submitSuspend = async () => {
  if (!(await suspendFormRef.value?.validate().then(() => true).catch(() => false))) return
  await doAction(() => suspendPolicy(policy.value!.policyId, forms.suspend.reason))
  dialogs.suspend = false
  forms.suspend.reason = ''
}

/** 提交恢复 */
const submitResume = async () => {
  if (!(await resumeFormRef.value?.validate().then(() => true).catch(() => false))) return
  await doAction(() => resumePolicy(policy.value!.policyId, forms.resume.reason))
  dialogs.resume = false
}

/** 提交终止 */
const submitTerminate = async () => {
  if (!(await terminateFormRef.value?.validate().then(() => true).catch(() => false))) return
  await doAction(() => terminatePolicy(policy.value!.policyId, {
    reason: forms.terminate.reason,
    terminationReason: forms.terminate.terminationReason as TerminationReason,
  }))
  dialogs.terminate = false
}

/** 提交批改 */
const submitEndorsement = async () => {
  if (!(await endorsementFormRef.value?.validate().then(() => true).catch(() => false))) return
  submitting.value = true
  try {
    const result = await applyEndorsement(policy.value!.policyId, {
      endorsementNo: forms.endorsement.endorsementNo,
      updateType: forms.endorsement.updateType as PolicyDataUpdateType,
      endorsementEffectiveDate: forms.endorsement.endorsementEffectiveDate || undefined,
      changeSummary: forms.endorsement.changeSummary,
    })
    ElMessage.success(`批改申请已提交，批改单号：${result}`)
    dialogs.endorsement = false
  } finally {
    submitting.value = false
  }
}

/** 复制文本 */
const copyText = (text: string) => {
  navigator.clipboard.writeText(text).then(() => ElMessage.success('已复制'))
}

const subjectTypeLabel = (type?: string) => ({
  VEHICLE: '车辆', PROPERTY: '财产', ORGANIZATION: '组织', PERSON: '人员',
  HOUSEHOLD: '家庭财产', CARGO: '货物', VESSEL: '船舶', AIRCRAFT: '航空器',
}[type || ''] || type || '标的')

const subjectFieldLabels: Record<string, string> = {
  licensePlate: '车牌号', vin: 'VIN', firstRegistrationDate: '初次登记日期',
  usageType: '用途类型', ncd: 'NCD 系数', model: '厂牌型号',
  address: '地址', propertyAddress: '财产地址', buildingStructure: '建筑结构',
  fireProtectionGrade: '消防等级', fireProtectionLevel: '消防等级', occupancyType: '占用性质',
  propertyUsage: '财产用途', propertyValue: '财产价值', industry: '行业', employeeCount: '员工数',
  payroll: '工资总额', payrollAmount: '工资总额', workplaceAddress: '工作场所地址', age: '年龄', gender: '性别',
  occupation: '职业类别', smokingStatus: '吸烟状况',
  // D-501-41 补齐：此前未登记，详情页直出英文键名 relationToHolder
  relationToHolder: '与投保人关系', preExistingCondition: '既往症', socialSecurity: '社保', medicalRegion: '就医地区',
}

/**
 * 枚举型标的属性值中文化（D-501-41）。
 * 码源为后端枚举（不是前端自造）：gender ← metadata `CustomerGender`，relationToHolder ← policy `FamilyRelation`。
 * 🔴 无后端枚举可依据的码（usageType/buildingStructure/occupancyType/propertyUsage/industry 等）**不得在此臆造文案**，
 * 由下方 warnUnmappedSubjectValue 告警暴露，待后端下发货值字典后再补（见台账 D-501-41 结构性建议 3）。
 */
const subjectEnumValueLabels: Record<string, Record<string, string>> = {
  gender: { MALE: '男', FEMALE: '女', UNKNOWN: '未知' },
  relationToHolder: { SELF: '本人', SPOUSE: '配偶', CHILD: '子女', PARENT: '父母' },
}

/** 布尔型属性键：直出 true/false 可读性差，统一渲染「是/否」 */
const subjectBooleanKeys = new Set(['preExistingCondition', 'socialSecurity'])

/** 疑似枚举码（全大写下划线风格），用于识别"该翻却没翻"的值并告警 */
const looksLikeEnumCode = (text: string) => /^[A-Z][A-Z0-9_]{1,}$/.test(text)

/**
 * 标的属性值 → 展示文案：枚举码走映射表，布尔走是/否，其余原样。
 * 未覆盖的枚举码**回退原文并告警**（不静默），避免"英文码直出"再次成为缺陷温床。
 */
const subjectFieldValue = (key: string, value: unknown): string => {
  if (value == null || value === '') return '-'
  if (subjectBooleanKeys.has(key)) return value === true || value === 'true' ? '是' : '否'
  const text = String(value)
  const mapped = subjectEnumValueLabels[key]?.[text]
  if (mapped) return mapped
  if (looksLikeEnumCode(text)) {
    console.warn(`[policy/detail] 标的属性 "${key}" 的值码 "${text}" 无中文映射，请补后端货值字典`)
  }
  return text
}

/** 属性键 → 中文标签：未登记键回退业务化描述 + 告警（对齐 subjectTypeLabel 的「中文兜底」风格，观察项 O-1） */
const subjectFieldLabel = (key: string): string => {
  const label = subjectFieldLabels[key]
  if (label) return label
  console.warn(`[policy/detail] 标的属性键 "${key}" 未登记中文标签，建议迁至后端货值字典`)
  return `其他属性（${key}）`
}

const subjectFields = (subject: PolicySubjectVO) => {
  let attributes: Record<string, unknown> = {}
  if (subject.attributesJson) {
    try {
      const parsed = JSON.parse(subject.attributesJson)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) attributes = parsed
    } catch {
      attributes = {}
    }
  }
  return Object.entries(attributes).map(([key, value]) => ({
    key,
    label: subjectFieldLabel(key),
    value: subjectFieldValue(key, value),
  }))
}

/** 加载保单详情 */
const loadPolicy = async () => {
  loading.value = true
  try {
    policy.value = await getPolicyDetail(route.params.id as string)
    try {
      subjects.value = await getPolicySubjects(route.params.id as string)
    } catch {
      // 标的是详情扩展数据，下游暂不可用时保留主保单详情并显示空态。
      subjects.value = []
    }
  } finally {
    loading.value = false
  }
}

const loadMaintenanceRecords = async () => {
  if (!policy.value || maintenanceLoading.value) return
  maintenanceLoading.value = true
  try {
    const result = await getMaintenanceCaseList({
      policyNumber: policy.value.policyNo,
      pageNum: 1,
      pageSize: 100,
    })
    maintenanceRecords.value = result.list || []
  } finally {
    maintenanceLoading.value = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'maintenance') loadMaintenanceRecords()
})

onMounted(loadPolicy)
</script>

<style scoped lang="scss">
.policy-tabs {
  :deep(.el-tabs__header) {
    margin-bottom: 16px;
  }
}
</style>
