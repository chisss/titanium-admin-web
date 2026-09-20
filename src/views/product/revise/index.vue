<template>
  <!-- 产品修订页：EFFECTIVE 产品生成新版本 DRAFT（存量产品补配核保配置等场景） -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <TiDetailHeader title="修订产品">
        <template #meta>
          <el-tag v-if="detail" type="warning" effect="plain">
            {{ detail.productName }} · {{ detail.version }} → 新版本 DRAFT
          </el-tag>
        </template>
      </TiDetailHeader>

      <template v-if="detail">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
          title="修订不改写当前生效版本，将生成新版本草稿（版本号递增），审核通过后新版本生效。"
        />

        <!-- 基本信息 -->
        <el-divider content-position="left">基本信息</el-divider>
        <el-form ref="baseFormRef" :model="form" :rules="baseRules" label-width="120px">
          <el-form-item label="产品名称" prop="newProductName">
            <el-input v-model="form.newProductName" placeholder="请输入新版本产品名称" style="width: 320px" />
          </el-form-item>
          <el-form-item label="产品描述">
            <el-input v-model="form.newProductDesc" type="textarea" :rows="3" style="width: 480px" />
          </el-form-item>
          <el-form-item label="产品代码">
            <span class="readonly-field">{{ detail.productCode }}（修订继承原产品代码）</span>
          </el-form-item>
          <el-form-item label="形态/险种">
            <span class="readonly-field">
              {{ formLabel(detail.form) }} · {{ insuranceTypeLabel(detail.insuranceType) }} ·
              {{ productCategoryLabel(detail.category) }}
            </span>
          </el-form-item>
        </el-form>

        <!-- 核保配置（补配场景核心） -->
        <el-divider content-position="left">核保配置</el-divider>
        <el-form :model="form" label-width="120px">
          <el-form-item label="核保模式">
            <el-radio-group v-model="form.underwritingConfig.underwritingMode">
              <el-radio-button value="AUTO">自动核保</el-radio-button>
              <el-radio-button value="MANUAL">人工核保</el-radio-button>
              <el-radio-button value="SMART">智能核保</el-radio-button>
              <el-radio-button value="HYBRID">混合核保</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="核保规则集">
            <el-select
              v-model="form.underwritingConfig.ruleSetCode"
              placeholder="选择该产品核保流程使用的规则集（可不选）"
              clearable
              filterable
              style="width: 420px"
              :loading="ruleSetLoading"
              no-data-text="暂无核保规则集，请先到规则引擎创建"
            >
              <el-option
                v-for="rs in underwritingRuleSets"
                :key="rs.ruleSetCode"
                :label="`${rs.ruleSetName}（${rs.ruleSetCode}）`"
                :value="rs.ruleSetCode"
              />
            </el-select>
            <!-- 空态文案已给出去处（规则引擎），补一个真入口，避免「有提示、无门」 -->
            <el-button v-permission="'rule-engine:list'" style="margin-left: 10px" @click="router.push('/rule-engine/list')">
              去规则引擎
            </el-button>
            <span style="margin-left: 10px; color: var(--el-text-color-secondary); font-size: 12px">
              未选择时核保域回退内置评分逻辑
            </span>
          </el-form-item>
          <el-form-item label="自动核保条件">
            <el-input
              v-model="form.underwritingConfig.autoApprovalCondition"
              type="textarea"
              :rows="2"
              placeholder="如：标准体且保额低于人工核保阈值时自动通过"
              style="width: 480px"
            />
          </el-form-item>
          <el-form-item label="转人工阈值">
            <el-input-number
              v-model="form.underwritingConfig.manualReviewAmountThreshold"
              :min="0"
              :step="10000"
              :precision="0"
              placeholder="保额超过该值转人工核保"
            />
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">元</span>
          </el-form-item>
          <el-form-item label="核保时效">
            <el-input-number
              v-model="form.underwritingConfig.underwritingSLADays"
              :min="1"
              :max="90"
              :precision="0"
              placeholder="核保完成时限"
            />
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">天</span>
          </el-form-item>
          <el-form-item label="必需材料">
            <div style="width: 480px">
              <div v-for="(doc, index) in form.underwritingConfig.requiredDocuments" :key="index" style="display: flex; gap: 8px; margin-bottom: 6px">
                <!--
                  受控词表（禁用 allow-create）：核保必需材料只能从 src/constants/material.ts 选，
                  避免操作员录成「身份证 / 身份证明 / 身份证复印件」等无法聚类的写法。
                  后端该字段为 UnderwritingConfig.requiredDocuments（List<String>，存可直接展示的文本），
                  故 value 取中文名而非编码，与历史数据保持同一口径。
                -->
                <el-select
                  v-model="form.underwritingConfig.requiredDocuments[index]"
                  placeholder="请选择材料"
                  filterable
                  size="small"
                  style="flex: 1"
                >
                  <el-option v-for="opt in MATERIAL_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.label" />
                </el-select>
                <el-button type="danger" size="small" :icon="Delete" @click="removeRequiredDocument(index)">删除</el-button>
              </div>
              <el-button type="primary" size="small" :icon="Plus" @click="addRequiredDocument">+ 添加核保必需材料</el-button>
            </div>
          </el-form-item>
          <el-form-item label="承保弹性">
            <el-switch v-model="form.underwritingConfig.surchargeAcceptable" active-text="支持加费承保" />
            <el-switch
              v-model="form.underwritingConfig.specialAgreementAcceptable"
              active-text="支持特别约定"
              style="margin-left: 24px"
            />
          </el-form-item>
        </el-form>

        <!-- 投保条件 -->
        <el-divider content-position="left">投保条件</el-divider>
        <el-form ref="insureFormRef" :model="form" :rules="insureRules" label-width="120px">
          <el-form-item label="投保年龄" prop="insureCondition.maxAge">
            <el-input-number v-model="form.insureCondition.minAge" :min="0" :max="120" placeholder="最小" />
            <span style="margin: 0 8px">至</span>
            <el-input-number v-model="form.insureCondition.maxAge" :min="0" :max="120" placeholder="最大" />
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">周岁</span>
          </el-form-item>
          <el-form-item label="保额区间" prop="insureCondition.maxInsuredAmount">
            <el-input-number v-model="form.insureCondition.minInsuredAmount" :min="0" :precision="0" placeholder="最低" />
            <span style="margin: 0 8px">至</span>
            <el-input-number v-model="form.insureCondition.maxInsuredAmount" :min="0" :precision="0" placeholder="最高" />
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">元</span>
          </el-form-item>
          <el-form-item label="等待期">
            <el-input-number v-model="form.insureCondition.waitingPeriodDays" :min="0" :max="365" :precision="0" />
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">天</span>
          </el-form-item>
          <el-form-item label="犹豫期">
            <el-input-number v-model="form.insureCondition.hesitationPeriodDays" :min="0" :max="30" :precision="0" />
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">天</span>
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

        <!-- 定价 -->
        <el-divider content-position="left">定价</el-divider>
        <el-form ref="pricingFormRef" :model="form" :rules="pricingRules" label-width="120px">
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
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">费率系数</span>
          </el-form-item>
          <el-form-item label="保费区间" prop="pricingBasicRule.maxPremium">
            <el-input-number v-model="form.pricingBasicRule.minPremium" :min="0" :precision="2" placeholder="最低" />
            <span style="margin: 0 8px">至</span>
            <el-input-number v-model="form.pricingBasicRule.maxPremium" :min="0" :precision="2" placeholder="最高" />
            <span style="margin-left: 8px; color: var(--el-text-color-secondary)">元</span>
          </el-form-item>
        </el-form>

        <!-- 条款关联（带出现有绑定，可移除；保障期间/缴费/出单/保单形态等其余配置随修订继承） -->
        <el-divider content-position="left">条款关联</el-divider>
        <el-table :data="clauseRels" size="small" border style="width: 640px">
          <el-table-column label="条款ID" prop="clauseId" min-width="220" show-overflow-tooltip />
          <el-table-column label="条款版本" prop="clauseVersion" width="120">
            <template #default="{ row }">{{ row.clauseVersion || '-' }}</template>
          </el-table-column>
          <el-table-column label="主条款" width="90">
            <template #default="{ row }">
              <el-tag v-if="row.isMainClause" type="danger" size="small" effect="plain">主条款</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" class-name="ti-action-column">
            <template #default="{ $index }">
              <el-button size="small" type="danger" :icon="Remove" @click="removeClauseRel($index)">移除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <p class="revise-note">保障期间、缴费方式、出单流程、保单形态等其余配置随修订自动继承当前版本。</p>

        <!-- 提交 -->
        <div class="revise-footer">
          <el-button :icon="Check" type="primary" :loading="submitting" @click="handleSubmit">提交修订</el-button>
          <el-button @click="$router.back()">取消</el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, Delete, Plus, Remove } from '@element-plus/icons-vue'
import TiDetailHeader from '@/components/TiDetailHeader/index.vue'

import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { getProductDetailRaw, getProductClauses, reviseProduct } from '@/api/product'
import { listRuleSets, type RuleSet } from '@/api/rule-engine'
import { INSURANCE_TYPE_LABEL } from '@/constants/insurance'
import { MATERIAL_OPTIONS } from '@/constants/material'
import { useDict } from '@/composables/useDict'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const submitting = ref(false)

/** 产品详情原始载荷（修订带出全量配置的基线，不经视图模型裁剪） */
const detail = ref<Record<string, any> | null>(null)
/** 当前条款关联（修订可移除，其余继承） */
const clauseRels = ref<{ clauseId: string; clauseVersion?: string; isMainClause?: boolean }[]>([])

/** 修订表单（编辑区字段） */
const form = ref({
  newProductName: '',
  newProductDesc: '',
  insureCondition: {
    minAge: undefined as number | undefined,
    maxAge: undefined as number | undefined,
    minInsuredAmount: undefined as number | undefined,
    maxInsuredAmount: undefined as number | undefined,
    waitingPeriodDays: undefined as number | undefined,
    hesitationPeriodDays: undefined as number | undefined,
    healthNotice: '',
  },
  underwritingConfig: {
    underwritingMode: 'SMART' as 'AUTO' | 'MANUAL' | 'SMART' | 'HYBRID',
    autoApprovalCondition: '',
    manualReviewAmountThreshold: undefined as number | undefined,
    requiredDocuments: [] as string[],
    underwritingSLADays: undefined as number | undefined,
    surchargeAcceptable: false,
    specialAgreementAcceptable: false,
    ruleSetCode: undefined as string | undefined,
  },
  pricingMode: 'RATE_TABLE' as 'RATE_TABLE' | 'ACTUARIAL_FORMULA',
  pricingBasicRule: {
    baseRate: undefined as number | undefined,
    minPremium: undefined as number | undefined,
    maxPremium: undefined as number | undefined,
  },
})

const { getLabel: productFormDictLabel } = useDict('PRODUCT_FORM')
const { getLabel: productCategoryDictLabel } = useDict('PRODUCT_CATEGORY')
const formLabel = (v?: string) => (v ? productFormDictLabel(v) : '-')

/**
 * 修订页三处可编辑表单的实例与规则（核保配置表单无必填字段，故不挂 ref）。
 * 🔴 原先四个表单**只有一处 `required`、零 rules**：`handleSubmit` 里那句
 * `if (!form.value.newProductName.trim())` 是唯一防线，且只弹全局消息条。
 *
 * rules 按**表单分组**而非共用一套：Element Plus 对「rules 里声明了、但该表单内没有
 * 对应 form-item」的路径会告警并忽略，共用一套会引入无谓噪声。
 *
 * 区间类字段（投保年龄、保额、保费）的判据为**新补**：`el-input-number` 的 :min/:max
 * 只管单值范围，管不到「下限 > 上限」这种跨字段非法组合，而倒挂的区间会直接落库。
 */
const baseFormRef = ref<FormInstance>()
const insureFormRef = ref<FormInstance>()
const pricingFormRef = ref<FormInstance>()

const baseRules: FormRules = {
  newProductName: [{ required: true, whitespace: true, message: '请输入新版本产品名称', trigger: 'blur' }],
}
const insureRules: FormRules = {
  'insureCondition.maxAge': [{
    validator: (_r, v: number | undefined, cb) => (
      v == null || form.value.insureCondition.minAge == null || v >= form.value.insureCondition.minAge
        ? cb()
        : cb(new Error('投保年龄上限不得低于下限'))),
    trigger: 'change',
  }],
  'insureCondition.maxInsuredAmount': [{
    validator: (_r, v: number | undefined, cb) => (
      v == null || form.value.insureCondition.minInsuredAmount == null || v >= form.value.insureCondition.minInsuredAmount
        ? cb()
        : cb(new Error('保额上限不得低于下限'))),
    trigger: 'change',
  }],
}
const pricingRules: FormRules = {
  'pricingBasicRule.maxPremium': [{
    validator: (_r, v: number | undefined, cb) => (
      v == null || form.value.pricingBasicRule.minPremium == null || v >= form.value.pricingBasicRule.minPremium
        ? cb()
        : cb(new Error('保费上限不得低于下限'))),
    trigger: 'change',
  }],
}
const productCategoryLabel = (v?: string) => (v ? productCategoryDictLabel(v) : '-')
const insuranceTypeLabel = (v?: string) => (v ? INSURANCE_TYPE_LABEL[v] ?? v : '-')

// —— 核保规则集联动（规则引擎 UNDERWRITING 类型规则集） ——
const underwritingRuleSets = ref<RuleSet[]>([])
const ruleSetLoading = ref(false)

const addRequiredDocument = () => form.value.underwritingConfig.requiredDocuments.push('')
const removeRequiredDocument = (index: number) =>
  form.value.underwritingConfig.requiredDocuments.splice(index, 1)
const removeClauseRel = (index: number) => clauseRels.value.splice(index, 1)

/** 详情原始载荷 → 修订表单预填 */
const prefillForm = (raw: Record<string, any>) => {
  const uw = raw.underwritingConfig ?? {}
  const ins = raw.insureCondition ?? {}
  const pr = raw.pricingBasicRule ?? {}
  form.value = {
    newProductName: raw.productName ?? '',
    newProductDesc: raw.productDesc ?? '',
    insureCondition: {
      minAge: ins.minAge,
      maxAge: ins.maxAge,
      minInsuredAmount: ins.minInsuredAmount != null ? Number(ins.minInsuredAmount) : undefined,
      maxInsuredAmount: ins.maxInsuredAmount != null ? Number(ins.maxInsuredAmount) : undefined,
      waitingPeriodDays: ins.waitingPeriodDays,
      hesitationPeriodDays: ins.hesitationPeriodDays,
      healthNotice: ins.healthNotice ?? '',
    },
    underwritingConfig: {
      underwritingMode: uw.underwritingMode ?? 'SMART',
      autoApprovalCondition: uw.autoApprovalCondition ?? '',
      manualReviewAmountThreshold:
        uw.manualReviewAmountThreshold != null ? Number(uw.manualReviewAmountThreshold) : undefined,
      requiredDocuments: [...(uw.requiredDocuments ?? [])],
      underwritingSLADays: uw.underwritingSLADays,
      surchargeAcceptable: uw.surchargeAcceptable ?? false,
      specialAgreementAcceptable: uw.specialAgreementAcceptable ?? false,
      ruleSetCode: uw.ruleSetCode,
    },
    pricingMode: pr.pricingMode ?? raw.pricingMode ?? 'RATE_TABLE',
    pricingBasicRule: {
      baseRate: pr.baseRate != null ? Number(pr.baseRate) : undefined,
      minPremium: pr.minPremium != null ? Number(pr.minPremium) : undefined,
      maxPremium: pr.maxPremium != null ? Number(pr.maxPremium) : undefined,
    },
  }
}

/** 组装修订载荷：表单编辑字段 + 原始载荷未暴露字段原样带出 */
const buildPayload = (): Record<string, unknown> => {
  const raw = detail.value!
  const ins = raw.insureCondition ?? {}
  const pr = raw.pricingBasicRule ?? {}
  return {
    newProductName: form.value.newProductName,
    newProductDesc: form.value.newProductDesc,
    // 形态/险种/类别随修订继承（不可在修订页变更）
    newForm: raw.form,
    newInsuranceType: raw.insuranceType,
    newCategory: raw.category,
    // 投保条件：原始响应字段为基线，表单编辑字段覆盖
    newInsureCondition: {
      ...ins,
      minAge: form.value.insureCondition.minAge,
      maxAge: form.value.insureCondition.maxAge,
      minInsuredAmount: form.value.insureCondition.minInsuredAmount,
      maxInsuredAmount: form.value.insureCondition.maxInsuredAmount,
      waitingPeriodDays: form.value.insureCondition.waitingPeriodDays,
      hesitationPeriodDays: form.value.insureCondition.hesitationPeriodDays,
      healthNotice: form.value.insureCondition.healthNotice,
    },
    // 保障期间/缴费/出单/保单形态：原始载荷原样带出（修订未提供编辑入口）
    newCoveragePeriod: raw.coveragePeriod,
    newPaymentConfig: raw.paymentConfig,
    newIssuanceProcessConfig: raw.issuanceProcessConfig,
    newPolicyFormConfig: raw.policyFormConfig,
    // 定价基础规则：原始响应字段为基线，表单编辑字段覆盖
    newPricingBasicRule: {
      ...pr,
      baseRate: form.value.pricingBasicRule.baseRate,
      minPremium: form.value.pricingBasicRule.minPremium,
      maxPremium: form.value.pricingBasicRule.maxPremium,
    },
    // 费率表引用/精算基础：由定价规则响应合并字段（clauseId/tableCode/tableVersion 与精算参数）重组
    newRateTableRef: pr.tableCode
      ? { clauseId: pr.clauseId, tableCode: pr.tableCode, version: pr.tableVersion }
      : undefined,
    newActuarialBasis:
      pr.predefinedInterestRate != null
        ? {
            predefinedInterestRate: pr.predefinedInterestRate,
            mortalityTableRef: pr.mortalityTableRef,
            expenseLoadingRate: pr.expenseLoadingRate,
          }
        : undefined,
    newUnderwritingConfig: {
      underwritingMode: form.value.underwritingConfig.underwritingMode,
      autoApprovalCondition: form.value.underwritingConfig.autoApprovalCondition || undefined,
      manualReviewAmountThreshold: form.value.underwritingConfig.manualReviewAmountThreshold,
      requiredDocuments: form.value.underwritingConfig.requiredDocuments,
      underwritingSLADays: form.value.underwritingConfig.underwritingSLADays,
      surchargeAcceptable: form.value.underwritingConfig.surchargeAcceptable,
      specialAgreementAcceptable: form.value.underwritingConfig.specialAgreementAcceptable,
      ruleSetCode: form.value.underwritingConfig.ruleSetCode,
    },
    newPricingMode: form.value.pricingMode,
    // 条款关联：当前绑定（可移除）三元组
    newClauseRels: clauseRels.value.map((rel) => ({
      clauseId: rel.clauseId,
      clauseVersion: rel.clauseVersion,
      isMainClause: rel.isMainClause ?? false,
    })),
  }
}

const handleSubmit = async () => {
  // 三处表单逐一校验（rules 按表单分组），任一不过即停在原地，错误已由 EP 落到具体字段
  for (const formRef of [baseFormRef, insureFormRef, pricingFormRef]) {
    if (!(await formRef.value?.validate().then(() => true).catch(() => false))) return
  }
  submitting.value = true
  try {
    const newProductId = await reviseProduct(route.params.id as string, buildPayload())
    ElMessage.success(`修订成功，新版本产品ID：${newProductId}`)
    router.replace(`/product/detail/${newProductId}`)
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  const id = route.params.id as string
  loading.value = true
  try {
    detail.value = await getProductDetailRaw(id)
    if (detail.value?.status !== 'EFFECTIVE') {
      ElMessage.warning(`仅生效中产品可修订（当前状态：${detail.value?.status ?? '未知'}）`)
      router.replace(`/product/detail/${id}`)
      return
    }
    prefillForm(detail.value)
    clauseRels.value = (await getProductClauses(id)).map((rel) => ({
      clauseId: rel.clauseId,
      clauseVersion: rel.clauseVersion,
      isMainClause: rel.mainClause ?? false,
    }))
  } finally {
    loading.value = false
  }
  // 核保规则集独立加载，失败不阻断修订表单
  ruleSetLoading.value = true
  listRuleSets('UNDERWRITING')
    .then((res) => (underwritingRuleSets.value = res.list ?? []))
    .catch(() => {})
    .finally(() => (ruleSetLoading.value = false))
})
</script>

<style scoped lang="scss">
.readonly-field {
  color: $text-regular;
}

.revise-note {
  margin: 10px 0 0;
  color: $text-secondary;
  font-size: 12px;
}

.revise-footer {
  margin-top: 24px;
}
</style>
