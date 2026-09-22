<template>
  <div class="ti-page">
    <div class="page-intro">
      <h2>定价包</h2>
      <p>将产品版本、费率表、规则工件、特征契约和回归用例绑定为可发布的保费计算配置。</p>
    </div>
    <!-- 搜索区：切换产品要连带重载定价所引用的上下文，故产品走 loadProductContext，状态只重载列表 -->
    <TiSearchForm :model="queryParams" @search="loadPlans" @reset="handleReset">
      <el-form-item label="产品">
        <el-select v-model="productId" filterable clearable placeholder="选择产品" style="width: 320px" @change="loadProductContext">
          <el-option v-for="product in products" :key="product.id" :label="`${product.name} (${product.code})`" :value="product.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态"><TiDictSelect v-model="status" dict-type="CONFIG_LIFECYCLE_STATUS" style="width: 140px" @change="loadPlans" /></el-form-item>
    </TiSearchForm>
    <!-- 主操作独居工具栏：全站同类页（system/user、system/role、system/menu、product/list）
         的单个主操作一律放 ti-toolbar-left，此处沿用；原先它靠 space-between 的第二个子元素
         被推到右侧，那是布局副作用而非约定 -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :disabled="!productId" v-permission="'product:pricing:create'" @click="openCreate">新建定价包</el-button>
      </div>
    </div>
    <el-alert v-if="!productId" title="请选择产品，定价包必须挂在具体产品版本下。" type="info" :closable="false" />
    <TiTable
      v-else
      :data="plans"
      :loading="loading"
      :max-height="'var(--ti-table-max-height-default)'"
      :error="tableError"
      @refresh="loadPlans"
    >
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
      <el-table-column label="操作" :fixed="isNarrowScreen ? false : 'right'" width="320" class-name="ti-action-column">
        <template #default="{ row }">
          <!-- 平铺动作收敛为 3 个：查看 + 草稿期两个；审批结果后的动作（运行测试/发布/退役）进「更多」 -->
          <el-button size="small" :icon="View" @click="showDetail(row)">查看</el-button>
          <el-button v-if="row.status === 'DRAFT'" size="small" v-permission="'product:pricing:edit'" @click="openTestCases(row)">维护用例</el-button>
          <!-- 🔴 权限码取自 ProductProxyController 逐端点 @PreAuthorize，不按按钮文案猜：
               `/approve` 与 `/test-cases:run` 都是 PRODUCT_PRICING_EDIT，`/retire` 是 PRODUCT_PRICING_PUBLISH。 -->
          <el-button
            v-if="row.status === 'DRAFT' && hasPermission('product:pricing:edit')"
            size="small" type="primary" :icon="CircleCheck"
            :loading="rowPending === actionKey(row.planId, 'approve')"
            @click="approve(row)"
          >
            审批
          </el-button>
          <el-dropdown
            v-if="['APPROVED', 'PUBLISHED'].includes(row.status)"
            trigger="click"
            @command="(command: string) => runRowCommand(row, command)"
          >
            <!-- 下拉触发器承载整行的在途反馈：el-dropdown-item 无 loading，故上移到触发器。
                 三个命令（运行测试/发布/退役）同属该行，触发器只需回答「这一行忙不忙」 -->
            <el-button size="small" :icon="MoreFilled" :loading="isRowBusy(row)">更多</el-button>
            <template #dropdown>
              <!-- 下拉项用 hasPermission 而非 v-permission：el-dropdown-item 渲染根是 Fragment，
                   指令拿到的只是片段锚点文本节点，removeChild 摘不掉真正的 <li>（会静默失效） -->
              <el-dropdown-menu>
                <el-dropdown-item
                  v-if="row.status === 'APPROVED' && hasPermission('product:pricing:edit')"
                  command="runTests"
                  :disabled="isRowBusy(row)"
                >
                  运行测试
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="row.status === 'APPROVED' && hasPermission('product:pricing:publish')"
                  command="publish"
                >
                  发布
                </el-dropdown-item>
                <el-dropdown-item
                  v-if="row.status === 'PUBLISHED' && hasPermission('product:pricing:publish')"
                  command="retire"
                >
                  退役
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="当前产品暂无定价包"><el-button type="primary" v-permission="'product:pricing:create'" @click="openCreate">新建定价包</el-button></el-empty>
      </template>
    </TiTable>

    <el-dialog v-model="createVisible" title="新建定价包草稿" width="min(760px, calc(100vw - 24px))">
      <el-form :model="form" :label-position="isNarrowScreen ? 'top' : 'right'" :label-width="isNarrowScreen ? 'auto' : '140px'">
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
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button></template>
    </el-dialog>

    <el-dialog v-model="testCaseVisible" title="维护保费计算测试用例" width="min(1100px, calc(100vw - 24px))">
      <el-alert title="审批前至少维护一条测试用例；发布时系统会重新执行全部用例并要求全部通过。" type="info" :closable="false" class="test-alert" />
      <el-table :data="editingTestCases" stripe empty-text="暂无测试用例，点「新增用例」新增">
        <el-table-column label="编码" min-width="130"><template #default="{ row }"><el-input v-model="row.caseCode" /></template></el-table-column>
        <el-table-column label="业务时间" width="190"><template #default="{ row }"><el-date-picker v-model="row.businessTime" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></template></el-table-column>
        <el-table-column label="保额" width="140"><template #default="{ row }"><el-input-number v-model="row.sumInsured" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
        <el-table-column label="年龄" width="100"><template #default="{ row }"><el-input-number v-model="row.age" :min="0" :max="150" controls-position="right" /></template></el-table-column>
        <el-table-column label="性别" width="100"><template #default="{ row }"><TiDictSelect v-model="row.gender" dict-type="GENDER" :clearable="false" :exclude-values="TEST_CASE_GENDER_EXCLUDED" /></template></el-table-column>
        <el-table-column label="缴费期" width="105"><template #default="{ row }"><el-input-number v-model="row.paymentTermYears" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="保障期" width="105"><template #default="{ row }"><el-input-number v-model="row.coverageTermYears" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="缴费次数" width="105"><template #default="{ row }"><el-input-number v-model="row.paymentPeriods" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="佣金渠道" min-width="180"><template #default="{ row }"><el-select v-model="row.channelId" clearable placeholder="不计算佣金"><el-option v-for="reference in currentPlan?.commissionSchemeRefs || []" :key="reference.channelId" :label="channelName(reference.channelId)" :value="reference.channelId" /></el-select></template></el-table-column>
        <el-table-column label="保单年度" width="105"><template #default="{ row }"><el-input-number v-model="row.policyYear" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="预期保费" width="140"><template #default="{ row }"><el-input-number v-model="row.expectedPremium" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
        <el-table-column label="容差" width="120"><template #default="{ row }"><el-input-number v-model="row.tolerance" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
        <el-table-column label="操作" width="120" class-name="ti-action-column"><template #default="{ $index }"><el-button size="small" type="danger" :icon="Delete" @click="editingTestCases.splice($index, 1)">删除</el-button></template></el-table-column>
      </el-table>
      <el-button class="add-row" @click="editingTestCases.push(newTestCase())">新增用例</el-button>
      <template #footer><el-button @click="testCaseVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveTestCases">保存测试用例</el-button></template>
    </el-dialog>

    <!-- 🔴 D-501-37：运行测试逐条明细。发布闸口是「全部用例通过」，明细必须可见，否则用户无法自查 -->
    <el-dialog v-model="testResultVisible" title="测试用例执行结果" width="min(1000px, calc(100vw - 24px))">
      <el-alert
        :title="`共 ${testResult?.totalCases ?? 0} 条用例，通过 ${testResult?.passedCases ?? 0} 条`"
        :type="(testResult?.passedCases ?? 0) === (testResult?.totalCases ?? 0) && (testResult?.totalCases ?? 0) > 0 ? 'success' : 'error'"
        :closable="false"
        class="test-alert"
      />
      <el-table :data="testResult?.caseResults || []" stripe max-height="420" empty-text="无用例执行结果">
        <el-table-column prop="caseCode" label="用例编码" min-width="140" />
        <el-table-column label="结果" width="90"><template #default="{ row }"><el-tag :type="row.passed ? 'success' : 'danger'" effect="light">{{ row.passed ? '通过' : '失败' }}</el-tag></template></el-table-column>
        <el-table-column label="预期保费" width="130" align="right"><template #default="{ row }">{{ formatAmount(row.expectedPremium) }}</template></el-table-column>
        <el-table-column label="实际保费" width="130" align="right"><template #default="{ row }">{{ formatAmount(row.actualPremium) }}</template></el-table-column>
        <el-table-column label="差额" width="120"><template #default="{ row }">{{ row.difference ?? '-' }}</template></el-table-column>
        <el-table-column label="失败原因" min-width="220" show-overflow-tooltip><template #default="{ row }">{{ row.failureReason || '-' }}</template></el-table-column>
      </el-table>
      <template #footer><el-button type="primary" @click="testResultVisible = false">关闭</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="定价包详情" size="min(920px, 100vw)">
      <el-descriptions :column="detailColumns" border>
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
        <!-- 时间统一走全局日期工具，避免直出后端 ISO 串（2026-09-18 全站实测） -->
        <el-descriptions-item label="生效时间">{{ formatDateTime(detail?.effectiveFrom) }}</el-descriptions-item>
        <el-descriptions-item v-if="detail?.artifactHash" label="工件哈希" :span="3"><span class="hash-text">{{ detail.artifactHash }}</span></el-descriptions-item>
      </el-descriptions>
      <el-divider content-position="left">回归测试用例</el-divider>
      <el-table :data="detail?.testCases || []" stripe empty-text="暂无测试用例">
        <el-table-column prop="caseCode" label="编码" min-width="130" /><el-table-column prop="description" label="说明" min-width="180" /><el-table-column prop="sumInsured" label="保额" width="120" /><el-table-column prop="age" label="年龄" width="75" /><el-table-column label="性别" width="75"><template #default="{ row }">{{ genderLabel(row.gender) }}</template></el-table-column><el-table-column prop="expectedPremium" label="预期保费" width="120" /><el-table-column prop="tolerance" label="容差" width="90" />
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRefs } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheck, Delete, MoreFilled, View } from '@element-plus/icons-vue'
import { useMediaQuery } from '@vueuse/core'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDetailColumns } from '@/composables/useDetailColumns'
import { useDict } from '@/composables/useDict'
import { usePermission } from '@/composables/usePermission'
import { useRowAction, confirmAction, actionKey } from '@/composables/useRowAction'
import { useTableError } from '@/composables/useTable'
import { getProductList } from '@/api/product'
import { getRuleSet, listRuleSets, type RuleSet } from '@/api/rule-engine'
import { listCalculationModels, listDynamicFactors, listTaxPolicies, type CalculationModel, type DynamicFactor, type TaxPolicy } from '@/api/actuarial'
import { getChannelList, getCommissionSchemeList, type ChannelVO, type CommissionScheme } from '@/api/channel'
import { approvePricingPlan, createPricingPlan, getPricingPlan, listPricingPlans, listRateTables, publishPricingPlan, replacePricingTestCases, retirePricingPlan, runPricingTests, type CommissionSchemeRef, type DynamicFactorRef, type PricingPlan, type PricingPlanValidation, type PricingTestCase, type RateTable } from '@/api/pricing'
import type { ProductVO } from '@/types/business.d'
import { MEDIA_MAX_MOBILE } from '@/constants/layout'
import { formatAmount } from '@/utils/format'
import { formatDateTime } from '@/utils/date'

type EditablePricingTestCase = PricingTestCase & { channelId?: string; policyYear: number }
// 检索条件收进单一对象：TiSearchForm 的 `:model` 与字段绑定必须指向同一份数据，否则重置空转。
// toRefs 让下面几十处 `productId.value` / `status.value` 零改动。
const queryParams = reactive({ productId: '', status: '' }); const { productId, status } = toRefs(queryParams)
const products = ref<ProductVO[]>([]); const plans = ref<PricingPlan[]>([]); const rateTables = ref<RateTable[]>([]); const ruleSets = ref<RuleSet[]>([]); const calculationModels = ref<CalculationModel[]>([]); const taxPolicies = ref<TaxPolicy[]>([]); const dynamicFactors = ref<DynamicFactor[]>([]); const channels = ref<ChannelVO[]>([]); const commissionSchemes = ref<CommissionScheme[]>([]); const loading = ref(false)
// 失败态：接口挂了不得渲染成「暂无数据」（🔴 R7-13）
const { tableError, clearTableError, setTableError } = useTableError()
const createVisible = ref(false); const testCaseVisible = ref(false); /** 详情抽屉的描述区：字段短，宽屏 3 档（窄屏列数由组合式函数统一降为 1） */
const detailColumns = useDetailColumns(3)

const detailVisible = ref(false); const detail = ref<PricingPlan | null>(null); const currentPlan = ref<PricingPlan | null>(null); const editingTestCases = ref<EditablePricingTestCase[]>([])
/** 🔴 D-501-37：运行测试的逐条明细（此前只弹计数提示、整包丢弃） */
const testResultVisible = ref(false); const testResult = ref<PricingPlanValidation | null>(null)

/**
 * 行内动作（审批/运行测试/发布/退役）的在途行键。
 *
 * 🔴 原先只有「运行测试」有反馈（一个全局布尔 `testRunning`，绑在「更多」触发器上），
 * 另外三个（审批走平铺按钮、发布/退役走「更多」）**点下去界面毫无变化**——
 * 定价包的发布/退役是**出单保费计算**的入口，重复点击的代价是同一版本被反复推状态。
 *
 * 🔴 顺带把 `testRunning` 一并并入：它是**全局布尔量**，点 A 行的「运行测试」会让
 * 表格里**每一行**的「更多」同时转圈（用户以为自己误触了别的行）。
 * 同一个 pending 只能有一个真源，故此处收敛为按行键区分的 `rowPending`。
 */
const { rowPending, run } = useRowAction(loadPlans)

/** 该行是否有行内动作在途。键形如 `${planId}:${action}`，按第一个冒号切分取行主键全等比较
 *  （不用 startsWith：ID 之间可能有前缀关系，会让 A 行的操作点亮 B 行）。 */
const isRowBusy = (row: unknown) =>
  rowPending.value !== null && String(rowPending.value).split(':')[0] === (row as PricingPlan).planId

/** 两个对话框（新建 / 测试用例）footer 保存按钮的在途标志。二者皆模态，不可能同时在途。 */
const saving = ref(false)
const selectedRateTableId = ref(''); const selectedRuleSetId = ref(''); const selectedCalculationModelId = ref(''); const selectedTaxPolicyIds = ref<string[]>([]); const selectedCommissionSchemeIds = ref<string[]>([]); const selectedDynamicFactorIds = ref<string[]>([])
const isNarrowScreen = useMediaQuery(MEDIA_MAX_MOBILE)

/** 下拉权限判定：el-dropdown-item 为多根组件，v-permission 指令在此失效，须显式判断 */
const { hasPermission } = usePermission()
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
async function loadPlans() { if (!productId.value) { plans.value = []; return }; loading.value = true; try { plans.value = await listPricingPlans(productId.value, status.value || undefined); clearTableError() } catch (err) { plans.value = []; setTableError(err) } finally { loading.value = false } }
/**
 * 重置检索条件。
 *
 * <p>productId/status 的还原由 TiSearchForm 完成（先还原、再 emit）；此处直接清空列表，
 * **刻意不重新自动选中第一个产品**：重置的语义是清空全部条件，落到本页即回到
 * 「请选择产品」空态（模板 el-alert 就是为它准备的）。若此处重新自动选中，
 * 用户在默认产品上点重置会看不到任何变化，反成「有按钮、没反应」。</p>
 */
function handleReset() { plans.value = [] }
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
async function submitCreate() {
  if (!form.effectiveFrom) return ElMessage.warning('请选择生效时间')
  if (form.pricingMode === 'RATE_TABLE' && !selectedRateTableId.value) return ElMessage.warning('请选择已发布费率表')
  if (form.pricingMode === 'ACTUARIAL_FORMULA' && !selectedRuleSetId.value) return ElMessage.warning('请选择已激活定价规则')
  if (form.dynamicFactorRefs.length && !selectedRuleSetId.value) return ElMessage.warning('动态因子需要绑定定价规则后才能参与计算')
  const duplicateChannels = form.commissionSchemeRefs.map((item) => item.channelId).filter((id, index, all) => all.indexOf(id) !== index)
  if (duplicateChannels.length) return ElMessage.warning('同一定价包每个渠道只能引用一个佣金方案版本')
  const featureContract = parseJson(form.featureContractText, '特征契约')
  if (featureContract === null) return
  const payload: Record<string, unknown> = { productVersion: form.productVersion, planVersion: form.planVersion, pricingMode: form.pricingMode, currency: form.currency, effectiveFrom: form.effectiveFrom, roundingScale: form.roundingScale, roundingMode: form.roundingMode, featureContract, taxPolicyRefs: form.taxPolicyRefs, commissionSchemeRefs: form.commissionSchemeRefs, dynamicFactorRefs: form.dynamicFactorRefs }
  if (form.pricingMode === 'RATE_TABLE') Object.assign(payload, { rateTableCode: form.rateTableCode, rateTableVersion: form.rateTableVersion, rateDimensionKeys: form.rateDimensionKeys })
  if (selectedRuleSetId.value) payload.artifactRef = { artifactCode: form.artifactCode, artifactVersion: form.artifactVersion, inputSchemaVersion: form.inputSchemaVersion, artifactHash: form.artifactHash }
  if (selectedCalculationModelId.value) Object.assign(payload, { calculationModelCode: form.calculationModelCode, calculationModelVersion: form.calculationModelVersion, calculationModelHash: form.calculationModelHash })
  saving.value = true
  try {
    await createPricingPlan(productId.value, payload)
    createVisible.value = false; ElMessage.success('定价包草稿已创建'); await loadPlans()
  } finally { saving.value = false }
}
/**
 * 试算用例性别中**不可选**的字典值。
 * <p>🔴 D-501-35：`GENDER` 字典有 4 项（`M`/`F`/`UNKNOWN`/`ALL`），而试算入口
 * （`RateTableCriteria` 的 `normalizeGender`）**只放行 `M`/`F`**，其余直接抛
 * `PRICING_INPUT_INVALID`。费率行的 `gender` 允许 `ALL` 作通配，试算入参不允许 ——
 * 同一业务概念两端值域不一致。</p>
 * <p>判据：**用例表达的是一次真实试算，被保人必有确定性别**，语义上不该有通配；
 * 故从选项剔除而非在计算入口放宽（放宽会让「性别不限」静默按某个性别计算，是更危险的静默错误）。</p>
 */
const TEST_CASE_GENDER_EXCLUDED = ['UNKNOWN', 'ALL']

/** 新增用例的默认值：性别取 `M`（详见 {@link TEST_CASE_GENDER_EXCLUDED}，取 `ALL` 会让该用例必然失败） */
function newTestCase(): EditablePricingTestCase { return { caseCode: `CASE-${editingTestCases.value.length + 1}`, businessTime: new Date().toISOString().slice(0, 19), sumInsured: 100000, age: 30, gender: 'M', paymentTermYears: 1, coverageTermYears: 1, paymentPeriods: 1, requestSnapshot: {}, channelId: currentPlan.value?.commissionSchemeRefs?.[0]?.channelId, policyYear: 1, expectedPremium: 0, tolerance: 0.01 } }
async function openTestCases(row: unknown) { const plan = row as PricingPlan; currentPlan.value = await getPricingPlan(productId.value, plan.planId); editingTestCases.value = (currentPlan.value.testCases || []).map((item) => ({ ...item, channelId: typeof item.requestSnapshot?.channelId === 'string' ? item.requestSnapshot.channelId : undefined, policyYear: typeof item.requestSnapshot?.policyYear === 'number' ? item.requestSnapshot.policyYear : 1 })); testCaseVisible.value = true }
async function saveTestCases() {
  if (!currentPlan.value) return
  if (!editingTestCases.value.length) return ElMessage.warning('至少维护一条测试用例')
  if (editingTestCases.value.some((item) => !item.caseCode || !item.businessTime)) return ElMessage.warning('请补齐测试用例编码和业务时间')
  const testCases = editingTestCases.value.map(({ channelId, policyYear, ...item }) => ({ ...item, requestSnapshot: { ...(item.requestSnapshot || {}), ...(channelId ? { channelId } : {}), policyYear } }))
  saving.value = true
  try {
    await replacePricingTestCases(productId.value, currentPlan.value.planId, testCases)
    testCaseVisible.value = false; ElMessage.success('测试用例已保存'); await loadPlans()
  } finally { saving.value = false }
}
async function approve(row: unknown) {
  const plan = row as PricingPlan
  await run(actionKey(plan.planId, 'approve'), async () => {
    await approvePricingPlan(productId.value, plan.planId)
    ElMessage.success('定价包已审批')
  })
}
/**
 * 运行发布门禁测试。
 * <p>🔴 D-501-37：本方法是 `publish` 的唯一放行闸口（`allPassed()`），此前只弹一条 3 秒消失的
 * 「测试完成：N/M 通过」，逐条明细（后端已完整经网络返回）被整包丢弃 ⇒ 用户面对「0/2 通过」
 * 无处可查、只能反复试错。现改为**计数作标题 + 明细进对话框**。</p>
 */
async function runTests(row: unknown) {
  const plan = row as PricingPlan
  await run(actionKey(plan.planId, 'run-tests'), async () => {
    testResult.value = await runPricingTests(productId.value, plan.planId)
    testResultVisible.value = true
  })
}
async function publish(row: unknown) {
  const plan = row as PricingPlan
  if (!(await confirmAction('发布后将作为出单保费计算的定价包版本，确认发布？', '发布定价包', { type: 'warning' }))) return
  await run(actionKey(plan.planId, 'publish'), async () => {
    await publishPricingPlan(productId.value, plan.planId)
    ElMessage.success('定价包已发布')
  })
}
async function retire(row: unknown) {
  const plan = row as PricingPlan
  const ok = await confirmAction('退役后不再用于新保单计算，确认继续？', '退役定价包', {
    type: 'warning',
    confirmButtonClass: 'el-button--danger',
  })
  if (!ok) return
  await run(actionKey(plan.planId, 'retire'), async () => {
    await retirePricingPlan(productId.value, plan.planId)
    ElMessage.success('定价包已退役')
  })
}
async function showDetail(row: unknown) { const plan = row as PricingPlan; detail.value = await getPricingPlan(productId.value, plan.planId); detailVisible.value = true }

/** 操作列「更多」下拉派发：命令值即动作语义，与下拉项 command 一一对应 */
function runRowCommand(row: unknown, command: string) {
  const handlers: Record<string, (target: unknown) => void> = { runTests, publish, retire }
  handlers[command]?.(row)
}
onMounted(loadProducts)
</script>

<style scoped lang="scss">
.page-intro { margin-bottom: 18px; }
h2 { margin: 0 0 8px; }
p { color: $text-secondary; margin: 0; }
.test-alert { margin-bottom: 12px; }
.add-row { margin-top: 12px; }
.dimension-tag { margin-right: 8px; }
.reference-hint { margin-top: 6px; color: $text-secondary; font-size: 12px; }
.hash-text { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
.tax-reference-list > div { display: grid; gap: 4px; }
.tax-reference-list strong { font-weight: 600; }
@media (max-width: $breakpoint-mobile) {
  .ti-toolbar { align-items: stretch; flex-direction: column; gap: 8px; }
  .ti-toolbar :deep(.el-form) { display: flex; flex-direction: column; }
  .ti-toolbar :deep(.el-form-item) { margin-right: 0; }
  .ti-toolbar :deep(.el-select) { width: 100% !important; }
  .ti-toolbar > .el-button { align-self: flex-end; }
}
</style>
