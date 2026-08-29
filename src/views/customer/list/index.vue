<template>
  <!-- 客户列表页 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="客户姓名">
        <el-input v-model="queryParams.name" clearable style="width: 150px" />
      </el-form-item>
      <el-form-item label="证件号">
        <el-input v-model="queryParams.idNo" clearable style="width: 170px" />
      </el-form-item>
      <el-form-item label="手机号">
        <el-input v-model="queryParams.mobile" clearable style="width: 140px" />
      </el-form-item>
    </TiSearchForm>

    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="fullName" label="客户姓名" width="140" />
      <el-table-column prop="customerNo" label="客户号" width="180" />
      <el-table-column prop="idType" label="证件类型" width="130">
        <template #default="{ row }">
          {{ row.idType === 'CHINA_ID_CARD' ? '居民身份证' : row.idType }}
        </template>
      </el-table-column>
      <el-table-column prop="idNo" label="证件号码" width="200" />
      <el-table-column prop="phoneNumber" label="手机号" width="150" />
      <el-table-column prop="gender" label="性别" width="80">
        <template #default="{ row }">
          {{ row.gender === 'MALE' ? '男' : row.gender === 'FEMALE' ? '女' : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="createTime" label="注册时间" width="180">
        <template #default="{ row }">
          {{ row.createTime ? new Date(row.createTime).toLocaleString('zh-CN') : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="handleViewDetail(row.customerId)">详情</el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { View } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { getCustomerList } from '@/api/customer'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import type { CustomerVO } from '@/types/business.d'
import type { PageResult } from '@/types/api.d'

const queryParams = reactive({
  name: '',
  idNo: '',
  mobile: '',
})
const router = useRouter()

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<CustomerVO, typeof queryParams>((params) => {
    return getCustomerList(params) as Promise<PageResult<CustomerVO>>
  }, queryParams)

const handleViewDetail = (customerId: string) => {
  router.push(`/customer/detail/${customerId}`)
}

fetchData()
</script>
