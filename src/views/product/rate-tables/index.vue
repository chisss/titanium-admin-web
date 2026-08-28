<template>
  <div class="ti-page">
    <div class="page-intro">
      <div>
        <h2>费率表配置</h2>
        <p>维护产品定价所引用的版本化费率数据。发布前必须完成校验，已发布版本不可直接修改。</p>
      </div>
    </div>
    <div class="ti-toolbar">
      <el-form inline>
        <el-form-item label="产品">
          <el-select v-model="productId" filterable clearable placeholder="选择产品" style="width: 320px" @change="loadTables">
            <el-option v-for="product in products" :key="product.id" :label="`${product.name} (${product.code})`" :value="product.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态"><TiDictSelect v-model="status" dict-type="RATE_TABLE_STATUS" style="width: 140px" @change="loadTables" /></el-form-item>
        <el-button type="primary" @click="loadTables">查询</el-button>
      </el-form>
      <el-button type="primary" :disabled="!productId" v-permission="'product:rate-table:create'" @click="createDialog = true">新建费率表</el-button>
    </div>
    <el-alert v-if="!productId" title="请选择产品，再维护该产品的费率表版本。" type="info" :closable="false" />
    <el-table v-else v-loading="loading" :data="tables" border>
      <el-table-column prop="tableCode" label="费率表编码" min-width="160" />
      <el-table-column prop="tableVersion" label="版本" width="100" />
      <el-table-column prop="rateUnit" label="费率单位" width="150"><template #default="{ row }">{{ rateUnitLabel(row.rateUnit) }}</template></el-table-column>
      <el-table-column prop="currency" label="币种" width="90" />
      <el-table-column prop="rowCount" label="费率行数" width="100" />
      <el-table-column label="状态" width="110"><template #default="{ row }"><TiStatusTag :value="row.status" :label="statusLabel(row.status)" /></template></el-table-column>
      <el-table-column label="操作" fixed="right" width="280">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">明细</el-button>
          <el-button v-if="row.status === 'DRAFT'" link v-permission="'product:rate-table:edit'" @click="openRows(row)">维护费率行</el-button>
          <el-button v-if="row.status === 'DRAFT'" link type="success" v-permission="'product:rate-table:publish'" @click="validate(row)">校验/发布</el-button>
          <el-button v-if="row.status === 'PUBLISHED'" link type="danger" @click="retire(row)">退役</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="当前产品暂无费率表">
          <el-button type="primary" v-permission="'product:rate-table:create'" @click="createDialog = true">新建费率表</el-button>
        </el-empty>
      </template>
    </el-table>

    <el-dialog v-model="createDialog" title="新建费率表草稿" width="560px">
      <el-form :model="createForm" label-width="110px">
        <el-form-item label="费率表编码"><el-input v-model="createForm.tableCode" /></el-form-item>
        <el-form-item label="版本"><el-input v-model="createForm.tableVersion" /></el-form-item>
        <el-form-item label="费率单位"><TiDictSelect v-model="createForm.rateUnit" dict-type="RATE_UNIT" :clearable="false" /></el-form-item>
        <el-form-item label="币种"><TiDictSelect v-model="createForm.currency" dict-type="CURRENCY" :clearable="false" filterable /></el-form-item>
        <el-form-item label="生效时间"><el-date-picker v-model="createForm.effectiveFrom" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item>
        <el-form-item label="维度键"><TiDictSelect v-model="createForm.dimensionKeys" dict-type="RATE_DIMENSION" multiple filterable /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createDialog = false">取消</el-button><el-button type="primary" @click="submitCreate">创建</el-button></template>
    </el-dialog>

    <el-dialog v-model="rowsDialog" title="维护费率行" width="1180px">
      <el-table :data="editingRows" border>
        <el-table-column label="年龄起" width="100"><template #default="{ row }"><el-input-number v-model="row.ageFrom" :min="0" controls-position="right" /></template></el-table-column>
        <el-table-column label="年龄止(开区间)" width="130"><template #default="{ row }"><el-input-number v-model="row.ageToExclusive" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="性别" width="120"><template #default="{ row }"><TiDictSelect v-model="row.gender" dict-type="GENDER" :clearable="false" /></template></el-table-column>
        <el-table-column label="缴费年限" width="120"><template #default="{ row }"><el-input-number v-model="row.paymentTermYears" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="保障年限" width="120"><template #default="{ row }"><el-input-number v-model="row.coverageTermYears" :min="1" controls-position="right" /></template></el-table-column>
        <el-table-column label="费率" width="140"><template #default="{ row }"><el-input-number v-model="row.rate" :min="0" :precision="8" controls-position="right" /></template></el-table-column>
        <el-table-column label="最低保费" width="140"><template #default="{ row }"><el-input-number v-model="row.minimumPremium" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
        <el-table-column label="最高保费" width="140"><template #default="{ row }"><el-input-number v-model="row.maximumPremium" :min="0" :precision="2" controls-position="right" /></template></el-table-column>
        <el-table-column label="操作" width="80"><template #default="{ $index }"><el-button link type="danger" @click="editingRows.splice($index, 1)">删除</el-button></template></el-table-column>
      </el-table>
      <el-button class="add-row" @click="addRow">新增一行</el-button>
      <template #footer><el-button @click="rowsDialog = false">取消</el-button><el-button type="primary" @click="saveRows">保存费率行</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="费率表明细" size="72%">
      <el-descriptions :column="3" border>
        <el-descriptions-item label="费率表">{{ detail?.tableCode }}</el-descriptions-item>
        <el-descriptions-item label="版本">{{ detail?.tableVersion }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusLabel(detail?.status || '') }}</el-descriptions-item>
        <el-descriptions-item label="费率单位">{{ rateUnitLabel(detail?.rateUnit || '') }}</el-descriptions-item>
        <el-descriptions-item label="币种">{{ detail?.currency }}</el-descriptions-item>
        <el-descriptions-item label="生效时间">{{ detail?.effectiveFrom }}</el-descriptions-item>
        <el-descriptions-item label="定价维度" :span="3">
          <el-tag v-for="key in detail?.dimensionKeys || []" :key="key" class="dimension-tag">{{ dimensionLabel(key) }}</el-tag>
        </el-descriptions-item>
      </el-descriptions>
      <el-divider content-position="left">费率行</el-divider>
      <el-table :data="detail?.rows || []" border>
        <el-table-column prop="ageFrom" label="年龄起" width="90" />
        <el-table-column prop="ageToExclusive" label="年龄止" width="90" />
        <el-table-column label="性别" width="90"><template #default="{ row }">{{ genderLabel(row.gender) }}</template></el-table-column>
        <el-table-column prop="paymentTermYears" label="缴费年限" width="110" />
        <el-table-column prop="coverageTermYears" label="保障年限" width="110" />
        <el-table-column prop="rate" label="费率" min-width="120" />
        <el-table-column prop="minimumPremium" label="最低保费" min-width="110" />
        <el-table-column prop="maximumPremium" label="最高保费" min-width="110" />
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'
import { listRateTables, getRateTable, createRateTable, replaceRateTableRows, validateRateTable, publishRateTable, retireRateTable, type RateTable, type RateTableRow } from '@/api/pricing'
import { getProductList } from '@/api/product'
import type { ProductVO } from '@/types/business.d'

const productId = ref('')
const products = ref<ProductVO[]>([])
const status = ref('')
const tables = ref<RateTable[]>([])
const loading = ref(false)
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
async function submitCreate() {
  if (!createForm.tableCode || !createForm.effectiveFrom) return ElMessage.warning('请补齐费率表编码和生效时间')
  await createRateTable(productId.value, createForm)
  createDialog.value = false
  ElMessage.success('费率表草稿已创建')
  await loadTables()
}
function openRows(row: unknown) { const table = row as RateTable; current.value = table; editingRows.value = table.rows.map((item) => ({ ...item })); rowsDialog.value = true }
function addRow() { editingRows.value.push({ gender: 'ALL', paymentTermYears: 1, coverageTermYears: 1, rate: 0 }) }
async function saveRows() {
  if (!current.value) return
  await replaceRateTableRows(productId.value, current.value.tableId, editingRows.value)
  rowsDialog.value = false; ElMessage.success('费率行已保存'); await loadTables()
}
async function validate(row: unknown) {
  const table = row as RateTable
  await validateRateTable(productId.value, table.tableId)
  await ElMessageBox.confirm('费率表校验通过，确认发布该版本？', '发布确认', { type: 'warning' })
  await publishRateTable(productId.value, table.tableId); ElMessage.success('费率表已发布'); await loadTables()
}
async function retire(row: unknown) { const table = row as RateTable; await ElMessageBox.confirm('退役后该版本不能再用于新计算，确认继续？', '退役确认', { type: 'warning' }); await retireRateTable(productId.value, table.tableId); ElMessage.success('费率表已退役'); await loadTables() }
async function openDetail(row: unknown) { const table = row as RateTable; detail.value = await getRateTable(productId.value, table.tableId); detailVisible.value = true }
onMounted(loadProducts)
</script>

<style scoped>
.page-intro { margin-bottom: 18px; } h2 { margin: 0 0 8px; } p { color: var(--ti-text-secondary, #86909c); margin: 0; } .add-row { margin-top: 12px; } .json-view { white-space: pre-wrap; word-break: break-all; }
</style>
