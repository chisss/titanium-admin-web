<template>
  <!-- 保单查询列表页 -->
  <div class="ti-page">
    <!-- 搜索区（含基础+高级） -->
    <TiSearchForm
      :model="queryParams"
      :has-advanced="true"
      @search="handleSearch"
      @reset="handleReset"
    >
      <!-- 基础搜索 -->
      <el-form-item label="保单号">
        <el-input v-model="queryParams.policyNo" placeholder="精确查询" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="投保人">
        <el-input v-model="queryParams.holderName" placeholder="姓名" clearable style="width: 120px" />
      </el-form-item>
      <el-form-item label="证件号">
        <el-input v-model="queryParams.holderIdNo" placeholder="证件号码" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="手机号">
        <el-input v-model="queryParams.holderMobile" placeholder="手机号码" clearable style="width: 140px" />
      </el-form-item>
      <el-form-item label="产品名称">
        <el-input v-model="queryParams.productName" placeholder="模糊搜索" clearable style="width: 160px" />
      </el-form-item>

      <!-- 高级搜索 -->
      <template #advanced>
        <el-form-item label="保单状态">
          <el-select
            v-model="queryParams.statusList"
            multiple
            collapse-tags
            placeholder="可多选"
            style="width: 220px"
          >
            <el-option label="投保中" value="PROPOSAL" />
            <el-option label="待缴费" value="PENDING_PAYMENT" />
            <el-option label="生效中" value="ACTIVE" />
            <el-option label="已到期" value="EXPIRED" />
            <el-option label="已撤销" value="CANCELLED" />
            <el-option label="已终止" value="TERMINATED" />
          </el-select>
        </el-form-item>
        <el-form-item label="渠道">
          <TiDictSelect v-model="queryParams.channel" dict-type="CHANNEL_TYPE" style="width: 150px" />
        </el-form-item>
        <el-form-item label="缴费状态">
          <TiDictSelect v-model="queryParams.paymentStatus" dict-type="PAYMENT_STATUS" style="width: 140px" />
        </el-form-item>
        <el-form-item label="投保日期">
          <el-date-picker
            v-model="queryParams.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            value-format="YYYY-MM-DD"
            style="width: 220px"
          />
        </el-form-item>
        <el-form-item label="保费范围">
          <el-input-number
            v-model="queryParams.premiumMin"
            :min="0"
            placeholder="最低"
            style="width: 110px"
          />
          <span style="margin: 0 8px; color: #c0c4cc">-</span>
          <el-input-number
            v-model="queryParams.premiumMax"
            :min="0"
            placeholder="最高"
            style="width: 110px"
          />
        </el-form-item>
      </template>
    </TiSearchForm>

    <!-- 工具栏 -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <span class="toolbar-stat">共 <b>{{ pagination.total }}</b> 条保单</span>
      </div>
      <div class="ti-toolbar-right">
        <el-button :icon="Download" @click="handleExport">导出</el-button>
      </div>
    </div>

    <!-- 表格 -->
    <TiTable
      :data="tableData.value"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      row-key="id"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="policyNo" label="保单号" width="160" fixed="left">
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
      <el-table-column prop="holderName" label="投保人" width="100" />
      <el-table-column prop="insuredName" label="被保人" width="100" />
      <el-table-column prop="productName" label="产品名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="premium" label="保费" width="110">
        <template #default="{ row }">¥{{ row.premium?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="sumInsured" label="保额" width="120">
        <template #default="{ row }">¥{{ row.sumInsured?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="110">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" />
        </template>
      </el-table-column>
      <el-table-column prop="effectiveDate" label="起保日期" width="110" />
      <el-table-column prop="expiryDate" label="到期日期" width="110" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button text size="small" :icon="View" @click="goDetail(row.id)">详情</el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Download, View, CopyDocument } from '@element-plus/icons-vue'
import { getPolicyList, exportPolicies } from '@/api/policy'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import type { PolicyVO } from '@/types/business.d'

const router = useRouter()

const queryParams = reactive({
  policyNo: '',
  holderName: '',
  holderIdNo: '',
  holderMobile: '',
  productName: '',
  statusList: [] as string[],
  channel: undefined as string | undefined,
  paymentStatus: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
  premiumMin: undefined as number | undefined,
  premiumMax: undefined as number | undefined,
})

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<PolicyVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    return getPolicyList({
      ...rest,
      startDate: dateRange?.[0],
      endDate: dateRange?.[1],
    } as Parameters<typeof getPolicyList>[0])
  }, queryParams)

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

const handleExport = async () => {
  const blob = await exportPolicies(queryParams)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `保单列表_${new Date().toLocaleDateString()}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
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
