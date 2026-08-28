<template>
  <!-- 产品模板行为配置编辑器（出单/保全/理赔/缴费/再保/分红 + 寿险保额规格） -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <div class="config-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>产品配置</h3>
        <span v-if="product" class="config-header__meta">
          {{ product.name }} · {{ product.code }} · 模板 {{ templateId || '-' }}
        </span>
      </div>

      <el-alert
        v-if="!templateId && !loading"
        title="该产品未关联产品模板，无法配置行为规则。请先在产品创建时绑定模板。"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      />

      <el-tabs v-else v-model="activeTab" class="config-tabs">
        <!-- 出单配置 -->
        <el-tab-pane label="出单配置" name="issuance">
          <el-form label-width="140px" style="max-width: 640px">
            <el-form-item label="出单模式">
              <TiDictSelect v-model="templateForm.issuanceMode" dict-type="ISSUANCE_MODE" placeholder="选择出单模式" style="width: 360px" />
            </el-form-item>
            <el-form-item label="模板名称">
              <el-input v-model="templateForm.templateName" placeholder="模板名称" style="width: 360px" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 保全配置（可支持保全项） -->
        <el-tab-pane label="保全配置" name="maintenance">
          <el-form label-width="140px" style="max-width: 720px">
            <el-form-item label="可支持保全项">
              <TiDictSelect
                v-model="maintenanceForm.allowedTypes"
                dict-type="MAINTENANCE_TYPE"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                placeholder="选择该产品支持的保全类型"
                style="width: 520px"
              />
            </el-form-item>
            <el-form-item label="犹豫期(天)">
              <el-input-number v-model="maintenanceForm.freeLookPeriodDays" :min="0" :max="365" />
            </el-form-item>
            <el-form-item label="退保规则集">
              <el-input v-model="maintenanceForm.surrenderRuleSet" placeholder="退保规则集编码(可选)" style="width: 360px" />
            </el-form-item>
            <el-form-item label="批改规则集">
              <el-input v-model="maintenanceForm.endorsementRuleSet" placeholder="批改规则集编码(可选)" style="width: 360px" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 理赔配置 -->
        <el-tab-pane label="理赔配置" name="claim">
          <el-form label-width="140px" style="max-width: 720px">
            <el-form-item label="理赔阶段">
              <TiDictSelect
                v-model="claimForm.claimStages"
                dict-type="CLAIM_STAGE"
                multiple
                filterable
                allow-create
                default-first-option
                placeholder="选择或输入理赔阶段(有序)"
                style="width: 520px"
              />
            </el-form-item>
            <el-form-item label="报案时效(天)">
              <el-input-number v-model="claimForm.reportDeadlineDays" :min="0" :max="365" />
            </el-form-item>
            <el-form-item label="等待期(天)">
              <el-input-number v-model="claimForm.waitingPeriodDays" :min="0" :max="365" />
            </el-form-item>
            <el-form-item label="理赔规则集">
              <el-input v-model="claimForm.claimRuleSet" placeholder="理赔审核规则集编码(可选)" style="width: 360px" />
            </el-form-item>
            <el-form-item label="所需材料">
              <TiDictSelect
                v-model="claimForm.requiredDocuments"
                dict-type="CLAIM_DOCUMENT"
                multiple
                filterable
                allow-create
                default-first-option
                placeholder="选择或输入理赔所需材料"
                style="width: 520px"
              />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 缴费配置 -->
        <el-tab-pane label="缴费配置" name="billing">
          <el-form label-width="140px" style="max-width: 720px">
            <el-form-item label="允许缴费方式">
              <TiDictSelect v-model="billingForm.allowedPaymentModes" dict-type="PAYMENT_FREQUENCY" multiple placeholder="选择允许的缴费频率" style="width: 520px" />
            </el-form-item>
            <el-form-item label="宽限期(天)">
              <el-input-number v-model="billingForm.gracePeriodDays" :min="0" :max="365" />
            </el-form-item>
            <el-form-item label="失效天数">
              <el-input-number v-model="billingForm.lapseAfterDays" :min="0" :max="365" />
              <span style="margin-left: 8px; color: #909399">宽限期后多少天失效</span>
            </el-form-item>
            <el-form-item label="自动扣款">
              <el-switch v-model="billingForm.autoDeductEnabled" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 再保配置 -->
        <el-tab-pane label="再保配置" name="reinsurance">
          <el-form label-width="140px" style="max-width: 640px">
            <el-form-item label="自动分保">
              <el-switch v-model="reinsuranceForm.autoReinsurance" />
            </el-form-item>
            <el-form-item label="自留保额上限">
              <el-input-number v-model="reinsuranceForm.retentionLimit" :min="0" :precision="2" :step="10000" style="width: 220px" />
              <span style="margin-left: 8px; color: #909399">元</span>
            </el-form-item>
            <el-form-item label="默认再保合约">
              <el-input v-model="reinsuranceForm.defaultContractCode" placeholder="再保合约编码(可选)" style="width: 360px" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 分红配置（分红险专属） -->
        <el-tab-pane label="分红配置" name="dividend">
          <el-alert
            title="分红配置仅对分红险(PARTICIPATING)/万能险生效，其余险种可留空。三档演示利率须满足 低≤中≤高。"
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: 16px"
          />
          <el-form label-width="140px" style="max-width: 640px">
            <el-form-item label="红利分配方式">
              <TiDictSelect v-model="dividendForm.distribution" dict-type="DIVIDEND_DISTRIBUTION" placeholder="选择红利分配方式" style="width: 360px" />
            </el-form-item>
            <el-form-item label="低档演示利率">
              <el-input-number v-model="dividendForm.lowDemoRate" :min="0" :max="1" :precision="4" :step="0.005" />
              <span style="margin-left: 8px; color: #909399">如 0.015 表示 1.5%</span>
            </el-form-item>
            <el-form-item label="中档演示利率">
              <el-input-number v-model="dividendForm.midDemoRate" :min="0" :max="1" :precision="4" :step="0.005" />
            </el-form-item>
            <el-form-item label="高档演示利率">
              <el-input-number v-model="dividendForm.highDemoRate" :min="0" :max="1" :precision="4" :step="0.005" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 保额管理 / 寿险规格（寿险线专属，独立 life-config 端点） -->
        <el-tab-pane v-if="isLifeLine" label="保额管理(寿险规格)" name="lifeSpec">
          <el-alert
            title="寿险规格独立保存至产品的 life-config：定义投保年龄区间、基本保额区间及缴费期/保障期选项。"
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: 16px"
          />
          <el-form label-width="140px" style="max-width: 760px">
            <el-form-item label="险种三级分类">
              <TiDictSelect v-model="lifeForm.productType" dict-type="LIFE_PRODUCT_TYPE" placeholder="定期寿/终身寿/两全/年金" style="width: 260px" />
            </el-form-item>
            <el-form-item label="投保年龄区间">
              <el-input-number v-model="lifeForm.minAge" :min="0" :max="120" placeholder="最小" />
              <span style="margin: 0 8px">至</span>
              <el-input-number v-model="lifeForm.maxAge" :min="0" :max="120" placeholder="最大" />
              <span style="margin-left: 8px; color: #909399">周岁</span>
            </el-form-item>
            <el-form-item label="基本保额区间">
              <el-input-number v-model="lifeForm.minSumInsured" :min="0" :precision="2" :step="10000" placeholder="最低" />
              <span style="margin: 0 8px">至</span>
              <el-input-number v-model="lifeForm.maxSumInsured" :min="0" :precision="2" :step="10000" placeholder="最高" />
              <span style="margin-left: 8px; color: #909399">元</span>
            </el-form-item>

            <el-divider content-position="left">缴费期选项</el-divider>
            <el-table :data="lifeForm.premiumTermOptions" size="small" border style="width: 100%">
              <el-table-column label="缴费年数" width="140">
                <template #default="{ row }">
                  <el-input-number v-model="row.years" :min="0" size="small" controls-position="right" style="width: 110px" />
                </template>
              </el-table-column>
              <el-table-column label="缴至年龄" width="140">
                <template #default="{ row }">
                  <el-input-number v-model="row.toAge" :min="0" :max="120" size="small" controls-position="right" style="width: 110px" />
                </template>
              </el-table-column>
              <el-table-column label="描述" min-width="200">
                <template #default="{ row }">
                  <el-input v-model="row.description" placeholder="如 趸缴/20年缴/缴至60岁" size="small" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="70" align="center">
                <template #default="{ $index }">
                  <el-button link type="danger" size="small" @click="lifeForm.premiumTermOptions.splice($index, 1)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-button link type="primary" style="margin-top: 8px" @click="addPremiumTerm">+ 添加缴费期</el-button>

            <el-divider content-position="left">保障期选项</el-divider>
            <el-table :data="lifeForm.coverageTermOptions" size="small" border style="width: 100%">
              <el-table-column label="保障年数" width="140">
                <template #default="{ row }">
                  <el-input-number v-model="row.years" :min="0" size="small" controls-position="right" style="width: 110px" />
                </template>
              </el-table-column>
              <el-table-column label="保至年龄" width="140">
                <template #default="{ row }">
                  <el-input-number v-model="row.toAge" :min="0" :max="120" size="small" controls-position="right" style="width: 110px" />
                </template>
              </el-table-column>
              <el-table-column label="终身" width="70" align="center">
                <template #default="{ row }">
                  <el-switch v-model="row.wholeLife" />
                </template>
              </el-table-column>
              <el-table-column label="描述" min-width="180">
                <template #default="{ row }">
                  <el-input v-model="row.description" placeholder="如 保20年/保至70岁/终身" size="small" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="70" align="center">
                <template #default="{ $index }">
                  <el-button link type="danger" size="small" @click="lifeForm.coverageTermOptions.splice($index, 1)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-button link type="primary" style="margin-top: 8px" @click="addCoverageTerm">+ 添加保障期</el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <div v-if="templateId" class="config-footer">
        <el-button type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
        <el-button @click="$router.back()">取消</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import {
  getProductDetail,
  getTemplate,
  updateTemplate,
  configureLifeProduct,
  getLifeProductConfig,
  type UpdateTemplateForm,
} from '@/api/product'
import type { ProductDetailVO } from '@/types/business.d'
import TiDictSelect from '@/components/TiDictSelect/index.vue'

const route = useRoute()
const loading = ref(false)
const saving = ref(false)
const activeTab = ref('issuance')

const product = ref<ProductDetailVO | null>(null)
const templateId = ref<string>('')

// 寿险线：展示「保额管理/寿险规格」页签（命中不同的 life-config 端点）
const LIFE_LINES = ['LIFE', 'ANNUITY', 'UNIVERSAL', 'PARTICIPATING', 'INVESTMENT_LINKED']
const isLifeLine = computed(() => !!product.value?.insuranceType && LIFE_LINES.includes(product.value.insuranceType))

// ===== 表单模型 =====
const templateForm = reactive<{ templateName?: string; issuanceMode?: string }>({})
const maintenanceForm = reactive<{
  allowedTypes: string[]
  freeLookPeriodDays?: number
  surrenderRuleSet?: string
  endorsementRuleSet?: string
}>({ allowedTypes: [], freeLookPeriodDays: 0 })
const claimForm = reactive<{
  claimStages: string[]
  reportDeadlineDays?: number
  waitingPeriodDays?: number
  claimRuleSet?: string
  requiredDocuments: string[]
}>({ claimStages: [], requiredDocuments: [], reportDeadlineDays: 0, waitingPeriodDays: 0 })
const billingForm = reactive<{
  allowedPaymentModes: string[]
  gracePeriodDays?: number
  lapseAfterDays?: number
  autoDeductEnabled: boolean
}>({ allowedPaymentModes: [], gracePeriodDays: 0, lapseAfterDays: 0, autoDeductEnabled: false })
const reinsuranceForm = reactive<{
  autoReinsurance: boolean
  retentionLimit?: number
  defaultContractCode?: string
}>({ autoReinsurance: false })
const dividendForm = reactive<{
  distribution?: string
  lowDemoRate?: number
  midDemoRate?: number
  highDemoRate?: number
}>({})
const lifeForm = reactive<{
  productType?: string
  minAge?: number
  maxAge?: number
  minSumInsured?: number
  maxSumInsured?: number
  premiumTermOptions: { years: number; toAge?: number; description?: string }[]
  coverageTermOptions: { years: number; toAge?: number; wholeLife?: boolean; description?: string }[]
}>({ premiumTermOptions: [], coverageTermOptions: [] })

function addPremiumTerm() {
  lifeForm.premiumTermOptions.push({ years: 0, toAge: undefined, description: '' })
}
function addCoverageTerm() {
  lifeForm.coverageTermOptions.push({ years: 0, toAge: undefined, wholeLife: false, description: '' })
}

// ===== 预填：加载模板当前配置 =====
async function prefillFromTemplate(id: string) {
  const tpl = await getTemplate(id).catch(() => null)
  if (!tpl) return
  templateForm.templateName = tpl.templateName
  templateForm.issuanceMode = tpl.issuanceMode
  if (tpl.maintenanceConfig) {
    maintenanceForm.allowedTypes = tpl.maintenanceConfig.allowedTypes ?? []
    maintenanceForm.freeLookPeriodDays = tpl.maintenanceConfig.freeLookPeriodDays ?? 0
    maintenanceForm.surrenderRuleSet = tpl.maintenanceConfig.surrenderRuleSet
    maintenanceForm.endorsementRuleSet = tpl.maintenanceConfig.endorsementRuleSet
  }
  if (tpl.claimConfig) {
    claimForm.claimStages = tpl.claimConfig.claimStages ?? []
    claimForm.reportDeadlineDays = tpl.claimConfig.reportDeadlineDays ?? 0
    claimForm.waitingPeriodDays = tpl.claimConfig.waitingPeriodDays ?? 0
    claimForm.claimRuleSet = tpl.claimConfig.claimRuleSet
    claimForm.requiredDocuments = tpl.claimConfig.requiredDocuments ?? []
  }
  if (tpl.billingConfig) {
    billingForm.allowedPaymentModes = tpl.billingConfig.allowedPaymentModes ?? []
    billingForm.gracePeriodDays = tpl.billingConfig.gracePeriodDays ?? 0
    billingForm.lapseAfterDays = tpl.billingConfig.lapseAfterDays ?? 0
    billingForm.autoDeductEnabled = tpl.billingConfig.autoDeductEnabled ?? false
  }
  if (tpl.reinsuranceConfig) {
    reinsuranceForm.autoReinsurance = tpl.reinsuranceConfig.autoReinsurance ?? false
    reinsuranceForm.retentionLimit = tpl.reinsuranceConfig.retentionLimit
    reinsuranceForm.defaultContractCode = tpl.reinsuranceConfig.defaultContractCode
  }
  if (tpl.dividendConfig) {
    dividendForm.distribution = tpl.dividendConfig.distribution
    dividendForm.lowDemoRate = tpl.dividendConfig.lowDemoRate
    dividendForm.midDemoRate = tpl.dividendConfig.midDemoRate
    dividendForm.highDemoRate = tpl.dividendConfig.highDemoRate
  }
}

// ===== 预填：加载寿险规格（按产品维度） =====
async function prefillLifeSpec(productId: string) {
  const spec = await getLifeProductConfig(productId).catch(() => null)
  if (!spec) return
  lifeForm.productType = spec.productType
  lifeForm.minAge = spec.entryAgeRange?.minAge
  lifeForm.maxAge = spec.entryAgeRange?.maxAge
  lifeForm.minSumInsured = spec.sumInsuredRange?.minSumInsured
  lifeForm.maxSumInsured = spec.sumInsuredRange?.maxSumInsured
  lifeForm.premiumTermOptions = (spec.premiumTermOptions ?? []).map((o) => ({
    years: o.years,
    toAge: o.toAge,
    description: o.description,
  }))
  lifeForm.coverageTermOptions = (spec.coverageTermOptions ?? []).map((o) => ({
    years: o.years,
    toAge: o.toAge,
    wholeLife: o.wholeLife,
    description: o.description,
  }))
}

onMounted(async () => {
  const productId = route.params.id as string
  loading.value = true
  try {
    product.value = await getProductDetail(productId)
    templateId.value = product.value?.templateId ?? ''
    if (templateId.value) await prefillFromTemplate(templateId.value)
    if (isLifeLine.value) await prefillLifeSpec(productId)
  } catch {
    ElMessage.error('加载产品配置失败')
  } finally {
    loading.value = false
  }
})

// 空字符串归一化为 undefined（避免下发空串覆盖）
const orUndef = (v?: string) => (v && v.trim() ? v.trim() : undefined)

async function handleSave() {
  if (!templateId.value) return
  saving.value = true
  try {
    // 组装模板行为配置载荷（仅承载本编辑器覆盖的字段，其余由聚合根保留原值）
    const payload: UpdateTemplateForm = {
      templateName: orUndef(templateForm.templateName),
      issuanceMode: templateForm.issuanceMode,
      maintenanceConfig: {
        allowedTypes: maintenanceForm.allowedTypes,
        freeLookPeriodDays: maintenanceForm.freeLookPeriodDays ?? 0,
        surrenderRuleSet: orUndef(maintenanceForm.surrenderRuleSet),
        endorsementRuleSet: orUndef(maintenanceForm.endorsementRuleSet),
      },
      claimConfig: {
        claimStages: claimForm.claimStages,
        reportDeadlineDays: claimForm.reportDeadlineDays ?? 0,
        waitingPeriodDays: claimForm.waitingPeriodDays ?? 0,
        claimRuleSet: orUndef(claimForm.claimRuleSet),
        requiredDocuments: claimForm.requiredDocuments,
      },
      billingConfig: {
        allowedPaymentModes: billingForm.allowedPaymentModes,
        gracePeriodDays: billingForm.gracePeriodDays ?? 0,
        lapseAfterDays: billingForm.lapseAfterDays ?? 0,
        autoDeductEnabled: billingForm.autoDeductEnabled,
      },
      reinsuranceConfig: {
        autoReinsurance: reinsuranceForm.autoReinsurance,
        retentionLimit: reinsuranceForm.retentionLimit,
        defaultContractCode: orUndef(reinsuranceForm.defaultContractCode),
      },
    }
    // 分红配置：仅在选择了分配方式时下发（避免空分红覆盖非分红险）
    if (dividendForm.distribution) {
      if (!isDividendMonotonic()) {
        ElMessage.warning('演示利率须满足 低档 ≤ 中档 ≤ 高档')
        saving.value = false
        activeTab.value = 'dividend'
        return
      }
      payload.dividendConfig = {
        distribution: dividendForm.distribution as NonNullable<UpdateTemplateForm['dividendConfig']>['distribution'],
        lowDemoRate: dividendForm.lowDemoRate,
        midDemoRate: dividendForm.midDemoRate,
        highDemoRate: dividendForm.highDemoRate,
      }
    }

    await updateTemplate(templateId.value, payload)

    // 寿险规格独立保存（仅寿险线且填写了年龄/保额区间时）
    if (isLifeLine.value && lifeSpecFilled()) {
      await configureLifeProduct(route.params.id as string, {
        productType: lifeForm.productType,
        entryAgeRange: { minAge: lifeForm.minAge!, maxAge: lifeForm.maxAge! },
        sumInsuredRange: { minSumInsured: lifeForm.minSumInsured!, maxSumInsured: lifeForm.maxSumInsured! },
        premiumTermOptions: lifeForm.premiumTermOptions.map((o) => ({
          years: o.years ?? 0,
          toAge: o.toAge,
          description: orUndef(o.description),
        })),
        coverageTermOptions: lifeForm.coverageTermOptions.map((o) => ({
          years: o.years ?? 0,
          toAge: o.toAge,
          wholeLife: o.wholeLife ?? false,
          description: orUndef(o.description),
        })),
      })
    }

    ElMessage.success('配置保存成功')
  } finally {
    saving.value = false
  }
}

function isDividendMonotonic(): boolean {
  const { lowDemoRate: lo, midDemoRate: mid, highDemoRate: hi } = dividendForm
  if (lo == null || mid == null || hi == null) return true
  return lo <= mid && mid <= hi
}

// 寿险规格是否已填写核心边界（年龄+保额区间齐备才下发，避免后端区间校验失败）
function lifeSpecFilled(): boolean {
  return (
    lifeForm.minAge != null &&
    lifeForm.maxAge != null &&
    lifeForm.minSumInsured != null &&
    lifeForm.maxSumInsured != null
  )
}
</script>

<style scoped lang="scss">
.config-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;

  h3 {
    margin: 0;
    font-size: 18px;
  }

  &__meta {
    color: #909399;
    font-size: 13px;
  }
}

.config-tabs {
  min-height: 320px;
}

.config-footer {
  display: flex;
  gap: 12px;
  padding-top: 16px;
  margin-top: 8px;
  border-top: 1px solid $border-color;
}
</style>
