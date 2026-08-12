<template>
  <!-- 理赔案件列表 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="报案号">
        <el-input v-model="queryParams.claimNo" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="保单号">
        <el-input v-model="queryParams.policyNo" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="案件状态">
        <el-select v-model="queryParams.status" clearable placeholder="全部" style="width: 130px">
          <el-option label="已报案" value="REPORTED" />
          <el-option label="查勘中" value="INVESTIGATING" />
          <el-option label="定损中" value="APPROVING" />
          <el-option label="已赔付" value="SETTLED" />
          <el-option label="拒赔" value="REJECTED" />
        </el-select>
      </el-form-item>
      <el-form-item label="报案时间">
        <el-date-picker
          v-model="queryParams.dateRange"
          type="daterange"
          range-separator="至"
          value-format="YYYY-MM-DD"
          style="width: 220px"
        />
      </el-form-item>
    </TiSearchForm>

    <TiTable :data="mockData" :total="mockData.length" :loading="false">
      <el-table-column prop="claimNo" label="报案号" width="160" />
      <el-table-column prop="policyNo" label="保单号" width="160" />
      <el-table-column prop="reporterName" label="报案人" width="100" />
      <el-table-column prop="incidentType" label="事故类型" width="120" />
      <el-table-column prop="estimatedAmount" label="预估赔付" width="120">
        <template #default="{ row }">¥{{ row.estimatedAmount?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" />
        </template>
      </el-table-column>
      <el-table-column prop="reportTime" label="报案时间" width="160" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default>
          <el-button size="small" :icon="View">详情</el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { View } from '@element-plus/icons-vue'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'

const queryParams = reactive({
  claimNo: '',
  policyNo: '',
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

const mockData = [
  { claimNo: 'CLM20260718001', policyNo: 'POL20260718001', reporterName: '张三', incidentType: '交通事故', estimatedAmount: 15000, status: 'INVESTIGATING', reportTime: '2026-07-18 09:00' },
  { claimNo: 'CLM20260718002', policyNo: 'POL20260717003', reporterName: '王五', incidentType: '宠物医疗', estimatedAmount: 3200, status: 'APPROVING', reportTime: '2026-07-17 16:20' },
  { claimNo: 'CLM20260716001', policyNo: 'POL20260710001', reporterName: '赵六', incidentType: '人身意外', estimatedAmount: 50000, status: 'SETTLED', reportTime: '2026-07-16 08:15' },
]

const handleSearch = () => {}
const handleReset = () => {
  queryParams.claimNo = ''
  queryParams.policyNo = ''
  queryParams.status = undefined
  queryParams.dateRange = undefined
}
</script>
