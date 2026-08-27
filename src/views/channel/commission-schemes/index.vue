<template>
  <div class="ti-page">
    <div class="page-intro">
      <h2>佣金方案</h2>
      <p>维护渠道合同下的佣金算法、分润、分期与回拨条款，发布版本供定价包精确引用。</p>
    </div>

    <div class="ti-toolbar">
      <el-form inline>
        <el-form-item label="渠道">
          <el-select v-model="queryParams.channelId" filterable placeholder="选择渠道" style="width: 260px" @change="handleSearch">
            <el-option v-for="item in channels" :key="item.channelId" :label="`${item.channelName} (${item.channelCode})`" :value="item.channelId" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品">
          <el-select v-model="queryParams.productId" filterable placeholder="选择产品" style="width: 280px" @change="handleSearch">
            <el-option v-for="item in products" :key="item.id" :label="`${item.name} (${item.code})`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="queryParams.status" clearable placeholder="全部" style="width: 130px" @change="handleSearch">
            <el-option v-for="item in statusOptions" :key="item.value" v-bind="item" />
          </el-select>
        </el-form-item>
        <el-button type="primary" @click="handleSearch">查询</el-button>
      </el-form>
      <el-button type="primary" :icon="Plus" :disabled="!queryParams.channelId || !queryParams.productId" v-permission="'channel:commission:edit'" @click="openCreate">
        新建方案
      </el-button>
    </div>

    <el-alert v-if="!queryParams.channelId || !queryParams.productId" title="请选择渠道和产品，佣金方案属于具体渠道合同与产品的组合。" type="info" :closable="false" />
    <TiTable
      v-else
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="schemeCode" label="方案编码" min-width="150" />
      <el-table-column prop="schemeVersion" label="版本" width="100" />
      <el-table-column prop="schemeName" label="方案名称" min-width="180" show-overflow-tooltip />
      <el-table-column label="计算方式" width="120"><template #default="{ row }">{{ methodLabel(row.calculationMethod) }}</template></el-table-column>
      <el-table-column label="佣金参数" min-width="150"><template #default="{ row }">{{ calculationLabel(row) }}</template></el-table-column>
      <el-table-column label="分润方" width="90"><template #default="{ row }">{{ row.splits.length }}</template></el-table-column>
      <el-table-column label="结算/回拨" min-width="150"><template #default="{ row }">{{ row.installmentCount }} 期 / {{ row.clawbackMonths }} 月</template></el-table-column>
      <el-table-column prop="effectiveFrom" label="生效时间" width="170" />
      <el-table-column label="状态" width="105"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
      <el-table-column label="操作" :fixed="isNarrowScreen ? false : 'right'" width="260">
        <template #default="{ row }">
          <el-button link :icon="View" @click="showDetail(row)">查看</el-button>
          <el-button v-if="row.status === 'DRAFT'" link v-permission="'channel:commission:edit'" @click="approve(row)">审批</el-button>
          <el-button v-if="row.status === 'APPROVED'" link type="success" v-permission="'channel:commission:publish'" @click="publish(row)">发布</el-button>
          <el-button v-if="row.status === 'PUBLISHED'" link type="danger" v-permission="'channel:commission:publish'" @click="retire(row)">退役</el-button>
        </template>
      </el-table-column>
      <template #empty><el-empty description="当前渠道与产品暂无佣金方案" :image-size="72" /></template>
    </TiTable>

    <el-dialog v-model="createVisible" title="新建佣金方案草稿" width="min(900px, calc(100vw - 24px))">
      <el-form ref="formRef" :model="form" :rules="rules" :label-position="isNarrowScreen ? 'top' : 'right'" :label-width="isNarrowScreen ? 'auto' : '130px'">
        <div class="form-grid">
          <el-form-item label="方案编码" prop="schemeCode"><el-input v-model="form.schemeCode" /></el-form-item>
          <el-form-item label="方案版本" prop="schemeVersion"><el-input v-model="form.schemeVersion" /></el-form-item>
          <el-form-item label="方案名称" prop="schemeName"><el-input v-model="form.schemeName" /></el-form-item>
          <el-form-item label="币种" prop="currency"><el-select v-model="form.currency" filterable><el-option v-for="item in CURRENCY_OPTIONS" :key="item.value" v-bind="item" /></el-select></el-form-item>
          <el-form-item label="计算方式" prop="calculationMethod"><el-segmented v-model="form.calculationMethod" :options="methodOptions" /></el-form-item>
          <el-form-item v-if="form.calculationMethod === 'PERCENTAGE'" label="佣金比例" prop="rate"><el-input-number v-model="form.rate" :min="0" :max="1" :step="0.01" :precision="6" /></el-form-item>
          <el-form-item v-if="form.calculationMethod === 'FIXED'" label="定额佣金" prop="fixedAmount"><el-input-number v-model="form.fixedAmount" :min="0" :precision="2" /></el-form-item>
          <el-form-item label="佣金封顶"><el-input-number v-model="form.capAmount" :min="0" :precision="2" placeholder="不封顶" /></el-form-item>
          <el-form-item label="佣金基数" prop="baseComponentCodes">
            <el-select v-model="form.baseComponentCodes" multiple filterable allow-create default-first-option placeholder="选择或输入费用项编码">
              <el-option v-for="code in baseComponentOptions" :key="code" :label="code" :value="code" />
            </el-select>
          </el-form-item>
          <el-form-item label="适用保单年度"><div class="inline-range"><el-input-number v-model="form.policyYearFrom" :min="1" /><span>至</span><el-input-number v-model="form.policyYearTo" :min="form.policyYearFrom" /></div></el-form-item>
          <el-form-item label="结算期数"><el-input-number v-model="form.installmentCount" :min="1" /></el-form-item>
          <el-form-item label="回拨期限（月）"><el-input-number v-model="form.clawbackMonths" :min="0" /></el-form-item>
          <el-form-item label="生效时间" prop="effectiveFrom"><el-date-picker v-model="form.effectiveFrom" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
          <el-form-item label="失效时间"><el-date-picker v-model="form.effectiveTo" clearable type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
        </div>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="2" maxlength="300" show-word-limit /></el-form-item>

        <template v-if="form.calculationMethod === 'TIERED'">
          <el-divider content-position="left">阶梯佣金</el-divider>
          <el-table :data="form.tiers" border size="small">
            <el-table-column label="下限（含）"><template #default="{ row }"><el-input-number v-model="row.lowerInclusive" :min="0" :precision="2" /></template></el-table-column>
            <el-table-column label="上限（不含）"><template #default="{ row }"><el-input-number v-model="row.upperExclusive" :min="0" :precision="2" placeholder="无上限" /></template></el-table-column>
            <el-table-column label="比例"><template #default="{ row }"><el-input-number v-model="row.rate" :min="0" :max="1" :precision="6" /></template></el-table-column>
            <el-table-column label="定额"><template #default="{ row }"><el-input-number v-model="row.fixedAmount" :min="0" :precision="2" /></template></el-table-column>
            <el-table-column label="操作" width="74"><template #default="{ $index }"><el-button link type="danger" @click="form.tiers.splice($index, 1)">删除</el-button></template></el-table-column>
          </el-table>
          <el-button class="add-row" @click="form.tiers.push(newTier())">新增阶梯</el-button>
        </template>

        <el-divider content-position="left">分润指令</el-divider>
        <el-table :data="form.splits" border size="small">
          <el-table-column label="受益方类型" min-width="150"><template #default="{ row }"><el-select v-model="row.beneficiaryType"><el-option label="渠道" value="CHANNEL" /><el-option label="代理人" value="AGENT" /><el-option label="经纪人" value="BROKER" /></el-select></template></el-table-column>
          <el-table-column label="受益方ID" min-width="190"><template #default="{ row }"><el-input v-model="row.beneficiaryId" /></template></el-table-column>
          <el-table-column label="分润比例" min-width="150"><template #default="{ row }"><el-input-number v-model="row.splitRate" :min="0" :max="1" :precision="6" /></template></el-table-column>
          <el-table-column label="顺序" width="110"><template #default="{ row }"><el-input-number v-model="row.sortOrder" :min="1" /></template></el-table-column>
          <el-table-column label="操作" width="74"><template #default="{ $index }"><el-button link type="danger" :disabled="form.splits.length === 1" @click="form.splits.splice($index, 1)">删除</el-button></template></el-table-column>
        </el-table>
        <div class="split-footer"><el-button @click="form.splits.push(newSplit())">新增分润方</el-button><span>当前合计 {{ rateText(splitTotal) }}</span></div>
      </el-form>
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitCreate">创建草稿</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="佣金方案详情" size="min(860px, 100vw)">
      <el-descriptions v-if="detail" :column="isNarrowScreen ? 1 : 3" border>
        <el-descriptions-item label="方案">{{ detail.schemeCode }} / {{ detail.schemeVersion }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusLabel(detail.status) }}</el-descriptions-item>
        <el-descriptions-item label="币种">{{ detail.currency }}</el-descriptions-item>
        <el-descriptions-item label="计算方式">{{ methodLabel(detail.calculationMethod) }}</el-descriptions-item>
        <el-descriptions-item label="佣金参数">{{ calculationLabel(detail) }}</el-descriptions-item>
        <el-descriptions-item label="封顶">{{ amountText(detail.capAmount, detail.currency) }}</el-descriptions-item>
        <el-descriptions-item label="基数费用项" :span="3">{{ detail.baseComponentCodes.join('、') }}</el-descriptions-item>
        <el-descriptions-item label="内容哈希" :span="3"><span class="hash-text">{{ detail.contentHash || '-' }}</span></el-descriptions-item>
      </el-descriptions>
      <el-divider content-position="left">分润与结算</el-divider>
      <el-table :data="detail?.splits || []" border><el-table-column prop="beneficiaryType" label="类型" width="110" /><el-table-column prop="beneficiaryId" label="受益方" min-width="180" /><el-table-column label="比例" width="120"><template #default="{ row }">{{ rateText(row.splitRate) }}</template></el-table-column><el-table-column prop="sortOrder" label="顺序" width="80" /></el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, View } from '@element-plus/icons-vue'
import { useMediaQuery } from '@vueuse/core'
import { getProductList } from '@/api/product'
import {
  approveCommissionScheme, createCommissionScheme, getChannelList, getCommissionScheme,
  getCommissionSchemeList, publishCommissionScheme, retireCommissionScheme,
  type ChannelVO, type CommissionScheme, type CommissionSchemeStatus,
} from '@/api/channel'
import type { ProductVO } from '@/types/business.d'
import type { PageResult } from '@/types/api.d'
import { CURRENCY_OPTIONS } from '@/constants/locale'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'

const channels = ref<ChannelVO[]>([])
const products = ref<ProductVO[]>([])
const queryParams = reactive({ channelId: '', productId: '', status: undefined as CommissionSchemeStatus | undefined })
const isNarrowScreen = useMediaQuery('(max-width: 767px)')
const statusOptions = [{ label: '草稿', value: 'DRAFT' }, { label: '已审批', value: 'APPROVED' }, { label: '已发布', value: 'PUBLISHED' }, { label: '已退役', value: 'RETIRED' }]
const methodOptions = [{ label: '比例', value: 'PERCENTAGE' }, { label: '定额', value: 'FIXED' }, { label: '阶梯', value: 'TIERED' }]
const baseComponentOptions = ['BASE_PREMIUM', 'RISK_PREMIUM', 'GROSS_PREMIUM']
const statusLabel = (value: string) => statusOptions.find((item) => item.value === value)?.label || value
const methodLabel = (value: string) => methodOptions.find((item) => item.value === value)?.label || value
const rateText = (value?: number) => value === undefined ? '-' : `${(value * 100).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}%`
const amountText = (value?: number, currency = 'CNY') => value === undefined ? '-' : `${currency} ${value.toFixed(2)}`
const calculationLabel = (value: unknown) => { const row = value as CommissionScheme; return row.calculationMethod === 'PERCENTAGE' ? rateText(row.rate) : row.calculationMethod === 'FIXED' ? amountText(row.fixedAmount, row.currency) : `${row.tiers.length} 个阶梯` }

const emptyPage = (): PageResult<CommissionScheme> => ({ list: [], total: 0, pageNum: 1, pageSize: 20 })
const { tableData, tableLoading, pagination, fetchData, handleSearch, onPageChange, onSizeChange } = useTable<CommissionScheme, typeof queryParams>(
  (params) => params.channelId && params.productId ? getCommissionSchemeList(params) : Promise.resolve(emptyPage()), queryParams,
)

const createVisible = ref(false)
const detailVisible = ref(false)
const detail = ref<CommissionScheme | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()
const newTier = () => ({ lowerInclusive: 0, upperExclusive: undefined as number | undefined, rate: 0, fixedAmount: 0 })
const newSplit = () => ({ beneficiaryType: 'CHANNEL', beneficiaryId: queryParams.channelId, splitRate: 1, sortOrder: 1 })
const defaultForm = () => ({
  channelId: queryParams.channelId, productId: queryParams.productId, schemeCode: '', schemeVersion: 'V1.0', schemeName: '', description: '', currency: 'CNY',
  calculationMethod: 'PERCENTAGE' as CommissionScheme['calculationMethod'], rate: 0.1 as number | undefined, fixedAmount: undefined as number | undefined,
  capAmount: undefined as number | undefined, baseComponentCodes: ['BASE_PREMIUM'], tiers: [] as ReturnType<typeof newTier>[], splits: [newSplit()],
  policyYearFrom: 1, policyYearTo: 1, installmentCount: 1, clawbackMonths: 0, effectiveFrom: '', effectiveTo: '',
})
const form = reactive(defaultForm())
const splitTotal = computed(() => form.splits.reduce((total, item) => total + (item.splitRate || 0), 0))
const rules: FormRules = {
  schemeCode: [{ required: true, message: '请输入方案编码', trigger: 'blur' }],
  schemeVersion: [{ required: true, message: '请输入方案版本', trigger: 'blur' }],
  schemeName: [{ required: true, message: '请输入方案名称', trigger: 'blur' }],
  currency: [{ required: true, message: '请选择币种', trigger: 'change' }],
  effectiveFrom: [{ required: true, message: '请选择生效时间', trigger: 'change' }],
  baseComponentCodes: [{ required: true, type: 'array', min: 1, message: '至少选择一个佣金基数费用项', trigger: 'change' }],
}

function openCreate() { Object.assign(form, defaultForm()); createVisible.value = true }
async function submitCreate() {
  if (!await formRef.value?.validate().catch(() => false)) return
  if (form.calculationMethod === 'TIERED' && !form.tiers.length) return ElMessage.warning('阶梯佣金至少维护一个阶梯')
  if (!form.splits.every((item) => item.beneficiaryType && item.beneficiaryId)) return ElMessage.warning('请补齐分润受益方')
  if (Math.abs(splitTotal.value - 1) > 0.000001) return ElMessage.warning('分润比例合计必须为 100%')
  saving.value = true
  try {
    await createCommissionScheme({ ...form, effectiveTo: form.effectiveTo || undefined })
    createVisible.value = false
    ElMessage.success('佣金方案草稿已创建')
    await fetchData()
  } finally { saving.value = false }
}
async function showDetail(value: unknown) { const row = value as CommissionScheme; detail.value = await getCommissionScheme(row.schemeId); detailVisible.value = true }
async function approve(value: unknown) { const row = value as CommissionScheme; await approveCommissionScheme(row.schemeId); ElMessage.success('佣金方案已审批'); await fetchData() }
async function publish(value: unknown) { const row = value as CommissionScheme; await ElMessageBox.confirm('发布后可被定价包固定引用，确认发布？', '发布佣金方案', { type: 'warning' }); await publishCommissionScheme(row.schemeId); ElMessage.success('佣金方案已发布'); await fetchData() }
async function retire(value: unknown) { const row = value as CommissionScheme; await ElMessageBox.confirm('退役后不可用于新的定价包，确认继续？', '退役佣金方案', { type: 'warning' }); await retireCommissionScheme(row.schemeId); ElMessage.success('佣金方案已退役'); await fetchData() }

onMounted(async () => {
  const [channelPage, productPage] = await Promise.all([getChannelList({ pageNum: 1, pageSize: 100, status: 'ACTIVE' }), getProductList({ pageNum: 1, pageSize: 100 })])
  channels.value = channelPage.list
  products.value = productPage.list
  queryParams.channelId = channels.value[0]?.channelId || ''
  queryParams.productId = products.value[0]?.id || ''
  await fetchData()
})
</script>

<style scoped>
.page-intro { margin-bottom: 18px; }
h2 { margin: 0 0 8px; }
p { color: var(--ti-text-secondary, #86909c); margin: 0; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 20px; }
.inline-range { display: flex; align-items: center; gap: 8px; }
.add-row { margin-top: 10px; }
.split-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; color: var(--ti-text-secondary, #86909c); }
.hash-text { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
@media (max-width: 767px) {
  .ti-toolbar { align-items: stretch; flex-direction: column; }
  .ti-toolbar :deep(.el-form) { display: flex; flex-direction: column; }
  .ti-toolbar :deep(.el-form-item) { margin-right: 0; }
  .ti-toolbar :deep(.el-select) { width: 100% !important; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>
