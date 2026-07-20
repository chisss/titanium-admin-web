<template>
  <!-- 产品管理列表页 -->
  <div class="ti-page">
    <!-- 搜索区 -->
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="产品名称">
        <el-input v-model="queryParams.name" placeholder="模糊搜索" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="险种分类">
        <TiDictSelect v-model="queryParams.category" dict-type="INSURANCE_CATEGORY" style="width: 150px" />
      </el-form-item>
      <el-form-item label="产品状态">
        <TiDictSelect v-model="queryParams.status" dict-type="PRODUCT_STATUS" style="width: 130px" />
      </el-form-item>
      <el-form-item label="创建时间">
        <el-date-picker
          v-model="queryParams.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 220px"
        />
      </el-form-item>
    </TiSearchForm>

    <!-- 工具栏 -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <el-button type="primary" :icon="Plus" v-permission="'product:create'" @click="goCreate">
          新建产品
        </el-button>
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
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="name" label="产品名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="code" label="产品代码" width="140" />
      <el-table-column prop="category" label="险种分类" width="110">
        <template #default="{ row }">
          {{ getCategoryLabel(row.category) }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="110">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="getStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="minPremium" label="最低保费" width="120">
        <template #default="{ row }">
          {{ row.minPremium ? `¥${row.minPremium.toLocaleString()}` : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="createdBy" label="创建人" width="100" />
      <el-table-column prop="createdAt" label="创建时间" width="160" />
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button text size="small" :icon="View" @click="goDetail(row.id)">详情</el-button>
          <el-button
            v-if="row.status === 'DRAFT'"
            text size="small" :icon="Edit"
            v-permission="'product:edit'"
            @click="goEdit(row.id)"
          >
            编辑
          </el-button>
          <el-button
            v-if="row.status === 'DRAFT'"
            text size="small" type="warning"
            v-permission="'product:submit'"
            @click="handleSubmit(row)"
          >
            提交审核
          </el-button>
          <el-button
            v-if="row.status === 'PENDING'"
            text size="small" type="success"
            v-permission="'product:activate'"
            @click="handleActivate(row)"
          >
            上架
          </el-button>
          <el-button
            v-if="row.status === 'ACTIVE'"
            text size="small" type="danger"
            v-permission="'product:deactivate'"
            @click="handleDeactivate(row)"
          >
            下架
          </el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Download, View, Edit } from '@element-plus/icons-vue'
import { getProductList, activateProduct, deactivateProduct, submitProductForReview, exportProducts } from '@/api/product'
import { useTable } from '@/composables/useTable'
import { useDict } from '@/composables/useDict'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import type { ProductVO } from '@/types/business.d'

const router = useRouter()

// 查询参数
const queryParams = reactive({
  name: '',
  category: undefined as string | undefined,
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

// 字典
const { getLabel: getCategoryLabel } = useDict('INSURANCE_CATEGORY')
const { getLabel: getStatusLabel } = useDict('PRODUCT_STATUS')

// 表格数据
const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<ProductVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    return getProductList({
      ...rest,
      startDate: dateRange?.[0],
      endDate: dateRange?.[1],
    } as Parameters<typeof getProductList>[0])
  }, queryParams)

// 初始加载
fetchData()

const goCreate = () => router.push('/product/create')
const goDetail = (id: string) => router.push(`/product/detail/${id}`)
const goEdit = (id: string) => router.push(`/product/create?id=${id}`)

const handleSubmit = async (row: ProductVO) => {
  await ElMessageBox.confirm(`确认提交产品"${row.name}"审核？`, '提示', { type: 'warning' })
  await submitProductForReview(row.id)
  ElMessage.success('提交成功')
  fetchData()
}

const handleActivate = async (row: ProductVO) => {
  await ElMessageBox.confirm(`确认上架产品"${row.name}"？`, '提示', { type: 'warning' })
  await activateProduct(row.id)
  ElMessage.success('上架成功')
  fetchData()
}

const handleDeactivate = async (row: ProductVO) => {
  await ElMessageBox.confirm(`确认下架产品"${row.name}"？此操作将停止新增投保。`, '警告', { type: 'warning' })
  await deactivateProduct(row.id)
  ElMessage.success('下架成功')
  fetchData()
}

const handleExport = async () => {
  const blob = await exportProducts(queryParams)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `产品列表_${new Date().toLocaleDateString()}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
</script>
