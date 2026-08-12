<template>
  <!-- 意向单查询列表页 -->
  <div class="ti-page">
    <!-- 搜索区 -->
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="意向单号">
        <el-input v-model="queryParams.proposalNo" placeholder="精确查询" clearable style="width: 180px" />
      </el-form-item>
      <el-form-item label="客户姓名">
        <el-input v-model="queryParams.customerName" placeholder="姓名" clearable style="width: 140px" />
      </el-form-item>
      <el-form-item label="手机号">
        <el-input v-model="queryParams.mobile" placeholder="手机号码" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="意向产品">
        <el-input v-model="queryParams.productName" placeholder="模糊搜索" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="意向状态">
        <el-select v-model="queryParams.status" placeholder="请选择" clearable style="width: 140px">
          <el-option label="新建" value="NEW" />
          <el-option label="跟进中" value="FOLLOWING" />
          <el-option label="已报价" value="QUOTED" />
          <el-option label="已投保" value="APPLIED" />
          <el-option label="已成交" value="SUCCESS" />
          <el-option label="已流失" value="LOST" />
          <el-option label="已无效" value="INVALID" />
        </el-select>
      </el-form-item>
      <el-form-item label="渠道来源">
        <el-select v-model="queryParams.sourceChannel" placeholder="请选择" clearable style="width: 140px">
          <el-option label="官网" value="WEBSITE" />
          <el-option label="APP" value="APP" />
          <el-option label="微信" value="WECHAT" />
          <el-option label="代理人" value="AGENT" />
          <el-option label="电销" value="TELEMARKETING" />
          <el-option label="其他" value="OTHER" />
        </el-select>
      </el-form-item>
      <el-form-item label="创建日期">
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
        <span class="toolbar-stat">共 <b>{{ pagination.total }}</b> 条意向单</span>
        <el-button type="primary" size="small" style="margin-left: 16px" @click="handleCreate">
          新建意向单
        </el-button>
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
      <el-table-column prop="proposalNo" label="意向单号" width="160" fixed="left">
        <template #default="{ row }">
          <TiCopyText :text="row.proposalNo" />
        </template>
      </el-table-column>
      <el-table-column prop="customerName" label="客户姓名" width="120" />
      <el-table-column prop="mobile" label="手机号" width="130" />
      <el-table-column prop="productName" label="意向产品" min-width="180" show-overflow-tooltip />
      <el-table-column prop="status" label="意向状态" width="110">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="getStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="sourceChannel" label="渠道来源" width="110">
        <template #default="{ row }">
          {{ getChannelLabel(row.sourceChannel) }}
        </template>
      </el-table-column>
      <el-table-column prop="expectedPremium" label="预估保费" width="130" align="right">
        <template #default="{ row }">
          {{ row.expectedPremium ? `¥${row.expectedPremium.toLocaleString()}` : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="followUpPerson" label="跟进人" width="100" />
      <el-table-column prop="lastFollowTime" label="最后跟进" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.lastFollowTime) }}
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" :icon="View" @click="handleDetail(row)">详情</el-button>
          <el-button
            v-if="row.status !== 'SUCCESS' && row.status !== 'INVALID'"
            link
            type="success"
            @click="handleFollowUp(row)"
          >
            跟进
          </el-button>
          <el-button
            v-if="row.status === 'QUOTED'"
            link
            type="warning"
            @click="handleConvert(row)"
          >
            转投保单
          </el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, View } from '@element-plus/icons-vue'
import { getProposalList, type ProposalVO } from '@/api/insurance'
import { useTable } from '@/composables/useTable'
import { formatDateTime } from '@/utils/date'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'

/** 意向单查询参数 */
const queryParams = reactive({
  proposalNo: '',
  customerName: '',
  mobile: '',
  productName: '',
  status: undefined as string | undefined,
  sourceChannel: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

/** 意向状态标签 */
const getStatusLabel = (status: string): string => {
  const statusMap: Record<string, string> = {
    NEW: '新建',
    FOLLOWING: '跟进中',
    QUOTED: '已报价',
    APPLIED: '已投保',
    SUCCESS: '已成交',
    LOST: '已流失',
    INVALID: '已无效',
  }
  return statusMap[status] || status
}

/** 渠道来源标签 */
const getChannelLabel = (channel: string): string => {
  const channelMap: Record<string, string> = {
    WEBSITE: '官网',
    APP: 'APP',
    WECHAT: '微信',
    AGENT: '代理人',
    TELEMARKETING: '电销',
    OTHER: '其他',
  }
  return channelMap[channel] || channel
}

/** 表格数据 */
const { tableData, tableLoading, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange } =
  useTable<ProposalVO, typeof queryParams>((params) => {
    const { dateRange, ...rest } = params
    // 注意：后端暂不支持日期范围查询，先去掉 dateRange
    return getProposalList(rest)
  }, queryParams)

// 初始加载
fetchData()

/** 新建意向单 */
const handleCreate = () => {
  ElMessage.info('新建意向单功能开发中...')
  // TODO: 路由跳转到新建页
  // router.push('/policy/intention/create')
}

/** 查看详情 */
const handleDetail = (row: ProposalVO) => {
  ElMessage.info(`查看意向单详情: ${row.proposalNo}`)
  // TODO: 路由跳转到详情页
  // router.push(`/policy/intention/detail/${row.id}`)
}

/** 跟进意向单 */
const handleFollowUp = (row: ProposalVO) => {
  ElMessage.info(`跟进意向单: ${row.proposalNo}`)
  // TODO: 打开跟进对话框
}

/** 转投保单 */
const handleConvert = (row: ProposalVO) => {
  ElMessage.info(`将意向单 ${row.proposalNo} 转为投保单`)
  // TODO: 转投保单逻辑
}

/** 导出意向单 */
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
