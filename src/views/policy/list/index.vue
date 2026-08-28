<template>
  <!-- 保单查询列表页 -->
  <div class="ti-page">
    <!-- 搜索区 -->
    <TiSearchForm
      :model="queryParams"
      @search="handleSearch"
      @reset="handleReset"
    >
      <!-- 基础搜索 -->
      <el-form-item label="保单号">
        <el-input v-model="queryParams.policyNo" placeholder="精确查询" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="投保人">
        <el-input v-model="queryParams.policyHolderName" placeholder="姓名" clearable style="width: 120px" />
      </el-form-item>
      <el-form-item label="被保人">
        <el-input v-model="queryParams.insuredName" placeholder="姓名" clearable style="width: 120px" />
      </el-form-item>
      <el-form-item label="产品编码">
        <el-input v-model="queryParams.productCode" placeholder="产品编码" clearable style="width: 150px" />
      </el-form-item>
      <el-form-item label="保单状态">
        <TiDictSelect v-model="queryParams.status" dict-type="POLICY_STATUS" placeholder="全部" style="width: 140px" />
      </el-form-item>
    </TiSearchForm>

    <!-- 工具栏 -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <span class="toolbar-stat">共 <b>{{ pagination.total }}</b> 条保单</span>
      </div>
    </div>

    <!-- 表格 -->
    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      row-key="policyId"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="policyNo" label="保单号" width="160" fixed="left" class-name="ti-code-column">
        <template #default="{ row }">
          <span class="policy-no">{{ row.policyNo }}</span>
          <el-icon
            class="copy-icon"
            title="复制"
            @click.stop="copyText(row.policyNo)"
          >
            <CopyDocument />
          </el-icon>
        </template>
      </el-table-column>
      <el-table-column prop="policyHolderName" label="投保人" width="120" />
      <el-table-column prop="insuredName" label="被保人" width="120" />
      <el-table-column prop="productName" label="产品名称" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.productName || row.productCode || '-' }}</template>
      </el-table-column>
      <el-table-column prop="premium" label="保费" width="110">
        <template #default="{ row }">¥{{ row.premium?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="sumInsured" label="保额" width="120">
        <template #default="{ row }">¥{{ row.sumInsured?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="110">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="policyStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="effectiveDate" label="起保日期" width="110">
        <template #default="{ row }">{{ formatDate(row.effectiveDate) }}</template>
      </el-table-column>
      <el-table-column prop="expiryDate" label="到期日期" width="110">
        <template #default="{ row }">{{ formatDate(row.expiryDate) }}</template>
      </el-table-column>
      <el-table-column label="操作" min-width="100" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="goDetail(row.policyId)">详情</el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { View, CopyDocument } from '@element-plus/icons-vue'
import { getPolicyList } from '@/api/policy'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'
import type { PolicyVO } from '@/types/business.d'

const { getLabel: policyStatusLabel } = useDict('POLICY_STATUS')

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return '-'
  return dateStr.split('T')[0] // YYYY-MM-DD
}

const router = useRouter()

const queryParams = reactive({
  policyNo: '',
  policyHolderName: '',
  insuredName: '',
  productCode: '',
  status: undefined as string | undefined,
})

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<PolicyVO, typeof queryParams>((params) => getPolicyList(params), queryParams)

fetchData()

const goDetail = (id: string) => router.push(`/policy/detail/${id}`)

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('复制成功')
  } catch {
    ElMessage.error('复制失败')
  }
}

</script>

<style scoped lang="scss">
.policy-no {
  font-family: monospace;
  font-size: 13px;
}

.copy-icon {
  margin-left: 4px;
  cursor: pointer;
  color: #c0c4cc;
  font-size: 12px;
  vertical-align: middle;

  &:hover { color: $primary-color; }
}

.toolbar-stat {
  font-size: 13px;
  color: #606266;
}
</style>
