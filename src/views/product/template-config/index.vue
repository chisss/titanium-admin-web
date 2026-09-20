<template>
  <!-- 产品模板行为配置编辑器（出单/保全/理赔/缴费/再保/分红 + 寿险保额规格） -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <TiDetailHeader title="产品配置">
        <template #meta>
          <span v-if="product" class="config-meta">
            {{ product.name }} · {{ product.code }} · 模板 {{ templateId || '-' }}
          </span>
        </template>
      </TiDetailHeader>

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
          <el-form label-width="140px" class="ti-form-width--standard">
            <el-form-item label="出单模式">
              <TiDictSelect v-model="templateForm.issuanceMode" dict-type="ISSUANCE_MODE" placeholder="选择出单模式" style="width: 360px" />
            </el-form-item>
            <el-form-item label="模板名称">
              <el-input v-model="templateForm.templateName" placeholder="模板名称" style="width: 360px" />
            </el-form-item>
          </el-form>
          <el-alert
            v-if="definition"
            type="info"
            :closable="false"
            style="margin-top: 16px"
            class="ti-form-width--standard"
            :title="`标的类型：${definition.subjectType} · 默认定价：${definition.defaultPricingMode}`"
          >
            <template #default>
              必填标的字段：{{ definition.requiredSubjectFields.join('、') || '无' }}
              <span style="margin-left: 16px">默认责任：{{ definition.defaultCoverageCodes.join('、') || '无' }}</span>
            </template>
          </el-alert>
        </el-tab-pane>

        <!-- 保全配置（可支持保全项） -->
        <el-tab-pane label="保全配置" name="maintenance">
          <el-form label-width="140px" class="ti-form-width--wide">
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
            <el-form-item>
              <!-- 术语说明：退保的业务含义（依据保全域 RefundType 与「保单终止」结算规则） -->
              <template #label>
                <span class="config-form__label">
                  退保规则集
                  <el-tooltip
                    placement="top"
                    content="退保：保单生效后提前终止合同并退还保费。犹豫期内全额退还已缴保费，犹豫期外退还保单现金价值（对应保全类型「保单终止」，走现金价值结算）。"
                  >
                    <el-icon class="config-form__help"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </span>
              </template>
              <el-select
                v-model="maintenanceForm.surrenderRuleSet"
                placeholder="选择退保结算使用的规则集（可不选）"
                filterable
                clearable
                :loading="ruleSetLoading"
                no-data-text="暂无保全规则集，请先到规则引擎创建"
                style="width: 360px"
              >
                <el-option
                  v-for="rs in maintenanceRuleSets"
                  :key="rs.ruleSetCode"
                  :label="`${rs.ruleSetName}（${rs.ruleSetCode}）`"
                  :value="rs.ruleSetCode"
                />
              </el-select>
              <!-- 新开标签页：本页是填了一半的大表单，跳走会丢失全部输入 -->
              <el-button link type="primary" :icon="Plus" class="config-form__inline-action" @click="openRuleSetPage">
                新建规则集
              </el-button>
            </el-form-item>
            <el-form-item>
              <!-- 术语说明：批改的业务含义（依据保全域批单 EndorsementDocument 与 MAINTENANCE_TYPE 字典） -->
              <template #label>
                <span class="config-form__label">
                  批改规则集
                  <el-tooltip
                    placement="top"
                    content="批改（endorsement）：保单生效后对保单内容的变更，如投保人/受益人变更、缴费方式变更、保额或保险期间调整。保全案件生效后由保全域出具批单留痕，与「退保」并列同属保全业务。"
                  >
                    <el-icon class="config-form__help"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </span>
              </template>
              <el-select
                v-model="maintenanceForm.endorsementRuleSet"
                placeholder="选择批改审核使用的规则集（可不选）"
                filterable
                clearable
                :loading="ruleSetLoading"
                no-data-text="暂无保全规则集，请先到规则引擎创建"
                style="width: 360px"
              >
                <el-option
                  v-for="rs in maintenanceRuleSets"
                  :key="rs.ruleSetCode"
                  :label="`${rs.ruleSetName}（${rs.ruleSetCode}）`"
                  :value="rs.ruleSetCode"
                />
              </el-select>
              <el-button link type="primary" :icon="Plus" class="config-form__inline-action" @click="openRuleSetPage">
                新建规则集
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 理赔配置 -->
        <el-tab-pane label="理赔配置" name="claim">
          <el-form label-width="140px" class="ti-form-width--wide">
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
              <!-- 与退保/批改同理：规则集编码只能取自规则引擎里既有的理赔类规则集，不允许手打 -->
              <el-select
                v-model="claimForm.claimRuleSet"
                placeholder="选择理赔审核使用的规则集（可不选）"
                filterable
                clearable
                :loading="ruleSetLoading"
                no-data-text="暂无理赔规则集，请先到规则引擎创建"
                style="width: 360px"
              >
                <el-option
                  v-for="rs in claimRuleSets"
                  :key="rs.ruleSetCode"
                  :label="`${rs.ruleSetName}（${rs.ruleSetCode}）`"
                  :value="rs.ruleSetCode"
                />
              </el-select>
              <el-button link type="primary" :icon="Plus" class="config-form__inline-action" @click="openRuleSetPage">
                新建规则集
              </el-button>
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
          <el-form label-width="140px" class="ti-form-width--wide">
            <el-form-item label="允许缴费方式">
              <TiDictSelect v-model="billingForm.allowedPaymentModes" dict-type="PAYMENT_FREQUENCY" multiple placeholder="选择允许的缴费频率" style="width: 520px" />
            </el-form-item>
            <el-form-item label="宽限期(天)">
              <el-input-number v-model="billingForm.gracePeriodDays" :min="0" :max="365" />
            </el-form-item>
            <el-form-item label="失效天数">
              <el-input-number v-model="billingForm.lapseAfterDays" :min="0" :max="365" />
              <span style="margin-left: 8px; color: var(--el-text-color-secondary)">宽限期后多少天失效</span>
            </el-form-item>
            <el-form-item label="自动扣款">
              <el-switch v-model="billingForm.autoDeductEnabled" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 再保配置 -->
        <el-tab-pane label="再保配置" name="reinsurance">
          <el-form label-width="140px" class="ti-form-width--standard">
            <el-form-item label="自动分保">
              <el-switch v-model="reinsuranceForm.autoReinsurance" />
            </el-form-item>
            <el-form-item label="自留保额上限">
              <el-input-number v-model="reinsuranceForm.retentionLimit" :min="0" :precision="2" :step="10000" style="width: 220px" />
              <span style="margin-left: 8px; color: var(--el-text-color-secondary)">元</span>
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
          <el-form ref="dividendFormRef" :model="dividendForm" :rules="dividendRules" label-width="140px" class="ti-form-width--standard">
            <el-form-item label="红利分配方式">
              <TiDictSelect v-model="dividendForm.distribution" dict-type="DIVIDEND_DISTRIBUTION" placeholder="选择红利分配方式" style="width: 360px" />
            </el-form-item>
            <el-form-item label="低档演示利率">
              <el-input-number v-model="dividendForm.lowDemoRate" :min="0" :max="1" :precision="4" :step="0.005" />
              <span style="margin-left: 8px; color: var(--el-text-color-secondary)">如 0.015 表示 1.5%</span>
            </el-form-item>
            <el-form-item label="中档演示利率" prop="midDemoRate">
              <el-input-number v-model="dividendForm.midDemoRate" :min="0" :max="1" :precision="4" :step="0.005" />
            </el-form-item>
            <el-form-item label="高档演示利率" prop="highDemoRate">
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
          <el-form ref="lifeFormRef" :model="lifeForm" :rules="lifeRules" label-width="140px" class="ti-form-width--wide">
            <el-form-item label="险种三级分类">
              <TiDictSelect v-model="lifeForm.productType" dict-type="LIFE_PRODUCT_TYPE" placeholder="定期寿/终身寿/两全/年金" style="width: 260px" />
            </el-form-item>
            <el-form-item label="投保年龄区间" prop="minAge">
              <el-input-number v-model="lifeForm.minAge" :min="0" :max="120" placeholder="最小" />
              <span style="margin: 0 8px">至</span>
              <el-input-number v-model="lifeForm.maxAge" :min="0" :max="120" placeholder="最大" />
              <span style="margin-left: 8px; color: var(--el-text-color-secondary)">周岁</span>
            </el-form-item>
            <el-form-item label="基本保额区间" prop="maxSumInsured">
              <el-input-number v-model="lifeForm.minSumInsured" :min="0" :precision="2" :step="10000" placeholder="最低" />
              <span style="margin: 0 8px">至</span>
              <el-input-number v-model="lifeForm.maxSumInsured" :min="0" :precision="2" :step="10000" placeholder="最高" />
              <span style="margin-left: 8px; color: var(--el-text-color-secondary)">元</span>
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
              <el-table-column label="操作" width="100" align="center" class-name="ti-action-column">
                <template #default="{ $index }">
                  <el-button size="small" type="danger" :icon="Delete" @click="lifeForm.premiumTermOptions.splice($index, 1)">删除</el-button>
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
              <el-table-column label="操作" width="100" align="center" class-name="ti-action-column">
                <template #default="{ $index }">
                  <el-button size="small" type="danger" :icon="Delete" @click="lifeForm.coverageTermOptions.splice($index, 1)">删除</el-button>
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
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Delete, Plus, QuestionFilled } from '@element-plus/icons-vue'
import {
  getProductDetail,
  getTemplate,
  getInsuranceProductDefinitions,
  updateTemplate,
  configureLifeProduct,
  getLifeProductConfig,
  type UpdateTemplateForm,
  type InsuranceProductDefinitionVO,
} from '@/api/product'
import { listRuleSets, type RuleSet } from '@/api/rule-engine'
import type { ProductDetailVO } from '@/types/business.d'
import TiDetailHeader from '@/components/TiDetailHeader/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const activeTab = ref('issuance')

const product = ref<ProductDetailVO | null>(null)
const templateId = ref<string>('')
const definitions = ref<InsuranceProductDefinitionVO[]>([])
const definition = computed(() => definitions.value.find((item) => item.insuranceType === product.value?.insuranceType))

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

/**
 * 校验规则：**只覆盖真正存在非法值的字段**（分红三档利率、寿险年龄/保额区间）。
 *
 * 🔴 本页 7 个 `<el-form>` 原本**都没有 `:model`、零 rules、零 validate**，但那不等于
 * 7 个表单都缺校验——实读后只有这两处存在「能提交出非法/丢失数据」的字段：
 *  - 出单/保全/理赔/缴费/分保 五个表单：字段要么由字典下拉给定值域（选不出非法值），
 *    要么显式允许为空（`orUndef(templateName)` 把空串归化为 undefined、天数用 `?? 0` 兜底）。
 *    给它们加 required 会把**当前合法的空值判为非法**，属破坏性变更 —— 故不加。
 *  - 分红与寿险规格两处则确有缺陷，规则见下。
 */
const dividendFormRef = ref<FormInstance>()
const lifeFormRef = ref<FormInstance>()

/** 分红：三档演示利率须单调不减。原 `isDividendMonotonic()` 判断正确但只弹全局消息条，
 *  且页签在「分红」上时用户看不到是**哪一档**越界。拆到中/高档两个字段上，文案各自具体。 */
const dividendRules: FormRules = {
  midDemoRate: [{
    validator: (_r, v: number | undefined, cb) => (
      v != null && dividendForm.lowDemoRate != null && v < dividendForm.lowDemoRate
        ? cb(new Error('中档演示利率不得低于低档'))
        : cb()),
    trigger: 'change',
  }],
  highDemoRate: [{
    validator: (_r, v: number | undefined, cb) => (
      v != null && dividendForm.midDemoRate != null && v < dividendForm.midDemoRate
        ? cb(new Error('高档演示利率不得低于中档'))
        : cb()),
    trigger: 'change',
  }],
}

/**
 * 寿险规格：年龄与保额区间。
 * 🔴 `minAge` 上这条承载的是**齐备性**：原 `lifeSpecFilled()` 只判「四个值是否齐全」，
 * 不齐全就**静默不下发** —— 用户填了年龄、漏填保额，界面照样提示「配置保存成功」，
 * 输入被无声丢弃。这里把「填了一半」显式判为非法。挂在 minAge 是因为无论缺哪一个，
 * 全量 validate 都必然轮到它。
 */
const lifeRules: FormRules = {
  minAge: [{
    validator: (_r, _v: number | undefined, cb) => {
      const filled = [lifeForm.minAge, lifeForm.maxAge, lifeForm.minSumInsured, lifeForm.maxSumInsured]
        .filter((value) => value != null).length
      if (filled > 0 && filled < 4) return cb(new Error('年龄区间与保额区间须同时填写完整，否则不会保存'))
      cb()
    },
    trigger: 'change',
  }],
  maxSumInsured: [{
    validator: (_r, v: number | undefined, cb) => (
      v == null || lifeForm.minSumInsured == null || v >= lifeForm.minSumInsured
        ? cb()
        : cb(new Error('基本保额上限不得低于下限'))),
    trigger: 'change',
  }],
}

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

// ===== 规则集下拉：关联规则引擎里既有的规则集，不再让操作员手打编码 =====
//
// 「退保规则集」「批改规则集」原本是两个自由文本输入框，操作员可随便录任何文字，
// 录进去的编码在规则引擎里根本不存在 —— 配置看着填了、实际不生效。改为联动下拉：
// 值一律取自规则引擎里对应类型的规则集（RULE_SET_TYPE 字典：MAINTENANCE=保全 / CLAIM=理赔）。
// 🔴 退保与批改**共用一次保全类请求**（同一个列表渲染两处），不为两个下拉各发一次。
const maintenanceRuleSets = ref<RuleSet[]>([])
const claimRuleSets = ref<RuleSet[]>([])
const ruleSetLoading = ref(false)

/** 拉取一类规则集；失败显式告警——下拉为空与「规则引擎里确实没有该类规则集」必须可区分（处置不同） */
async function fetchRuleSets(type: 'MAINTENANCE' | 'CLAIM'): Promise<RuleSet[]> {
  try {
    const res = await listRuleSets(type)
    return res.list ?? []
  } catch {
    ElMessage.warning('规则集列表加载失败，可先到规则引擎创建后再回来选择')
    return []
  }
}

/** 保全类（退保/批改共用）与理赔类各取一次 */
async function loadRuleSets() {
  ruleSetLoading.value = true
  try {
    const [maintenance, claim] = await Promise.all([
      fetchRuleSets('MAINTENANCE'),
      fetchRuleSets('CLAIM'),
    ])
    maintenanceRuleSets.value = maintenance
    claimRuleSets.value = claim
  } finally {
    ruleSetLoading.value = false
  }
}

/**
 * 打开规则集管理页（新建规则集）。
 * 🔴 必须**新开标签页**：本页是填了一半的产品配置大表单，当前页跳走会丢失全部未保存输入。
 * 目标取路由名而非手写字符串（src/router/dynamicRoutes.ts 的 RuleSetList → /rule-engine/list）。
 */
function openRuleSetPage() {
  const { href } = router.resolve({ name: 'RuleSetList' })
  window.open(href, '_blank', 'noopener')
}

onMounted(async () => {
  const productId = route.params.id as string
  loading.value = true
  // 规则集下拉的数据源：与主配置并行加载（内部自带 loading 态与失败告警），不阻塞本页渲染
  loadRuleSets()
  // 险种默认定义仅用于渲染提示条，加载失败不得阻断产品配置主流程；
  // 但必须显式告警——静默吞（原 .catch(() => [])）会让提示条消失与「功能正常」在界面上无从区分
  try {
    definitions.value = await getInsuranceProductDefinitions()
  } catch {
    ElMessage.warning('险种默认定义加载失败，本次不显示默认值提示')
  }
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
  // 🔴 校验前置到 saving 置位之前：失败即 return，无需再把按钮从 loading 态手动复位
  //（原分红检查写在 saving 已置位之后，靠 `saving.value = false` 手工回滚）。
  // 页签切换只负责把用户带到看得见错误的地方——错误本身已由 el-form 落到具体字段。
  if (!(await dividendFormRef.value?.validate().then(() => true).catch(() => false))) {
    activeTab.value = 'dividend'
    return
  }
  if (isLifeLine.value && !(await lifeFormRef.value?.validate().then(() => true).catch(() => false))) {
    activeTab.value = 'lifeSpec'
    return
  }
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

// 寿险规格是否已填写核心边界（年龄+保额区间齐备才下发，避免后端区间校验失败）。
// 「填一半」的非法组合已在 lifeRules.minAge 拦下，故这里只需判「全空 ↦ 不下发」。
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
/* 头部副标题（产品名 · 编码 · 模板号）：地位同 TiDetailHeader 的 meta 插槽内容，故随头部一起迁出 */
.config-meta {
  color: $text-secondary;
  font-size: 13px;
}

/* 表单标签（术语 + 说明图标）：与 el-form-item 标签同处一行，垂直居中对齐 */
.config-form__label {
  display: inline-flex;
  align-items: center;
}

/* 术语说明图标：弱化为次要色，hover 提示由 el-tooltip 承载 */
.config-form__help {
  margin-left: $space-1;
  color: $text-secondary;
  cursor: help;
}

/* 「下拉 + 新建入口」成组：间距走令牌，不用内联 margin 字面量 */
.config-form__inline-action {
  margin-left: $space-3;
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
