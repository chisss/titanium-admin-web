<template>
  <div class="ti-page">
    <div class="page-intro">
      <div>
        <h2>费率表配置</h2>
        <p>维护产品定价所引用的版本化费率数据。发布前必须完成校验，已发布版本不可直接修改。</p>
      </div>
    </div>
    <!-- 搜索区：两个字段都保留 @change 即时筛选（原有习惯），搜索键作为显式入口并存 -->
    <TiSearchForm :model="queryParams" @search="loadTables" @reset="handleReset">
      <el-form-item label="产品">
        <el-select v-model="productId" filterable clearable placeholder="选择产品" style="width: 320px" @change="loadTables">
          <el-option v-for="product in products" :key="product.id" :label="`${product.name} (${product.code})`" :value="product.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态"><TiDictSelect v-model="status" dict-type="RATE_TABLE_STATUS" style="width: 140px" @change="loadTables" /></el-form-item>
    </TiSearchForm>
    <!-- 主操作独居工具栏：全站同类页（system/user、system/role、system/menu、product/list）
         的单个主操作一律放 ti-toolbar-left，此处沿用；原先它靠 space-between 的第二个子元素
         被推到右侧，那是布局副作用而非约定 -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :disabled="!productId" v-permission="'product:rate-table:create'" @click="createDialog = true">新建费率表</el-button>
      </div>
    </div>
    <el-alert v-if="!productId" title="请选择产品，再维护该产品的费率表版本。" type="info" :closable="false" />
    <TiTable
      v-else
      :data="tables"
      :loading="loading"
      :max-height="'var(--ti-table-max-height-default)'"
    >
      <el-table-column prop="tableCode" label="费率表编码" min-width="160" />
      <el-table-column prop="tableVersion" label="版本" width="100" />
      <el-table-column prop="rateUnit" label="费率单位" width="150"><template #default="{ row }">{{ rateUnitLabel(row.rateUnit) }}</template></el-table-column>
      <el-table-column prop="currency" label="币种" width="90" />
      <el-table-column prop="rowCount" label="费率行数" width="100" />
      <el-table-column label="状态" width="110"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
      <el-table-column label="操作" fixed="right" min-width="320" class-name="ti-action-column">
        <template #default="{ row }">
          <!-- 🔴 这几处的权限判在 `v-if` 表达式里，不用 v-permission 指令：这些按钮**自带 v-if**
               （DRAFT/PUBLISHED 状态门），指令在 mounted 里 `el.parentNode.removeChild(el)` 直接改
               真实 DOM，与同一元素上的动态挂载/卸载叠加会让 vnode 树与实际 DOM 不一致。
               权限码取自 ProductProxyController：/validate 与 /rows 用 PRODUCT_RATE_TABLE_EDIT，
               /publish 与 /retire 共用 PRODUCT_RATE_TABLE_PUBLISH（退役不是独立码）。 -->
          <el-button size="small" :icon="Tickets" @click="openDetail(row)">明细</el-button>
          <el-button v-if="row.status === 'DRAFT' && hasPermission('product:rate-table:edit')" size="small" @click="openRows(row)">维护费率行</el-button>
          <!-- pending 键统一取 `行主键:动作名`（actionKey）：校验/发布与退役虽按状态互斥、当前不会
               同时可见，但键里写清动作名既让 rowPending 自解释，也保证今后本行再加动作按钮时，
               不会退化成「两个按钮共用一个键、点一个另一个也转圈」 -->
          <el-button v-if="row.status === 'DRAFT' && hasPermission('product:rate-table:publish')" size="small" type="success" :icon="Select" :loading="rowPending === actionKey(row.tableId, 'publish')" @click="validate(row)">校验/发布</el-button>
          <el-button v-if="row.status === 'PUBLISHED' && hasPermission('product:rate-table:publish')" size="small" type="danger" :icon="Remove" :loading="rowPending === actionKey(row.tableId, 'retire')" @click="retire(row)">退役</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="当前产品暂无费率表">
          <el-button type="primary" v-permission="'product:rate-table:create'" @click="createDialog = true">新建费率表</el-button>
        </el-empty>
      </template>
    </TiTable>

    <el-dialog v-model="createDialog" title="新建费率表草稿" width="560px">
      <el-form :model="createForm" label-width="120px">
        <el-form-item label="费率表编码"><el-input v-model="createForm.tableCode" /></el-form-item>
        <el-form-item label="版本"><el-input v-model="createForm.tableVersion" /></el-form-item>
        <el-form-item label="费率单位"><TiDictSelect v-model="createForm.rateUnit" dict-type="RATE_UNIT" :clearable="false" /></el-form-item>
        <el-form-item label="币种"><TiDictSelect v-model="createForm.currency" dict-type="CURRENCY" :clearable="false" filterable /></el-form-item>
        <el-form-item label="生效时间"><el-date-picker v-model="createForm.effectiveFrom" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
        <el-form-item label="维度键"><TiDictSelect v-model="createForm.dimensionKeys" dict-type="RATE_DIMENSION" multiple filterable /></el-form-item>
      </el-form>
      <!-- 对话框内的保存按钮走 saving + try/finally 范式，不用 useRowAction：对话框是模态的，
           同一时刻只可能有一个保存在途，pending 绑到行主键没有对象可绑 -->
      <template #footer><el-button @click="createDialog = false">取消</el-button><el-button type="primary" :loading="createSaving" @click="submitCreate">创建</el-button></template>
    </el-dialog>

    <el-dialog v-model="rowsDialog" title="维护费率行" width="1180px">
      <el-table :data="editingRows" stripe>
        <el-table-column label="年龄起" width="100"><template #default="{ row }"><el-input-number v-model="row.ageFrom" :min="0" controls-position="right" /></template></el-table-column>
        <el-table-column label="年龄止(开区间)" width="130"><template #default="{ row }"><el-input-number v-model="row.ageToExclusive" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="性别" width="120"><template #default="{ row }"><TiDictSelect v-model="row.gender" dict-type="GENDER" :clearable="false" /></template></el-table-column>
        <el-table-column label="缴费年限" width="120"><template #default="{ row }"><el-input-number v-model="row.paymentTermYears" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="保障年限" width="120"><template #default="{ row }"><el-input-number v-model="row.coverageTermYears" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="费率" width="140"><template #default="{ row }"><el-input-number v-model="row.rate" :min="0" :precision="8" controls-position="right" /></template></el-table-column>
        <el-table-column label="最低保费" width="140"><template #default="{ row }"><el-input-number v-model="row.minimumPremium" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
        <el-table-column label="最高保费" width="140"><template #default="{ row }"><el-input-number v-model="row.maximumPremium" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
        <el-table-column label="操作" width="100" class-name="ti-action-column"><template #default="{ $index }"><el-button size="small" type="danger" :icon="Delete" @click="editingRows.splice($index, 1)">删除</el-button></template></el-table-column>
      </el-table>
      <el-button class="add-row" @click="addRow">新增一行</el-button>
      <template #footer><el-button @click="rowsDialog = false">取消</el-button><el-button type="primary" :loading="rowsSaving" @click="saveRows">保存费率行</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="费率表明细" size="72%">
      <el-descriptions :column="detailColumns" border>
        <el-descriptions-item label="费率表">{{ detail?.tableCode }}</el-descriptions-item>
        <el-descriptions-item label="版本">{{ detail?.tableVersion }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusLabel(detail?.status || '') }}</el-descriptions-item>
        <el-descriptions-item label="费率单位">{{ rateUnitLabel(detail?.rateUnit || '') }}</el-descriptions-item>
        <el-descriptions-item label="币种">{{ detail?.currency }}</el-descriptions-item>
        <!-- 时间统一走全局日期工具，避免直出后端 ISO 串（2026-09-18 全站实测） -->
        <el-descriptions-item label="生效时间">{{ formatDateTime(detail?.effectiveFrom) }}</el-descriptions-item>
        <el-descriptions-item label="定价维度" :span="3">
          <el-tag v-for="key in detail?.dimensionKeys || []" :key="key" class="dimension-tag">{{ dimensionLabel(key) }}</el-tag>
        </el-descriptions-item>
      </el-descriptions>
      <el-divider content-position="left">费率行</el-divider>
      <el-table :data="detail?.rows || []" stripe>
        <el-table-column prop="ageFrom" label="年龄起" width="90" />
        <el-table-column prop="ageToExclusive" label="年龄止" width="90" />
        <el-table-column label="性别" width="90"><template #default="{ row }">{{ genderLabel(row.gender) }}</template></el-table-column>
        <el-table-column prop="paymentTermYears" label="缴费年限" width="110" />
        <el-table-column prop="coverageTermYears" label="保障年限" width="110" />
        <el-table-column prop="rate" label="费率" min-width="120" />
        <el-table-column prop="minimumPremium" label="最低保费" min-width="110" align="right">
          <template #default="{ row }">{{ formatAmount(row.minimumPremium) }}</template>
        </el-table-column>
        <el-table-column prop="maximumPremium" label="最高保费" min-width="110" align="right">
          <template #default="{ row }">{{ formatAmount(row.maximumPremium) }}</template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, toRefs, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Remove, Select, Tickets } from '@element-plus/icons-vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDetailColumns } from '@/composables/useDetailColumns'
import { useDict } from '@/composables/useDict'
import { usePermission } from '@/composables/usePermission'
import { useRowAction, confirmAction, actionKey } from '@/composables/useRowAction'
import { formatAmount } from '@/utils/format'
import { formatDateTime } from '@/utils/date'
import { listRateTables, getRateTable, createRateTable, replaceRateTableRows, validateRateTable, publishRateTable, retireRateTable, type RateTable, type RateTableRow } from '@/api/pricing'
import { getProductList } from '@/api/product'
import type { ProductVO } from '@/types/business.d'

// 检索条件收进单一对象：TiSearchForm 的 `:model` 与下方字段绑定必须指向**同一份数据**。
// 若字段仍绑在独立的 ref 上、另一个对象当 model，重置还原的是 model 的副本，
// 界面纹丝不动 —— 又是一个「有按钮、没反应」。toRefs 把两个字段变成 queryParams 的属性视图，
// 于是模板里 `v-model="productId"` 与脚本里 `productId.value` 全都零改动。
const queryParams = reactive({ productId: '', status: '' })
const { productId, status } = toRefs(queryParams)
const products = ref<ProductVO[]>([])
const tables = ref<RateTable[]>([])
/** 描述区：字段短，宽屏 3 档 */
const detailColumns = useDetailColumns(3)
/** 操作列的权限判定（判在 v-if 表达式里，见模板注释） */
const { hasPermission } = usePermission()

/**
 * 行内状态推进（校验/发布、退役）的 pending 与错误兜底统一由 useRowAction 承担：
 * 置 pending → 发请求 → 成功后刷新列表 → finally 复位；失败不刷新，列表保持原状，
 * 用户才看得出这一步没成。校验/发布与退役都是低频高危的状态推进，
 * 请求期间按钮毫无变化会被当成没点中而重复提交。
 */
const { rowPending, run } = useRowAction(loadTables)

const loading = ref(false)
/**
 * 两个对话框各自一个在途标记，不复用一个 `saving`：新建草稿与保存费率行是两个独立的
 * 保存作用域，名字里带对话框名才能一眼看出「转的是哪个按钮的圈」
 * （本仓先例：product/create 的 saving 与 templateSaving 并存）。
 */
const createSaving = ref(false)
const rowsSaving = ref(false)
const createDialog = ref(false)
const rowsDialog = ref(false)
const detailVisible = ref(false)
const detail = ref<RateTable | null>(null)
const current = ref<RateTable | null>(null)
const editingRows = ref<RateTableRow[]>([])
const createForm = reactive({ tableCode: '', tableVersion: 'V1.0', rateUnit: 'SUM_INSURED_RATIO', currency: 'CNY', effectiveFrom: '', dimensionKeys: ['age'] })
const { getLabel: statusLabel } = useDict('RATE_TABLE_STATUS')
const { getLabel: dimensionLabel } = useDict('RATE_DIMENSION')
const { getLabel: rateUnitLabel } = useDict('RATE_UNIT')
const { getLabel: genderDictLabel } = useDict('GENDER')
const genderLabel = (value?: string) => value ? genderDictLabel(value) : '-'

async function loadTables() {
  if (!productId.value) return
  loading.value = true
  try { tables.value = await listRateTables(productId.value, status.value || undefined) } finally { loading.value = false }
}
async function loadProducts() {
  const result = await getProductList({ pageNum: 1, pageSize: 100 })
  products.value = result.list
  if (!productId.value && products.value.length) {
    productId.value = products.value[0].id
    await loadTables()
  }
}
/**
 * 重置检索条件。
 *
 * <p>还原 productId/status 由 TiSearchForm 自己完成（它先还原、再 emit，见其 handleReset 注释），
 * 这里只处理组件管不到的部分。**且刻意不重新自动选中第一个产品** ——
 * 重置的语义是「清空全部条件」，落在本页就是回到「请选择产品」这个设计好的空态
 * （模板里的 el-alert 就是为它准备的）。若在此处重新自动选中，用户在默认产品上点重置
 * 会看不到任何变化，反倒是「有按钮、没反应」。列表残留一并清掉，避免空态下留着上一个产品的数据。</p>
 */
function handleReset() {
  tables.value = []
}
async function submitCreate() {
  // 校验前置到 pending 置位之前：不满足直接 return，无需再把按钮从 loading 态手动复位
  if (!createForm.tableCode || !createForm.effectiveFrom) return ElMessage.warning('请补齐费率表编码和生效时间')
  createSaving.value = true
  try {
    await createRateTable(productId.value, createForm)
    createDialog.value = false
    ElMessage.success('费率表草稿已创建')
    await loadTables()
  } finally {
    // 失败时不关对话框、不刷新列表：表单里填的内容留在原地，改完可直接重试
    createSaving.value = false
  }
}
function openRows(row: unknown) { const table = row as RateTable; current.value = table; editingRows.value = table.rows.map((item) => ({ ...item })); rowsDialog.value = true }
function addRow() { editingRows.value.push({ gender: 'ALL', paymentTermYears: 1, coverageTermYears: 1, rate: 0 }) }
async function saveRows() {
  if (!current.value) return
  rowsSaving.value = true
  try {
    await replaceRateTableRows(productId.value, current.value.tableId, editingRows.value)
    rowsDialog.value = false
    ElMessage.success('费率行已保存')
    await loadTables()
  } finally {
    // 失败时对话框与编辑中的费率行一律保留：整表替换是一次性提交，关掉就等于用户刚录入的行白填
    rowsSaving.value = false
  }
}
/**
 * 校验并发布草稿费率表。
 *
 * <p>一个按钮承载两步写操作（先校验、后发布），故确认框必须在 `run` 之内：
 * 只有校验请求返回「通过」才谈得上发布，把确认提到 `run` 之外就断了这条依赖。
 * pending 因此覆盖「校验 → 等用户确认 → 发布」全程——校验是后端重算，
 * 期间按钮无反馈会被当成没点中而重复触发，重复校验/重复发布代价远大于一次多余的转圈。</p>
 */
async function validate(row: unknown) {
  const table = row as RateTable
  await run(actionKey(table.tableId, 'publish'), async () => {
    await validateRateTable(productId.value, table.tableId)
    // 用户取消用 return 表达：取消不是错误，抛出会被 run 当成失败走错误分支。
    // 校验结果保留不回收，刷新列表也照常（校验可能已改动服务端状态）。
    if (!(await confirmAction('费率表校验通过，确认发布该版本？', '发布确认', { type: 'warning' }))) return
    await publishRateTable(productId.value, table.tableId)
    ElMessage.success('费率表已发布')
  })
}
async function retire(row: unknown) {
  const table = row as RateTable
  // 与 validate 相反，这里先确认再置 pending：用户还在确认框上犹豫时按钮不该在背后转圈
  if (!(await confirmAction('退役后该版本不能再用于新计算，确认继续？', '退役确认', { type: 'warning', confirmButtonClass: 'el-button--danger' }))) return
  await run(actionKey(table.tableId, 'retire'), async () => {
    await retireRateTable(productId.value, table.tableId)
    ElMessage.success('费率表已退役')
  })
}
async function openDetail(row: unknown) { const table = row as RateTable; detail.value = await getRateTable(productId.value, table.tableId); detailVisible.value = true }
onMounted(loadProducts)
</script>

<style scoped lang="scss">
.page-intro { margin-bottom: 18px; } h2 { margin: 0 0 8px; } p { color: $text-secondary; margin: 0; } .add-row { margin-top: 12px; } .json-view { white-space: pre-wrap; word-break: break-all; }
</style>
