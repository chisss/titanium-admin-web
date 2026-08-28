<template>
  <div class="ti-page">
    <div class="page-intro">
      <h2>定价包</h2>
      <p>将产品版本、费率表、规则工件、特征契约和回归用例绑定为可发布的保费计算配置。</p>
    </div>
    <div class="ti-toolbar">
      <el-form inline>
        <el-form-item label="产品">
          <el-select v-model="productId" filterable clearable placeholder="选择产品" style="width: 320px" @change="loadProductContext">
            <el-option v-for="product in products" :key="product.id" :label="`${product.name} (${product.code})`" :value="product.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态"><TiDictSelect v-model="status" dict-type="CONFIG_LIFECYCLE_STATUS" style="width: 140px" @change="loadPlans" /></el-form-item>
        <el-button type="primary" @click="loadPlans">查询</el-button>
      </el-form>
      <el-button type="primary" :disabled="!productId" v-permission="'product:pricing:create'" @click="openCreate">新建定价包</el-button>
    </div>
    <el-alert v-if="!productId" title="请选择产品，定价包必须挂在具体产品版本下。" type="info" :closable="false" />
    <el-table v-else v-loading="loading" :data="plans" border>
      <el-table-column prop="planVersion" label="定价包版本" width="120" />
      <el-table-column prop="productVersion" label="产品版本" width="110" />
      <el-table-column label="定价模式" width="130"><template #default="{ row }">{{ pricingModeLabel(row.pricingMode) }}</template></el-table-column>
      <el-table-column prop="currency" label="币种" width="90" />
      <el-table-column label="配置引用" min-width="230"><template #default="{ row }">{{ referenceLabel(row) }}</template></el-table-column>
      <el-table-column label="税费策略" min-width="210"><template #default="{ row }">{{ taxPolicyLabel(row) }}</template></el-table-column>
      <el-table-column label="渠道佣金" min-width="180"><template #default="{ row }">{{ commissionSchemeLabel(row) }}</template></el-table-column>
      <el-table-column label="动态因子" min-width="170"><template #default="{ row }">{{ dynamicFactorLabel(row) }}</template></el-table-column>
      <el-table-column label="费用模型" min-width="190"><template #default="{ row }">{{ calculationModelLabel(row) }}</template></el-table-column>
      <el-table-column label="状态" width="110"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
      <el-table-column label="测试用例" width="100"><template #default="{ row }">{{ row.testCases?.length || 0 }}</template></el-table-column>
      <el-table-column label="操作" :fixed="isNarrowScreen ? false : 'right'" width="380">
        <template #default="{ row }">
          <el-button v-if="row.status === 'DRAFT'" link v-permission="'product:pricing:edit'" @click="openTestCases(row)">维护用例</el-button>
          <el-button v-if="row.status === 'DRAFT'" link @click="approve(row)">审批</el-button>
          <el-button v-if="row.status === 'APPROVED'" link @click="runTests(row)">运行测试</el-button>
          <el-button v-if="row.status === 'APPROVED'" link type="success" v-permission="'product:pricing:publish'" @click="publish(row)">发布</el-button>
          <el-button v-if="row.status === 'PUBLISHED'" link type="danger" @click="retire(row)">退役</el-button>
          <el-button link @click="showDetail(row)">查看</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="当前产品暂无定价包"><el-button type="primary" v-permission="'product:pricing:create'" @click="openCreate">新建定价包</el-button></el-empty>
      </template>
    </el-table>

    <el-dialog v-model="createVisible" title="新建定价包草稿" width="min(760px, calc(100vw - 24px))">
      <el-form :model="form" :label-position="isNarrowScreen ? 'top' : 'right'" :label-width="isNarrowScreen ? 'auto' : '130px'">
        <el-form-item label="产品版本"><el-input v-model="form.productVersion" disabled /></el-form-item>
        <el-form-item label="定价包版本"><el-input v-model="form.planVersion" /></el-form-item>
        <el-form-item label="定价模式"><el-segmented v-model="form.pricingMode" :options="pricingModeOptions" @change="handlePricingModeChange" /></el-form-item>
        <el-form-item label="币种"><TiDictSelect v-model="form.currency" dict-type="CURRENCY" :clearable="false" filterable /></el-form-item>
        <el-form-item label="生效时间"><el-date-picker v-model="form.effectiveFrom" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
        <template v-if="form.pricingMode === 'RATE_TABLE'">
          <el-form-item label="已发布费率表">
            <el-select v-model="selectedRateTableId" filterable placeholder="选择费率表版本" style="width: 100%" @change="selectRateTable">
              <el-option v-for="table in rateTables" :key="table.tableId" :label="`${table.tableCode} / ${table.tableVersion} / ${table.currency}`" :value="table.tableId" />
            </el-select>
          </el-form-item>
          <el-form-item label="费率维度">
            <el-tag v-for="key in form.rateDimensionKeys" :key="key" class="dimension-tag">{{ dimensionLabel(key) }}</el-tag>
            <el-text v-if="!form.rateDimensionKeys.length" type="info">选择费率表后自动带出</el-text>
          </el-form-item>
        </template>
        <el-form-item :label="form.pricingMode === 'RATE_TABLE' ? '动态调整规则' : '已激活定价规则'">
          <el-select v-model="selectedRuleSetId" clearable filterable :placeholder="form.pricingMode === 'RATE_TABLE' ? '可选；用于动态因子调整基础保费' : '选择规则工件版本'" style="width: 100%" @change="selectRuleSet">
            <el-option v-for="ruleSet in activeRuleSets" :key="ruleSet.ruleSetId" :label="`${ruleSet.ruleSetName} (${ruleSet.ruleSetCode} / ${ruleSet.ruleSetVersion})`" :value="ruleSet.ruleSetId" />
          </el-select>
        </el-form-item>
        <template v-if="selectedRuleSetId">
          <el-form-item label="输入 Schema 版本"><el-input v-model="form.inputSchemaVersion" disabled /></el-form-item>
          <el-form-item label="规则工件哈希"><el-input v-model="form.artifactHash" disabled /></el-form-item>
        </template>
        <el-form-item label="费用计算模型">
          <el-select v-model="selectedCalculationModelId" clearable filterable placeholder="可选；未选择时兼容为单一基础保费" style="width: 100%" @change="selectCalculationModel">
            <el-option v-for="model in calculationModels" :key="model.modelId" :label="`${model.modelName} (${model.modelCode} / ${model.modelVersion})`" :value="model.modelId" />
          </el-select>
        </el-form-item>
        <el-form-item label="税费策略版本">
          <el-select v-model="selectedTaxPolicyIds" multiple filterable placeholder="可选；仅可引用已发布版本" style="width: 100%" @change="selectTaxPolicies">
            <el-option v-for="policy in taxPolicies" :key="policy.policyId" :label="`${policy.policyName} (${policy.policyCode} / ${policy.policyVersion})`" :value="policy.policyId" />
          </el-select>
          <div v-if="form.taxPolicyRefs.length" class="reference-hint">{{ form.taxPolicyRefs.map((item) => `${item.policyCode}/${item.policyVersion}`).join('、') }}，发布后按 hash 固定。</div>
        </el-form-item>
        <el-form-item label="佣金方案版本">
          <el-select v-model="selectedCommissionSchemeIds" multiple filterable placeholder="可选；按渠道引用已发布方案" style="width: 100%" @change="selectCommissionSchemes">
            <el-option v-for="scheme in commissionSchemes" :key="scheme.schemeId" :label="`${channelName(scheme.channelId)} / ${scheme.schemeName} (${scheme.schemeVersion})`" :value="scheme.schemeId" />
          </el-select>
          <div v-if="form.commissionSchemeRefs.length" class="reference-hint">{{ form.commissionSchemeRefs.map((item) => `${channelName(item.channelId)}:${item.schemeCode}/${item.schemeVersion}`).join('、') }}，佣金作为内部成本，不计入客户应付。</div>
        </el-form-item>
        <el-form-item label="动态因子版本">
          <el-select v-model="selectedDynamicFactorIds" multiple filterable placeholder="可选；自动生成特征契约" style="width: 100%" @change="selectDynamicFactors">
            <el-option v-for="factor in dynamicFactors" :key="factor.factorId" :label="`${factor.factorName} (${factor.factorCode} / ${factor.factorVersion})`" :value="factor.factorId" />
          </el-select>
          <div v-if="form.dynamicFactorRefs.length" class="reference-hint">{{ form.dynamicFactorRefs.map((item) => `${item.factorCode}/${item.factorVersion}`).join('、') }}，计算时从 Feature Center 快照取值。</div>
        </el-form-item>
        <el-form-item label="特征契约 JSON"><el-input v-model="form.featureContractText" type="textarea" :rows="5" placeholder='可选，如 {"contractId":"pricing","contractVersion":"V1.0","requirements":[]}' /></el-form-item>
        <el-form-item label="舍入位数"><el-input-number v-model="form.roundingScale" :min="0" :max="8" /></el-form-item>
        <el-form-item label="舍入模式"><TiDictSelect v-model="form.roundingMode" dict-type="ROUNDING_MODE" :clearable="false" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" @click="submitCreate">创建</el-button></template>
    </el-dialog>

    <el-dialog v-model="testCaseVisible" title="维护保费计算测试用例" width="min(1100px, calc(100vw - 24px))">
      <el-alert title="审批前至少维护一条测试用例；发布时系统会重新执行全部用例并要求全部通过。" type="info" :closable="false" class="test-alert" />
      <el-table :data="editingTestCases" border>
        <el-table-column label="编码" min-width="130"><template #default="{ row }"><el-input v-model="row.caseCode" /></template></el-table-column>
        <el-table-column label="业务时间" width="190"><template #default="{ row }"><el-date-picker v-model="row.businessTime" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></template></el-table-column>
        <el-table-column label="保额" width="140"><template #default="{ row }"><el-input-number v-model="row.sumInsured" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
        <el-table-column label="年龄" width="100"><template #default="{ row }"><el-input-number v-model="row.age" :min="0" :max="150" controls-position="right" /></template></el-table-column>
        <el-table-column label="性别" width="100"><template #default="{ row }"><TiDictSelect v-model="row.gender" dict-type="GENDER" :clearable="false" /></template></el-table-column>
        <el-table-column label="缴费期" width="105"><template #default="{ row }"><el-input-number v-model="row.paymentTermYears" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="保障期" width="105"><template #default="{ row }"><el-input-number v-model="row.coverageTermYears" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="缴费次数" width="105"><template #default="{ row }"><el-input-number v-model="row.paymentPeriods" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="佣金渠道" min-width="180"><template #default="{ row }"><el-select v-model="row.channelId" clearable placeholder="不计算佣金"><el-option v-for="reference in currentPlan?.commissionSchemeRefs || []" :key="reference.channelId" :label="channelName(reference.channelId)" :value="reference.channelId" /></el-select></template></el-table-column>
        <el-table-column label="保单年度" width="105"><template #default="{ row }"><el-input-number v-model="row.policyYear" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="预期保费" width="140"><template #default="{ row }"><el-input-number v-model="row.expectedPremium" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
        <el-table-column label="容差" width="120"><template #default="{ row }"><el-input-number v-model="row.tolerance" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
        <el-table-column label="操作" width="75"><template #default="{ $index }"><el-button link type="danger" @click="editingTestCases.splice($index, 1)">删除</el-button></template></el-table-column>
      </el-table>
      <el-button class="add-row" @click="editingTestCases.push(newTestCase())">新增用例</el-button>
      <template #footer><el-button @click="testCaseVisible = false">取消</el-button><el-button type="primary" @click="saveTestCases">保存测试用例</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="定价包详情" size="min(920px, 100vw)">
      <el-descriptions :column="isNarrowScreen ? 1 : 3" border>
        <el-descriptions-item label="定价包版本">{{ detail?.planVersion }}</el-descriptions-item>
        <el-descriptions-item label="产品版本">{{ detail?.productVersion }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusLabel(detail?.status || '') }}</el-descriptions-item>
        <el-descriptions-item label="定价模式">{{ pricingModeLabel(detail?.pricingMode || '') }}</el-descriptions-item>
        <el-descriptions-item label="配置引用" :span="2">{{ detail ? referenceLabel(detail) : '-' }}</el-descriptions-item>
        <el-descriptions-item label="税费策略精确引用" :span="3">
          <div v-if="detail?.taxPolicyRefs?.length" class="tax-reference-list">
            <div v-for="reference in detail.taxPolicyRefs" :key="`${reference.policyCode}-${reference.policyVersion}`">
              <strong>{{ reference.policyCode }}/{{ reference.policyVersion }}</strong>
              <span class="hash-text">{{ reference.contentHash }}</span>
            </div>
          </div>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="佣金方案精确引用" :span="3">
          <div v-if="detail?.commissionSchemeRefs?.length" class="tax-reference-list">
            <div v-for="reference in detail.commissionSchemeRefs" :key="`${reference.channelId}-${reference.schemeCode}-${reference.schemeVersion}`">
              <strong>{{ channelName(reference.channelId) }} · {{ reference.schemeCode }}/{{ reference.schemeVersion }}</strong>
              <span class="hash-text">{{ reference.contentHash }}</span>
            </div>
          </div>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="动态因子精确引用" :span="3">
          <div v-if="detail?.dynamicFactorRefs?.length" class="tax-reference-list">
            <div v-for="reference in detail.dynamicFactorRefs" :key="`${reference.factorCode}-${reference.factorVersion}`">
              <strong>{{ reference.factorCode }}/{{ reference.factorVersion }}</strong>
              <span class="hash-text">{{ reference.contentHash }}</span>
            </div>
          </div>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="费用模型" :span="2">{{ detail ? calculationModelLabel(detail) : '-' }}</el-descriptions-item>
        <el-descriptions-item label="币种">{{ detail?.currency }}</el-descriptions-item>
        <el-descriptions-item label="舍入规则">{{ roundingModeLabel(detail?.roundingMode || '') }} / {{ detail?.roundingScale }} 位</el-descriptions-item>
        <el-descriptions-item label="生效时间">{{ detail?.effectiveFrom }}</el-descriptions-item>
        <el-descriptions-item v-if="detail?.artifactHash" label="工件哈希" :span="3"><span class="hash-text">{{ detail.artifactHash }}</span></el-descriptions-item>
      </el-descriptions>
      <el-divider content-position="left">回归测试用例</el-divider>
      <el-table :data="detail?.testCases || []" border>
        <el-table-column prop="caseCode" label="编码" min-width="130" /><el-table-column prop="description" label="说明" min-width="180" /><el-table-column prop="sumInsured" label="保额" width="120" /><el-table-column prop="age" label="年龄" width="75" /><el-table-column label="性别" width="75"><template #default="{ row }">{{ genderLabel(row.gender) }}</template></el-table-column><el-table-column prop="expectedPremium" label="预期保费" width="120" /><el-table-column prop="tolerance" label="容差" width="90" />
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useMediaQuery } from '@vueuse/core'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'
import { getProductList } from '@/api/product'
import { getRuleSet, listRuleSets, type RuleSet } from '@/api/rule-engine'
import { listCalculationModels, listDynamicFactors, listTaxPolicies, type CalculationModel, type DynamicFactor, type TaxPolicy } from '@/api/actuarial'
import { getChannelList, getCommissionSchemeList, type ChannelVO, type CommissionScheme } from '@/api/channel'
import { approvePricingPlan, createPricingPlan, getPricingPlan, listPricingPlans, listRateTables, publishPricingPlan, replacePricingTestCases, retirePricingPlan, runPricingTests, type CommissionSchemeRef, type DynamicFactorRef, type PricingPlan, type PricingTestCase, type RateTable } from '@/api/pricing'
import type { ProductVO } from '@/types/business.d'

type EditablePricingTestCase = PricingTestCase & { channelId?: string; policyYear: number }
const productId = ref(''); const products = ref<ProductVO[]>([]); const status = ref(''); const plans = ref<PricingPlan[]>([]); const rateTables = ref<RateTable[]>([]); const ruleSets = ref<RuleSet[]>([]); const calculationModels = ref<CalculationModel[]>([]); const taxPolicies = ref<TaxPolicy[]>([]); const dynamicFactors = ref<DynamicFactor[]>([]); const channels = ref<ChannelVO[]>([]); const commissionSchemes = ref<CommissionScheme[]>([]); const loading = ref(false)
const createVisible = ref(false); const testCaseVisible = ref(false); const detailVisible = ref(false); const detail = ref<PricingPlan | null>(null); const currentPlan = ref<PricingPlan | null>(null); const editingTestCases = ref<EditablePricingTestCase[]>([])
const selectedRateTableId = ref(''); const selectedRuleSetId = ref(''); const selectedCalculationModelId = ref(''); const selectedTaxPolicyIds = ref<string[]>([]); const selectedCommissionSchemeIds = ref<string[]>([]); const selectedDynamicFactorIds = ref<string[]>([])
const isNarrowScreen = useMediaQuery('(max-width: 767px)')
const form = reactive({ productVersion: 'V1.0', planVersion: 'V1.0', pricingMode: 'RATE_TABLE', currency: 'CNY', effectiveFrom: '', rateTableCode: '', rateTableVersion: '', rateDimensionKeys: [] as string[], artifactCode: '', artifactVersion: '', inputSchemaVersion: '', artifactHash: '', calculationModelCode: '', calculationModelVersion: '', calculationModelHash: '', featureContractText: '', roundingScale: 2, roundingMode: 'HALF_UP', taxPolicyRefs: [] as Array<{ policyCode: string; policyVersion: string; contentHash: string }>, commissionSchemeRefs: [] as CommissionSchemeRef[], dynamicFactorRefs: [] as DynamicFactorRef[] })
const { dictOptions: pricingModeOptions, getLabel: pricingModeLabel } = useDict('PRICING_MODE')
const { getLabel: statusLabel } = useDict('CONFIG_LIFECYCLE_STATUS')
const { getLabel: dimensionLabel } = useDict('RATE_DIMENSION')
const { getLabel: roundingModeLabel } = useDict('ROUNDING_MODE')
const { getLabel: genderDictLabel } = useDict('GENDER')
const activeRuleSets = computed(() => ruleSets.value.filter((item) => item.status === 'ACTIVE' && item.artifactHash))
const genderLabel = (value?: string) => value ? genderDictLabel(value) : '-'
const referenceLabel = (row: unknown) => { const plan = row as PricingPlan; const rate = plan.rateTableCode ? `${plan.rateTableCode}/${plan.rateTableVersion || '-'}` : ''; const rule = plan.artifactCode ? `${plan.artifactCode}/${plan.artifactVersion || '-'}` : ''; return [rate, rule].filter(Boolean).join(' + ') || '-' }
const calculationModelLabel = (row: unknown) => { const plan = row as PricingPlan; return plan.calculationModelCode ? `${plan.calculationModelCode} / ${plan.calculationModelVersion}` : '兼容基础保费' }
const taxPolicyLabel = (row: unknown) => { const plan = row as PricingPlan; return plan.taxPolicyRefs?.length ? plan.taxPolicyRefs.map((item) => `${item.policyCode}/${item.policyVersion}`).join('、') : '未配置' }
const commissionSchemeLabel = (row: unknown) => { const plan = row as PricingPlan; return plan.commissionSchemeRefs?.length ? `${plan.commissionSchemeRefs.length} 个渠道方案` : '未配置' }
const dynamicFactorLabel = (row: unknown) => { const plan = row as PricingPlan; return plan.dynamicFactorRefs?.length ? plan.dynamicFactorRefs.map((item) => item.factorCode).join('、') : '未配置' }
const channelName = (channelId: string) => channels.value.find((item) => item.channelId === channelId)?.channelName || channelId

async function loadProducts() { const result = await getProductList({ pageNum: 1, pageSize: 100 }); products.value = result.list; if (!productId.value && products.value.length) productId.value = products.value[0].id; await loadProductContext() }
async function loadPlans() { if (!productId.value) { plans.value = []; return }; loading.value = true; try { plans.value = await listPricingPlans(productId.value, status.value || undefined) } finally { loading.value = false } }
async function loadReferences() { if (!productId.value) { rateTables.value = []; calculationModels.value = []; taxPolicies.value = []; dynamicFactors.value = []; commissionSchemes.value = []; return }; const [tables, ruleResult, models, policies, factors, channelPage] = await Promise.all([listRateTables(productId.value, 'PUBLISHED'), listRuleSets('PRICING'), listCalculationModels(productId.value, 'PUBLISHED'), listTaxPolicies(productId.value, 'PUBLISHED'), listDynamicFactors(productId.value, 'PUBLISHED'), getChannelList({ pageNum: 1, pageSize: 100, status: 'ACTIVE' })]); rateTables.value = tables; ruleSets.value = ruleResult.list || []; calculationModels.value = models; taxPolicies.value = policies; dynamicFactors.value = factors; channels.value = channelPage.list; const schemePages = await Promise.allSettled(channels.value.map((channel) => getCommissionSchemeList({ channelId: channel.channelId, productId: productId.value, status: 'PUBLISHED', pageNum: 1, pageSize: 100 }))); commissionSchemes.value = schemePages.flatMap((result) => result.status === 'fulfilled' ? result.value.list : []) }
async function loadProductContext() { await Promise.all([loadPlans(), loadReferences()]) }
function openCreate() { const product = products.value.find((item) => item.id === productId.value); form.productVersion = product?.version || 'V1.0'; selectedCalculationModelId.value = ''; selectedTaxPolicyIds.value = []; selectedCommissionSchemeIds.value = []; selectedDynamicFactorIds.value = []; form.taxPolicyRefs = []; form.commissionSchemeRefs = []; form.dynamicFactorRefs = []; form.featureContractText = ''; form.calculationModelCode = ''; form.calculationModelVersion = ''; form.calculationModelHash = ''; handlePricingModeChange(); createVisible.value = true }
function handlePricingModeChange() { form.rateTableCode = ''; form.rateTableVersion = ''; form.rateDimensionKeys = []; form.artifactCode = ''; form.artifactVersion = ''; form.inputSchemaVersion = ''; form.artifactHash = ''; selectedRateTableId.value = ''; selectedRuleSetId.value = '' }
function selectRateTable(tableId: string) { const table = rateTables.value.find((item) => item.tableId === tableId); if (!table) return; form.currency = table.currency; form.rateTableCode = table.tableCode; form.rateTableVersion = table.tableVersion; form.rateDimensionKeys = [...table.dimensionKeys] }
async function selectRuleSet(ruleSetId: string) { const summary = ruleSets.value.find((item) => item.ruleSetId === ruleSetId); if (!summary) { form.artifactCode = ''; form.artifactVersion = ''; form.inputSchemaVersion = ''; form.artifactHash = ''; return }; const ruleSet = await getRuleSet(summary.ruleSetCode); form.artifactCode = ruleSet.ruleSetCode; form.artifactVersion = ruleSet.ruleSetVersion || ''; form.inputSchemaVersion = ruleSet.inputSchemaVersion || ''; form.artifactHash = ruleSet.artifactHash || '' }
function selectCalculationModel(modelId: string) { const model = calculationModels.value.find((item) => item.modelId === modelId); if (!model) { form.calculationModelCode = ''; form.calculationModelVersion = ''; form.calculationModelHash = ''; return }; form.currency = model.currency; form.calculationModelCode = model.modelCode; form.calculationModelVersion = model.modelVersion; form.calculationModelHash = model.contentHash || '' }
function selectTaxPolicies(policyIds: string[]) { form.taxPolicyRefs = policyIds.map((id) => taxPolicies.value.find((policy) => policy.policyId === id)).filter((policy): policy is TaxPolicy => Boolean(policy)).map((policy) => ({ policyCode: policy.policyCode, policyVersion: policy.policyVersion, contentHash: policy.contentHash || '' })) }
function selectCommissionSchemes(schemeIds: string[]) { form.commissionSchemeRefs = schemeIds.map((id) => commissionSchemes.value.find((scheme) => scheme.schemeId === id)).filter((scheme): scheme is CommissionScheme => Boolean(scheme)).map((scheme) => ({ channelId: scheme.channelId, schemeCode: scheme.schemeCode, schemeVersion: scheme.schemeVersion, contentHash: scheme.contentHash || '' })) }
function selectDynamicFactors(factorIds: string[]) { const selected = factorIds.map((id) => dynamicFactors.value.find((factor) => factor.factorId === id)).filter((factor): factor is DynamicFactor => Boolean(factor)); form.dynamicFactorRefs = selected.map((factor) => ({ factorCode: factor.factorCode, factorVersion: factor.factorVersion, contentHash: factor.contentHash || '' })); const requirements = selected.map((factor) => ({ featureCode: factor.featureCode, dataType: 'DECIMAL', required: factor.missingPolicy === 'REJECT', definitionVersion: factor.featureDefinitionVersion, missingPolicy: factor.missingPolicy, sensitivity: 'INTERNAL' })); form.featureContractText = requirements.length ? JSON.stringify({ contractId: `pricing-${productId.value}`, contractVersion: form.planVersion, requirements }, null, 2) : '' }
function parseJson(text: string, label: string) { try { return text.trim() ? JSON.parse(text) : undefined } catch { ElMessage.warning(`${label}必须是合法 JSON`); return null } }
async function submitCreate() { if (!form.effectiveFrom) return ElMessage.warning('请选择生效时间'); if (form.pricingMode === 'RATE_TABLE' && !selectedRateTableId.value) return ElMessage.warning('请选择已发布费率表'); if (form.pricingMode === 'ACTUARIAL_FORMULA' && !selectedRuleSetId.value) return ElMessage.warning('请选择已激活定价规则'); if (form.dynamicFactorRefs.length && !selectedRuleSetId.value) return ElMessage.warning('动态因子需要绑定定价规则后才能参与计算'); const duplicateChannels = form.commissionSchemeRefs.map((item) => item.channelId).filter((id, index, all) => all.indexOf(id) !== index); if (duplicateChannels.length) return ElMessage.warning('同一定价包每个渠道只能引用一个佣金方案版本'); const featureContract = parseJson(form.featureContractText, '特征契约'); if (featureContract === null) return; const payload: Record<string, unknown> = { productVersion: form.productVersion, planVersion: form.planVersion, pricingMode: form.pricingMode, currency: form.currency, effectiveFrom: form.effectiveFrom, roundingScale: form.roundingScale, roundingMode: form.roundingMode, featureContract, taxPolicyRefs: form.taxPolicyRefs, commissionSchemeRefs: form.commissionSchemeRefs, dynamicFactorRefs: form.dynamicFactorRefs }; if (form.pricingMode === 'RATE_TABLE') Object.assign(payload, { rateTableCode: form.rateTableCode, rateTableVersion: form.rateTableVersion, rateDimensionKeys: form.rateDimensionKeys }); if (selectedRuleSetId.value) payload.artifactRef = { artifactCode: form.artifactCode, artifactVersion: form.artifactVersion, inputSchemaVersion: form.inputSchemaVersion, artifactHash: form.artifactHash }; if (selectedCalculationModelId.value) Object.assign(payload, { calculationModelCode: form.calculationModelCode, calculationModelVersion: form.calculationModelVersion, calculationModelHash: form.calculationModelHash }); await createPricingPlan(productId.value, payload); createVisible.value = false; ElMessage.success('定价包草稿已创建'); await loadPlans() }
function newTestCase(): EditablePricingTestCase { return { caseCode: `CASE-${editingTestCases.value.length + 1}`, businessTime: new Date().toISOString().slice(0, 19), sumInsured: 100000, age: 30, gender: 'ALL', paymentTermYears: 1, coverageTermYears: 1, paymentPeriods: 1, requestSnapshot: {}, channelId: currentPlan.value?.commissionSchemeRefs?.[0]?.channelId, policyYear: 1, expectedPremium: 0, tolerance: 0.01 } }
async function openTestCases(row: unknown) { const plan = row as PricingPlan; currentPlan.value = await getPricingPlan(productId.value, plan.planId); editingTestCases.value = (currentPlan.value.testCases || []).map((item) => ({ ...item, channelId: typeof item.requestSnapshot?.channelId === 'string' ? item.requestSnapshot.channelId : undefined, policyYear: typeof item.requestSnapshot?.policyYear === 'number' ? item.requestSnapshot.policyYear : 1 })); testCaseVisible.value = true }
async function saveTestCases() { if (!currentPlan.value) return; if (!editingTestCases.value.length) return ElMessage.warning('至少维护一条测试用例'); if (editingTestCases.value.some((item) => !item.caseCode || !item.businessTime)) return ElMessage.warning('请补齐测试用例编码和业务时间'); const testCases = editingTestCases.value.map(({ channelId, policyYear, ...item }) => ({ ...item, requestSnapshot: { ...(item.requestSnapshot || {}), ...(channelId ? { channelId } : {}), policyYear } })); await replacePricingTestCases(productId.value, currentPlan.value.planId, testCases); testCaseVisible.value = false; ElMessage.success('测试用例已保存'); await loadPlans() }
async function approve(row: unknown) { const plan = row as PricingPlan; await approvePricingPlan(productId.value, plan.planId); ElMessage.success('定价包已审批'); await loadPlans() }
async function runTests(row: unknown) { const plan = row as PricingPlan; const result = await runPricingTests(productId.value, plan.planId); ElMessage.success(`测试完成：${result.passedCases ?? 0}/${result.totalCases ?? 0} 通过`) }
async function publish(row: unknown) { const plan = row as PricingPlan; await ElMessageBox.confirm('发布后将作为出单保费计算的定价包版本，确认发布？', '发布定价包', { type: 'warning' }); await publishPricingPlan(productId.value, plan.planId); ElMessage.success('定价包已发布'); await loadPlans() }
async function retire(row: unknown) { const plan = row as PricingPlan; await ElMessageBox.confirm('退役后不再用于新保单计算，确认继续？', '退役定价包', { type: 'warning' }); await retirePricingPlan(productId.value, plan.planId); ElMessage.success('定价包已退役'); await loadPlans() }
async function showDetail(row: unknown) { const plan = row as PricingPlan; detail.value = await getPricingPlan(productId.value, plan.planId); detailVisible.value = true }
onMounted(loadProducts)
</script>

<style scoped>
.page-intro { margin-bottom: 18px; }
h2 { margin: 0 0 8px; }
p { color: var(--ti-text-secondary, #86909c); margin: 0; }
.test-alert { margin-bottom: 12px; }
.add-row { margin-top: 12px; }
.dimension-tag { margin-right: 8px; }
.reference-hint { margin-top: 6px; color: var(--ti-text-secondary, #86909c); font-size: 12px; }
.hash-text { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.tax-reference-list > div { display: grid; gap: 4px; }
.tax-reference-list strong { font-weight: 600; }
@media (max-width: 767px) {
  .ti-toolbar { align-items: stretch; flex-direction: column; gap: 8px; }
  .ti-toolbar :deep(.el-form) { display: flex; flex-direction: column; }
  .ti-toolbar :deep(.el-form-item) { margin-right: 0; }
  .ti-toolbar :deep(.el-select) { width: 100% !important; }
  .ti-toolbar > .el-button { align-self: flex-end; }
}
</style>
