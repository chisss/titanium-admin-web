<template>
  <!-- 条款编辑页 -->
  <div class="ti-page">
    <div class="ti-card">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>{{ isEdit ? '编辑条款' : '新增条款' }}</h3>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" v-loading="loading">
        <el-row :gutter="24">
          <el-col :sm="12">
            <el-form-item label="条款编码" prop="code">
              <el-input v-model="form.code" :disabled="isEdit" placeholder="如：CLAUSE-AUTO-001" />
            </el-form-item>
          </el-col>
          <el-col :sm="12">
            <el-form-item label="条款名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入条款名称" />
            </el-form-item>
          </el-col>
          <el-col :sm="12">
            <el-form-item label="险种分类" prop="category">
              <TiDictSelect
                v-model="form.category"
                dict-type="INSURANCE_CATEGORY"
                style="width: 100%"
                @change="onCategoryChange"
              />
            </el-form-item>
          </el-col>
          <el-col :sm="12">
            <el-form-item label="具体险种" prop="insuranceType">
              <el-select
                v-model="form.insuranceType"
                :disabled="!form.category"
                clearable
                placeholder="请选择具体险种"
                style="width: 100%"
              >
                <el-option
                  v-for="option in insuranceTypeOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :sm="12">
            <el-form-item label="条款类型" prop="clauseType">
              <TiDictSelect v-model="form.clauseType" dict-type="CLAUSE_TYPE" placeholder="请选择" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :sm="12">
            <el-form-item label="版本号">
              <el-input v-model="form.version" readonly />
              <el-text type="info" size="small">创建时由后端固定为 V1.0，更新请求不提交版本字段</el-text>
            </el-form-item>
          </el-col>
          <el-col :sm="12">
            <el-form-item label="生效日期">
              <el-date-picker v-model="form.effectiveDate" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="条款内容" prop="content">
              <el-input
                v-model="form.content"
                type="textarea"
                :rows="10"
                placeholder="请输入条款正文内容..."
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <div style="padding-top: 16px; border-top: 1px solid #ebeef5; display: flex; gap: 12px;">
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
        <el-button @click="$router.back()">取消</el-button>
      </div>
    </div>

    <!-- 保险责任配置（条款保存后可用） -->
    <div class="ti-card" style="margin-top: 16px;">
      <div class="coverage-header">
        <h3>保险责任配置</h3>
        <el-button
          type="primary"
          :icon="Plus"
          :disabled="!isEdit"
          @click="openCoverageDialog()"
        >
          新增责任
        </el-button>
      </div>
      <el-alert
        v-if="!isEdit"
        type="info"
        :closable="false"
        title="请先保存条款基本信息，再配置保险责任"
        style="margin-bottom: 12px;"
      />
      <el-table :data="coverages" v-loading="coverageLoading" border size="small">
        <el-table-column prop="coverageName" label="责任名称" min-width="160" show-overflow-tooltip />
        <el-table-column label="责任类型" width="90">
          <template #default="{ row }">{{ coverageTypeLabel(row.coverageType) }}</template>
        </el-table-column>
        <el-table-column label="赔付类型" width="100">
          <template #default="{ row }">{{ payoutTypeLabel(row.payoutType) }}</template>
        </el-table-column>
        <el-table-column label="最高保额" width="120">
          <template #default="{ row }">{{ formatAmount(row.coverageAmount) }}</template>
        </el-table-column>
        <el-table-column label="关键参数" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ coverageSummary(row) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="handleRemoveCoverage(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>暂无保险责任，点击「新增责任」开始配置</template>
      </el-table>
    </div>

    <!-- 责任编辑弹窗 -->
    <el-dialog v-model="dialogVisible" title="新增保险责任" width="640px" :close-on-click-modal="false">
      <el-form ref="coverageFormRef" :model="coverageForm" :rules="coverageRules" label-width="120px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="责任编码">
              <el-input v-model="coverageForm.coverageCode" placeholder="可空，后端生成" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="责任名称" prop="coverageName">
              <el-input v-model="coverageForm.coverageName" placeholder="如：一般医疗保险金" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="责任类型" prop="coverageType">
              <TiDictSelect v-model="coverageForm.coverageType" dict-type="COVERAGE_TYPE" :clearable="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="赔付类型" prop="payoutType">
              <TiDictSelect v-model="coverageForm.payoutType" dict-type="PAYOUT_TYPE" :clearable="false" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="最高保额(元)">
              <el-input-number v-model="coverageForm.coverageAmount" :min="0" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="等待期(天)">
              <el-input-number v-model="coverageForm.waitingPeriodDays" :min="0" style="width: 100%" />
            </el-form-item>
          </el-col>

          <!-- 报销型参数 -->
          <template v-if="coverageForm.payoutType === 'REIMBURSEMENT'">
            <el-col :span="12">
              <el-form-item label="社保内比例">
                <el-input-number v-model="coverageForm.reimbursementRatio" :min="0" :max="1" :step="0.1" :precision="2" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="社保外比例">
                <el-input-number v-model="coverageForm.outSocialRatio" :min="0" :max="1" :step="0.1" :precision="2" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="年免赔额(元)">
                <el-input-number v-model="coverageForm.deductibleAmount" :min="0" :precision="2" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="赔付上限(元)">
                <el-input-number v-model="coverageForm.maxPayout" :min="0" :precision="2" style="width: 100%" />
              </el-form-item>
            </el-col>
          </template>

          <!-- 比例赔付参数 -->
          <template v-if="coverageForm.payoutType === 'PROPORTIONAL'">
            <el-col :span="12">
              <el-form-item label="赔付比例">
                <el-input-number v-model="coverageForm.proportion" :min="0" :max="1" :step="0.1" :precision="2" style="width: 100%" />
              </el-form-item>
            </el-col>
          </template>

          <!-- 按损赔付参数 -->
          <template v-if="coverageForm.payoutType === 'ACTUAL_LOSS'">
            <el-col :span="12">
              <el-form-item label="免赔额(元)">
                <el-input-number v-model="coverageForm.deductibleAmount" :min="0" :precision="2" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="赔付上限(元)">
                <el-input-number v-model="coverageForm.maxPayout" :min="0" :precision="2" style="width: 100%" />
              </el-form-item>
            </el-col>
          </template>

          <!-- 周期给付/津贴型参数 -->
          <template v-if="coverageForm.payoutType === 'PERIODIC'">
            <el-col :span="12">
              <el-form-item label="日津贴(元/天)">
                <el-input-number v-model="coverageForm.dailyAmount" :min="0" :precision="2" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="免赔天数">
                <el-input-number v-model="coverageForm.deductibleDays" :min="0" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="每次最高天数">
                <el-input-number v-model="coverageForm.maxDaysPerClaim" :min="0" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="累计最高天数">
                <el-input-number v-model="coverageForm.maxDaysTotal" :min="0" style="width: 100%" />
              </el-form-item>
            </el-col>
          </template>

          <el-col :span="24">
            <el-form-item label="责任描述">
              <el-input v-model="coverageForm.description" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="是否附加责任">
              <el-switch v-model="coverageForm.isAdditional" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="coverageSaving" @click="handleSaveCoverage">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Plus } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import {
  createClause,
  updateClause,
  getClauseDetail,
  getCoverages,
  addCoverage,
  removeCoverage,
  type CoverageVO,
} from '@/api/clause'
import { insuranceTypesOf } from '@/constants/insurance'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const isEdit = computed(() => !!route.params.id)
const clauseId = computed(() => route.params.id as string)
const loading = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  code: '',
  name: '',
  category: undefined as string | undefined,
  insuranceType: undefined as string | undefined,
  clauseType: 'MAIN',
  version: 'V1.0',
  content: '',
  effectiveDate: undefined as string | undefined,
})

const rules: FormRules = {
  code: [{ required: true, message: '请输入条款编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入条款名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择险种分类', trigger: 'change' }],
  insuranceType: [{ required: true, message: '请选择具体险种', trigger: 'change' }],
  clauseType: [{ required: true, message: '请选择条款类型', trigger: 'change' }],
}

const insuranceTypeOptions = computed(() => insuranceTypesOf(form.category))

/** 一级险种变化后必须重新选择具体险种，禁止静默代选第一个选项。 */
const onCategoryChange = () => {
  form.insuranceType = undefined
}

// 责任类型 → 默认触发类型
const TRIGGER_BY_COVERAGE: Record<string, string> = {
  CRITICAL_ILLNESS: 'CRITICAL_ILLNESS',
  MEDICAL: 'MEDICAL_EXPENSE',
  ACCIDENT: 'ACCIDENT_INJURY',
  DEATH: 'DEATH',
}

const { getLabel: coverageTypeDictLabel } = useDict('COVERAGE_TYPE')
const { getLabel: payoutTypeDictLabel } = useDict('PAYOUT_TYPE')
const coverageTypeLabel = (v?: string) => v ? coverageTypeDictLabel(v) : '-'
const payoutTypeLabel = (v?: string) => v ? payoutTypeDictLabel(v) : '-'
const formatAmount = (v?: number) => (v == null ? '-' : `¥${Number(v).toLocaleString()}`)

const coverageSummary = (row: CoverageVO): string => {
  const parts: string[] = []
  if (row.waitingPeriodDays != null) parts.push(`等待期${row.waitingPeriodDays}天`)
  if (row.payoutType === 'REIMBURSEMENT') {
    if (row.reimbursementRatio != null) parts.push(`社保内${row.reimbursementRatio * 100}%`)
    if (row.outSocialRatio != null) parts.push(`社保外${row.outSocialRatio * 100}%`)
    if (row.deductibleAmount != null) parts.push(`免赔${row.deductibleAmount}元`)
  } else if (row.payoutType === 'PERIODIC') {
    if (row.dailyAmount != null) parts.push(`日津贴${row.dailyAmount}元`)
    if (row.maxDaysPerClaim != null) parts.push(`每次${row.maxDaysPerClaim}天`)
    if (row.maxDaysTotal != null) parts.push(`累计${row.maxDaysTotal}天`)
  } else if (row.payoutType === 'PROPORTIONAL' && row.proportion != null) {
    parts.push(`比例${row.proportion * 100}%`)
  }
  return parts.join('、') || '-'
}

// ===== 责任列表 =====
const coverages = ref<CoverageVO[]>([])
const coverageLoading = ref(false)

const loadCoverages = async () => {
  if (!isEdit.value) return
  coverageLoading.value = true
  try {
    coverages.value = (await getCoverages(clauseId.value)) ?? []
  } finally {
    coverageLoading.value = false
  }
}

// ===== 责任弹窗 =====
const dialogVisible = ref(false)
const coverageSaving = ref(false)
const coverageFormRef = ref<FormInstance>()
const coverageForm = reactive<CoverageVO>({})
const coverageRules: FormRules = {
  coverageName: [{ required: true, message: '请输入责任名称', trigger: 'blur' }],
  coverageType: [{ required: true, message: '请选择责任类型', trigger: 'change' }],
  payoutType: [{ required: true, message: '请选择赔付类型', trigger: 'change' }],
}

const openCoverageDialog = () => {
  Object.keys(coverageForm).forEach((k) => delete (coverageForm as Record<string, unknown>)[k])
  Object.assign(coverageForm, {
    coverageType: 'MEDICAL',
    payoutType: 'REIMBURSEMENT',
    isAdditional: false,
  })
  dialogVisible.value = true
}

const handleSaveCoverage = async () => {
  const valid = await coverageFormRef.value?.validate().catch(() => false)
  if (!valid) return
  coverageSaving.value = true
  try {
    const payload: CoverageVO = {
      ...coverageForm,
      triggerType: TRIGGER_BY_COVERAGE[coverageForm.coverageType ?? 'MEDICAL'] ?? 'MEDICAL_EXPENSE',
    }
    await addCoverage(clauseId.value, payload)
    ElMessage.success('保险责任已新增')
    dialogVisible.value = false
    await loadCoverages()
  } finally {
    coverageSaving.value = false
  }
}

const handleRemoveCoverage = async (row: CoverageVO) => {
  await ElMessageBox.confirm(`确认删除责任"${row.coverageName}"？`, '提示', { type: 'warning' })
  await removeCoverage(clauseId.value, row.coverageId as string)
  ElMessage.success('已删除')
  await loadCoverages()
}

onMounted(async () => {
  if (!isEdit.value) return
  loading.value = true
  try {
    const detail = await getClauseDetail(clauseId.value)
    if (detail.status !== 'DRAFT') {
      ElMessage.warning('仅草稿状态的条款可编辑')
      router.replace('/clause/list')
      return
    }
    Object.assign(form, detail)
  } finally {
    loading.value = false
  }
  await loadCoverages()
})

const handleSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  const operatorId = userStore.userInfo?.id
  if (!operatorId) {
    ElMessage.error('无法获取当前操作人，请重新登录后再试')
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      await updateClause(clauseId.value, form, operatorId)
      ElMessage.success('保存成功')
    } else {
      await createClause(form, operatorId)
      ElMessage.success('保存成功')
    }
    router.push('/clause/list')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;

  h3 { margin: 0; font-size: 18px; }
}

.coverage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;

  h3 { margin: 0; font-size: 16px; }
}
</style>
