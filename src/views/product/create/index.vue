<template>
  <!-- 新建/编辑产品 - 分步向导 -->
  <div class="ti-page">
    <div class="ti-card">
      <div class="product-create__header">
        <h3>{{ isEdit ? '编辑产品' : '新建产品' }}</h3>
      </div>

      <!-- 步骤条 -->
      <el-steps :active="currentStep" finish-status="success" class="product-create__steps">
        <el-step title="基本信息" />
        <el-step title="险种配置" />
        <el-step title="费率规则" />
        <el-step title="文档配置" />
        <el-step title="确认提交" />
      </el-steps>

      <!-- 步骤内容 -->
      <div class="product-create__content">
        <!-- 第一步：基本信息 -->
        <el-form
          v-if="currentStep === 0"
          ref="step1Ref"
          :model="form"
          :rules="step1Rules"
          label-width="120px"
        >
          <el-form-item label="产品名称" prop="productName">
            <el-input v-model="form.productName" placeholder="请输入产品名称" style="width: 320px" />
          </el-form-item>
          <el-form-item label="产品代码" prop="productCode">
            <el-input v-model="form.productCode" placeholder="如：MED-HIGH-001" style="width: 220px" />
          </el-form-item>
          <el-form-item label="险种分类" prop="category">
            <TiDictSelect
              v-model="form.category"
              dict-type="INSURANCE_CATEGORY"
              style="width: 200px"
              @change="onCategoryChange"
            />
          </el-form-item>
          <el-form-item label="二级险种" prop="insuranceType">
            <el-select
              v-model="form.insuranceType"
              placeholder="请选择二级险种"
              :disabled="!form.category"
              style="width: 200px"
            >
              <el-option
                v-for="opt in insuranceTypeOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="产品形态" prop="form">
            <el-radio-group v-model="form.form">
              <el-radio-button value="INDIVIDUAL">个险</el-radio-button>
              <el-radio-button value="GROUP">团险</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="产品类别" prop="productCategory">
            <el-radio-group v-model="form.productCategory">
              <el-radio-button value="MAIN">主险</el-radio-button>
              <el-radio-button value="RIDER">附加险</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="产品描述">
            <el-input v-model="form.productDesc" type="textarea" :rows="4" style="width: 480px" />
          </el-form-item>
        </el-form>

        <!-- 第二步：险种配置 -->
        <el-form
          v-if="currentStep === 1"
          ref="step2Ref"
          :model="form"
          :rules="step2Rules"
          label-width="120px"
        >
          <el-form-item label="产品模板" prop="templateId">
            <el-select
              v-model="form.templateId"
              placeholder="请选择产品模板（决定出单/核保/理赔流程）"
              style="width: 360px"
              :loading="templateLoading"
              no-data-text="该险种暂无可用模板，请先创建模板"
            >
              <el-option
                v-for="tpl in templates"
                :key="tpl.templateId"
                :label="`${tpl.templateName}（${tpl.templateCode}）`"
                :value="tpl.templateId"
              />
            </el-select>
            <el-button link type="primary" style="margin-left: 12px" @click="showTemplateDialog = true">
              + 新建模板
            </el-button>
          </el-form-item>

          <el-form-item label="绑定条款" prop="clauseIds">
            <el-select
              v-model="form.clauseIds"
              multiple
              placeholder="选择该产品承保的条款（至少一条）"
              style="width: 480px"
              :loading="clauseLoading"
              @change="onClauseSelectionChange"
            >
              <el-option
                v-for="c in clauses"
                :key="c.id"
                :label="`${c.name}（${c.code}）`"
                :value="c.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item v-if="form.clauseIds && form.clauseIds.length" label="主条款" prop="mainClauseId">
            <el-select v-model="form.mainClauseId" placeholder="指定主条款" style="width: 360px">
              <el-option
                v-for="id in form.clauseIds"
                :key="id"
                :label="clauseLabel(id)"
                :value="id"
              />
            </el-select>
          </el-form-item>

          <!-- 保障责任预览：所选条款下的 Coverage -->
          <el-form-item v-if="coverages.length" label="保障责任">
            <el-table :data="coverages" size="small" border style="width: 640px" :max-height="260">
              <el-table-column prop="coverageName" label="责任名称" min-width="140" />
              <el-table-column prop="coverageType" label="类型" width="130" />
              <el-table-column label="保额/限额" width="130">
                <template #default="{ row }">
                  {{ formatAmount(row.coverageAmount ?? row.maxPayout) }}
                </template>
              </el-table-column>
              <el-table-column label="报销比例" width="100">
                <template #default="{ row }">
                  {{ row.reimbursementRatio != null ? (row.reimbursementRatio * 100).toFixed(0) + '%' : '-' }}
                </template>
              </el-table-column>
            </el-table>
          </el-form-item>

          <el-divider content-position="left">投保条件</el-divider>
          <el-form-item label="投保年龄">
            <el-input-number v-model="form.insureCondition.minAge" :min="0" :max="120" placeholder="最小" />
            <span style="margin: 0 8px">至</span>
            <el-input-number v-model="form.insureCondition.maxAge" :min="0" :max="120" placeholder="最大" />
            <span style="margin-left: 8px; color: #909399">周岁</span>
          </el-form-item>
          <el-form-item v-if="form.form === 'GROUP'" label="团体人数">
            <el-input-number v-model="form.insureCondition.minGroupSize" :min="1" placeholder="最少" />
            <span style="margin: 0 8px">至</span>
            <el-input-number v-model="form.insureCondition.maxGroupSize" :min="1" placeholder="最多" />
            <span style="margin-left: 8px; color: #909399">人</span>
          </el-form-item>
          <el-form-item label="健康告知">
            <el-input
              v-model="form.insureCondition.healthNotice"
              type="textarea"
              :rows="2"
              placeholder="如：需如实告知既往病史、住院史等"
              style="width: 480px"
            />
          </el-form-item>
        </el-form>

        <!-- 第三步：费率规则 -->
        <el-form
          v-if="currentStep === 2"
          ref="step3Ref"
          :model="form.pricingBasicRule"
          label-width="120px"
        >
          <el-form-item label="定价类型">
            <el-radio-group v-model="form.pricingBasicRule.pricingType">
              <el-radio-button value="FIXED">固定费率</el-radio-button>
              <el-radio-button value="STEP">阶梯费率</el-radio-button>
              <el-radio-button value="FACTOR">因子定价</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="定价模式">
            <el-radio-group v-model="form.pricingMode">
              <el-radio-button value="RATE_TABLE">费率表</el-radio-button>
              <el-radio-button value="ACTUARIAL_FORMULA">精算公式</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="基础费率">
            <el-input-number
              v-model="form.pricingBasicRule.baseRate"
              :min="0"
              :precision="4"
              :step="0.001"
              placeholder="如 0.0125"
            />
            <span style="margin-left: 8px; color: #909399">费率系数</span>
          </el-form-item>
          <el-form-item label="保费区间">
            <el-input-number v-model="form.pricingBasicRule.minPremium" :min="0" :precision="2" placeholder="最低" />
            <span style="margin: 0 8px">至</span>
            <el-input-number v-model="form.pricingBasicRule.maxPremium" :min="0" :precision="2" placeholder="最高" />
            <span style="margin-left: 8px; color: #909399">元</span>
          </el-form-item>
          <el-form-item v-if="form.pricingMode === 'RATE_TABLE'" label="费率表ID">
            <el-input v-model="form.pricingBasicRule.rateTableId" placeholder="关联费率表编码（可选）" style="width: 280px" />
          </el-form-item>
        </el-form>

        <!-- 第四步：文档配置（所需投保材料 + 生成文档模板，纯产品配置） -->
        <div v-if="currentStep === 3" class="product-create__doc">
          <el-divider content-position="left">所需投保材料</el-divider>
          <el-table :data="form.documentConfig.requiredMaterials" size="small" border style="width: 100%">
            <el-table-column label="材料编码" width="150">
              <template #default="{ row }">
                <el-input v-model="row.materialCode" placeholder="如 ID_CARD" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="材料名称" min-width="180">
              <template #default="{ row }">
                <el-input v-model="row.materialName" placeholder="如 被保人身份证" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="是否必需" width="90" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.mandatory" />
              </template>
            </el-table-column>
            <el-table-column label="说明" min-width="180">
              <template #default="{ row }">
                <el-input v-model="row.description" placeholder="提交要求" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="70" align="center">
              <template #default="{ $index }">
                <el-button link type="danger" size="small" @click="removeMaterial($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-button link type="primary" style="margin-top: 8px" @click="addMaterial">+ 添加材料</el-button>

          <el-divider content-position="left">生成文档模板</el-divider>
          <el-table :data="form.documentConfig.documentTemplates" size="small" border style="width: 100%">
            <el-table-column label="文档类型" width="180">
              <template #default="{ row }">
                <el-select v-model="row.documentType" placeholder="选择类型" size="small" style="width: 100%">
                  <el-option
                    v-for="opt in documentTypeOptions"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="模板编码" width="150">
              <template #default="{ row }">
                <el-input v-model="row.templateCode" placeholder="模板编码" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="模板名称" min-width="160">
              <template #default="{ row }">
                <el-input v-model="row.templateName" placeholder="模板名称" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="输出格式" width="110">
              <template #default="{ row }">
                <el-select v-model="row.outputFormat" size="small" style="width: 100%">
                  <el-option label="PDF" value="PDF" />
                  <el-option label="JPG" value="JPG" />
                  <el-option label="PNG" value="PNG" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="自动生成" width="90" align="center">
              <template #default="{ row }">
                <el-switch v-model="row.autoGenerate" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="70" align="center">
              <template #default="{ $index }">
                <el-button link type="danger" size="small" @click="removeDocTemplate($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-button link type="primary" style="margin-top: 8px" @click="addDocTemplate">+ 添加文档模板</el-button>
        </div>

        <!-- 第五步：确认提交 -->
        <div v-if="currentStep === 4">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="产品名称">{{ form.productName }}</el-descriptions-item>
            <el-descriptions-item label="产品代码">{{ form.productCode }}</el-descriptions-item>
            <el-descriptions-item label="险种分类">{{ form.category }}</el-descriptions-item>
            <el-descriptions-item label="二级险种">{{ insuranceTypeLabel(form.insuranceType) }}</el-descriptions-item>
            <el-descriptions-item label="产品形态">{{ form.form === 'GROUP' ? '团险' : '个险' }}</el-descriptions-item>
            <el-descriptions-item label="产品模板">{{ templateLabel(form.templateId) }}</el-descriptions-item>
            <el-descriptions-item label="绑定条款数">{{ form.clauseIds.length }}</el-descriptions-item>
            <el-descriptions-item label="投保年龄">
              {{ form.insureCondition.minAge ?? '-' }} ~ {{ form.insureCondition.maxAge ?? '-' }} 周岁
            </el-descriptions-item>
            <el-descriptions-item label="定价类型">{{ pricingTypeLabel }}</el-descriptions-item>
            <el-descriptions-item label="基础费率">{{ form.pricingBasicRule.baseRate ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="保费区间">
              ¥{{ form.pricingBasicRule.minPremium ?? '-' }} ~ ¥{{ form.pricingBasicRule.maxPremium ?? '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="投保材料">{{ form.documentConfig.requiredMaterials.length }} 项</el-descriptions-item>
            <el-descriptions-item label="文档模板">{{ form.documentConfig.documentTemplates.length }} 个</el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="product-create__footer">
        <el-button v-if="currentStep > 0" @click="currentStep--">上一步</el-button>
        <el-button v-if="currentStep < 4" type="primary" @click="nextStep">下一步</el-button>
        <el-button v-if="currentStep === 4" type="primary" :loading="saving" @click="handleSave">
          {{ isEdit ? '保存修改' : '创建产品' }}
        </el-button>
        <el-button @click="$router.back()">取消</el-button>
      </div>
    </div>

    <!-- 新建模板对话框 -->
    <el-dialog v-model="showTemplateDialog" title="新建产品模板" width="480px">
      <el-form :model="templateForm" label-width="100px">
        <el-form-item label="模板名称">
          <el-input v-model="templateForm.templateName" placeholder="如：中高端医疗险模板" />
        </el-form-item>
        <el-form-item label="模板编码">
          <el-input v-model="templateForm.templateCode" placeholder="如：TPL-MED-001" />
        </el-form-item>
        <el-form-item label="出单模式">
          <el-select v-model="templateForm.issuanceMode" style="width: 100%">
            <el-option label="一步出单（录入即出单）" value="ONE_STEP" />
            <el-option label="两步出单（投保→保单）" value="TWO_STEP" />
            <el-option label="三步出单（意向→投保→核保→保单）" value="THREE_STEP" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTemplateDialog = false">取消</el-button>
        <el-button type="primary" :loading="templateSaving" @click="handleCreateTemplate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import {
  createProduct,
  getTemplatesByCategory,
  createTemplate,
  toTemplateInsuranceType,
  type CreateProductForm,
  type ProductTemplateVO,
} from '@/api/product'
import { getClauseList, getCoverages, type ClauseVO, type CoverageVO } from '@/api/clause'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { insuranceTypesOf, insuranceTypeLabel } from '@/constants/insurance'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// 二级险种选项：随一级险种大类联动
const insuranceTypeOptions = computed(() => insuranceTypesOf(form.category))

const isEdit = computed(() => !!route.query.id)
const currentStep = ref(0)
const saving = ref(false)
const step1Ref = ref<FormInstance>()
const step2Ref = ref<FormInstance>()
const step3Ref = ref<FormInstance>()

const form = reactive<CreateProductForm>({
  productName: '',
  productCode: '',
  category: undefined,
  insuranceType: undefined,
  form: 'INDIVIDUAL',
  productCategory: 'MAIN',
  productDesc: '',
  templateId: undefined,
  clauseIds: [],
  mainClauseId: undefined,
  insureCondition: { minAge: undefined, maxAge: undefined },
  pricingBasicRule: { pricingType: 'FIXED', baseRate: undefined, minPremium: undefined, maxPremium: undefined },
  pricingMode: 'RATE_TABLE',
  documentConfig: { requiredMaterials: [], documentTemplates: [] },
})

// 文档类型选项（对齐后端 DocumentType 枚举常量名）
const documentTypeOptions = [
  { value: 'APPLICATION_FORM', label: '投保单' },
  { value: 'POLICY', label: '保单' },
  { value: 'HEALTH_NOTICE', label: '健康告知书' },
  { value: 'CLAIM_MATERIAL_LIST', label: '理赔材料清单' },
  { value: 'RENEWAL_NOTICE', label: '续保通知书' },
  { value: 'PREMIUM_RECEIPT', label: '保费收据' },
]

// 文档配置行操作
function addMaterial() {
  form.documentConfig.requiredMaterials.push({
    materialCode: '',
    materialName: '',
    mandatory: true,
    description: '',
  })
}
function removeMaterial(index: number) {
  form.documentConfig.requiredMaterials.splice(index, 1)
}
function addDocTemplate() {
  form.documentConfig.documentTemplates.push({
    documentType: undefined,
    templateCode: '',
    templateName: '',
    outputFormat: 'PDF',
    autoGenerate: true,
  })
}
function removeDocTemplate(index: number) {
  form.documentConfig.documentTemplates.splice(index, 1)
}

const step1Rules: FormRules = {
  productName: [{ required: true, message: '请输入产品名称', trigger: 'blur' }],
  productCode: [{ required: true, message: '请输入产品代码', trigger: 'blur' }],
  category: [{ required: true, message: '请选择险种分类', trigger: 'change' }],
  insuranceType: [{ required: true, message: '请选择二级险种', trigger: 'change' }],
}
const step2Rules: FormRules = {
  templateId: [{ required: true, message: '请选择产品模板', trigger: 'change' }],
  clauseIds: [
    {
      required: true,
      validator: (_r, v, cb) => (v && v.length ? cb() : cb(new Error('请至少绑定一条条款'))),
      trigger: 'change',
    },
  ],
}

// ===== 模板 =====
const templates = ref<ProductTemplateVO[]>([])
const templateLoading = ref(false)
const showTemplateDialog = ref(false)
const templateSaving = ref(false)
const templateForm = reactive({ templateName: '', templateCode: '', issuanceMode: 'TWO_STEP' })

async function loadTemplates() {
  if (!form.category) return
  templateLoading.value = true
  try {
    templates.value = (await getTemplatesByCategory(form.category)).filter((t) => t.status === 'ACTIVE')
  } catch {
    templates.value = []
  } finally {
    templateLoading.value = false
  }
}

// ===== 条款 =====
const clauses = ref<ClauseVO[]>([])
const clauseLoading = ref(false)
const coverages = ref<CoverageVO[]>([])

async function loadClauses() {
  clauseLoading.value = true
  try {
    const res = await getClauseList({ pageNum: 1, pageSize: 100 })
    // 仅展示 ACTIVE 条款供绑定
    clauses.value = (res.list ?? []).filter((c) => c.status === 'ACTIVE')
  } catch {
    clauses.value = []
  } finally {
    clauseLoading.value = false
  }
}

async function onClauseSelectionChange(ids: string[]) {
  // 默认主条款取第一条
  if (ids.length && !form.mainClauseId) form.mainClauseId = ids[0]
  if (form.mainClauseId && !ids.includes(form.mainClauseId)) form.mainClauseId = ids[0]
  // 汇总所选条款的保障责任预览
  const all: CoverageVO[] = []
  for (const id of ids) {
    try {
      const cs = await getCoverages(id)
      all.push(...(cs ?? []))
    } catch {
      /* 单条失败不阻断预览 */
    }
  }
  coverages.value = all
}

function onCategoryChange() {
  // 险种分类变化：重置二级险种与模板选择并重新加载
  form.insuranceType = undefined
  form.templateId = undefined
  loadTemplates()
}

// ===== 展示辅助 =====
function clauseLabel(id?: string) {
  const c = clauses.value.find((x) => x.id === id)
  return c ? `${c.name}（${c.code}）` : (id ?? '')
}
function templateLabel(id?: string) {
  const t = templates.value.find((x) => x.templateId === id)
  return t ? `${t.templateName}（${t.templateCode}）` : (id ?? '-')
}
function formatAmount(v?: number) {
  return v != null ? `¥${v.toLocaleString()}` : '-'
}
const pricingTypeLabel = computed(() => {
  const m: Record<string, string> = { FIXED: '固定费率', STEP: '阶梯费率', FACTOR: '因子定价' }
  return form.pricingBasicRule.pricingType ? m[form.pricingBasicRule.pricingType] : '-'
})

const nextStep = async () => {
  if (currentStep.value === 0) {
    const valid = await step1Ref.value?.validate().catch(() => false)
    if (!valid) return
    // 进入险种配置：加载模板与条款
    await Promise.all([loadTemplates(), loadClauses()])
  }
  if (currentStep.value === 1) {
    const valid = await step2Ref.value?.validate().catch(() => false)
    if (!valid) return
  }
  currentStep.value++
}

async function handleCreateTemplate() {
  if (!templateForm.templateName || !templateForm.templateCode) {
    ElMessage.warning('请填写模板名称与编码')
    return
  }
  const insuranceType = toTemplateInsuranceType(form.category)
  if (!insuranceType) {
    ElMessage.warning('请先在第一步选择险种分类')
    return
  }
  templateSaving.value = true
  try {
    await createTemplate({
      templateCode: templateForm.templateCode,
      templateName: templateForm.templateName,
      insuranceType,
      issuanceMode: templateForm.issuanceMode,
    })
    ElMessage.success('模板创建成功')
    showTemplateDialog.value = false
    await loadTemplates()
  } finally {
    templateSaving.value = false
  }
}

const handleSave = async () => {
  saving.value = true
  try {
    // 落库当前登录用户为创建人（后端无用户上下文，沿用 customer 域约定：由前端随请求体传入 createdBy）
    await createProduct({ ...form, createdBy: userStore.displayName })
    ElMessage.success('创建成功')
    router.push('/product/list')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.product-create {
  &__header {
    margin-bottom: 24px;

    h3 {
      margin: 0;
      font-size: 18px;
      color: #303133;
    }
  }

  &__steps {
    margin-bottom: 32px;
  }

  &__content {
    min-height: 280px;
    padding: 8px 0 24px;
  }

  &__footer {
    display: flex;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid $border-color;
  }
}
</style>
