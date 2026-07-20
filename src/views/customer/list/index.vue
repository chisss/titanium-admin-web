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
      <el-form-item label="注册时间">
        <el-date-picker
          v-model="queryParams.dateRange"
          type="daterange"
          range-separator="至"
          value-format="YYYY-MM-DD"
          style="width: 220px"
        />
      </el-form-item>
    </TiSearchForm>

    <TiTable
      :data="tableData.value"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      @page-change="onPageChange"
      @size-change="onSizeChange"
    >
      <el-table-column prop="name" label="客户姓名" width="120" />
      <el-table-column prop="idType" label="证件类型" width="100" />
      <el-table-column prop="idNo" label="证件号码" width="180" />
      <el-table-column prop="mobile" label="手机号" width="130" />
      <el-table-column prop="gender" label="性别" width="70">
        <template #default="{ row }">
          {{ row.gender === 'MALE' ? '男' : row.gender === 'FEMALE' ? '女' : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="birthday" label="出生日期" width="110" />
      <el-table-column prop="createdAt" label="注册时间" width="160" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default>
          <el-button text size="small" :icon="View">详情</el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { View } from '@element-plus/icons-vue'
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
  dateRange: undefined as string[] | undefined,
})

const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<CustomerVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    return getCustomerList({ ...rest, dateRange }) as Promise<PageResult<CustomerVO>>
  }, queryParams)

fetchData()
</script>
