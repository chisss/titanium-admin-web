<template>
  <!-- 投保单查询列表页 -->
  <div class="ti-page">
    <!-- 搜索区 -->
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="投保单号">
        <el-input v-model="queryParams.insuranceNo" placeholder="精确查询" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="投保人">
        <el-input v-model="queryParams.holderName" placeholder="姓名" clearable style="width: 140px" />
      </el-form-item>
      <el-form-item label="证件号">
        <el-input v-model="queryParams.holderIdNo" placeholder="证件号码" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="产品名称">
        <el-input v-model="queryParams.productName" placeholder="模糊搜索" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="投保状态">
        <el-select v-model="queryParams.status" placeholder="请选择" clearable style="width: 140px">
          <el-option label="草稿" value="DRAFT" />
          <el-option label="待核保" value="PENDING_UNDERWRITING" />
          <el-option label="核保中" value="UNDERWRITING" />
          <el-option label="核保通过" value="APPROVED" />
          <el-option label="核保拒绝" value="REJECTED" />
          <el-option label="已出单" value="ISSUED" />
          <el-option label="已失效" value="EXPIRED" />
        </el-select>
      </el-form-item>
      <el-form-item label="投保日期">
        <el-date-picker
          v-model="queryParams.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 240px"
        />
      </el-form-item>
    </TiSearchForm>

    <!-- 工具栏 -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <span class="toolbar-stat">共 <b>{{ pagination.total }}</b> 条投保单</span>
      </div>
      <div class="ti-toolbar-right">
        <el-button :icon="Download" @click="handleExport">导出</el-button>
      </div>
    </div>

    <!-- 表格 -->
    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      row-key="id"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column type="index" label="序号" width="60" align="center" fixed="left" />
      <el-table-column prop="insuranceNo" label="投保单号" width="180" fixed="left">
        <template #default="{ row }">
          <TiCopyText :text="row.insuranceNo" />
        </template>
      </el-table-column>
      <el-table-column prop="productName" label="产品名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="holderName" label="投保人" width="120" />
      <el-table-column prop="holderIdNo" label="证件号码" width="180" show-overflow-tooltip />
      <el-table-column prop="status" label="投保状态" width="120">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="getStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="totalPremium" label="总保费" width="130" align="right">
        <template #default="{ row }">
          {{ row.totalPremium ? `¥${row.totalPremium.toLocaleString()}` : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="applicantName" label="经办人" width="100" />
      <el-table-column prop="createdAt" label="投保时间" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" :icon="View" @click="handleDetail(row)">详情</el-button>
          <el-button
            v-if="row.status === 'DRAFT'"
            link
            type="warning"
            :icon="Edit"
            @click="handleEdit(row)"
          >
            编辑
          </el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, View, Edit } from '@element-plus/icons-vue'
import { getInsuranceList, type InsuranceVO } from '@/api/insurance'
import { useTable } from '@/composables/useTable'
import { formatDateTime } from '@/utils/date'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'

/** 投保单查询参数 */
const queryParams = reactive({
  insuranceNo: '',
  holderName: '',
  holderIdNo: '',
  productName: '',
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

/** 投保单状态标签 */
const getStatusLabel = (status: string): string => {
  const statusMap: Record<string, string> = {
    DRAFT: '草稿',
    PENDING_UNDERWRITING: '待核保',
    UNDERWRITING: '核保中',
    APPROVED: '核保通过',
    REJECTED: '核保拒绝',
    ISSUED: '已出单',
    EXPIRED: '已失效',
  }
  return statusMap[status] || status
}

/** 表格数据 */
const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<InsuranceVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    // 注意：后端暂不支持日期范围查询，先去掉 dateRange
    return getInsuranceList(rest)
  }, queryParams)

// 初始加载
fetchData()

/** 查看详情 */
const handleDetail = (row: InsuranceVO) => {
  ElMessage.info(`查看投保单详情: ${row.insuranceNo}`)
  // TODO: 路由跳转到详情页
  // router.push(`/policy/application/detail/${row.id}`)
}

/** 编辑投保单 */
const handleEdit = (row: InsuranceVO) => {
  ElMessage.info(`编辑投保单: ${row.insuranceNo}`)
  // TODO: 路由跳转到编辑页
  // router.push(`/policy/application/edit/${row.id}`)
}

/** 导出投保单 */
const handleExport = () => {
  ElMessage.info('导出功能开发中...')
  // TODO: 实现导出功能
}
</script>

<style scoped lang="scss">
.toolbar-stat {
  font-size: 14px;
  color: #606266;

  b {
    color: #409eff;
    font-size: 16px;
  }
}
</style>
