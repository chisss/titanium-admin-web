<template>
  <!-- 核保工单列表 -->
  <div class="ti-page">
    <TiSearchForm :model="queryParams" @search="handleSearch" @reset="handleReset">
      <el-form-item label="核保类型">
        <TiDictSelect v-model="queryParams.underwritingType" dict-type="UNDERWRITING_TYPE" placeholder="全部" style="width: 150px" />
      </el-form-item>
      <el-form-item label="核保状态">
        <TiDictSelect v-model="queryParams.status" dict-type="UNDERWRITING_STATUS" placeholder="全部" style="width: 150px" />
      </el-form-item>
      <el-form-item label="申请时间">
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
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      :max-height="'var(--ti-table-max-height-lean)'"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      :error="tableError"
      @refresh="retry"
    >
      <!-- 🔴 每张表必须保留至少 1 个只写 min-width 的数据列承接剩余宽：EP 的 table-layout
           （updateColumnsWidth）在 fit=true 时把「表格宽 - 各列宽之和」补给 flex 列，若全表列都是
           数字 width，多出的空间会无处可去、表格右侧留白（本页改操作列前是全站唯一此类表，
           1920 下留白 848px）。参照 document/list「关联业务」同型写法：编码列承接。 -->
      <el-table-column prop="caseNo" label="核保案号" min-width="200" class-name="ti-code-column">
        <template #default="{ row }">
          <TiCopyText :text="row.caseNo || '-'" />
        </template>
      </el-table-column>
      <el-table-column prop="underwritingType" label="核保类型" width="110">
        <template #default="{ row }">{{ underwritingTypeLabel(row.underwritingType) }}</template>
      </el-table-column>
      <el-table-column prop="amount" label="核保金额" width="130" align="right">
        <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
      </el-table-column>
      <el-table-column prop="riskLevel" label="风险等级" width="110">
        <template #default="{ row }">{{ riskLevelLabel(row.riskLevel) }}</template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" width="170">
        <!-- D-501-42：此前直出后端 ISO 串（2026-08-29T12:01:21），统一走全局日期工具 -->
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="核保状态" width="120">
        <template #default="{ row }">
          <TiStatusTag :value="row.status" :label="underwritingStatusLabel(row.status)" />
        </template>
      </el-table-column>
      <el-table-column prop="underwritingCompletedTime" label="核保完成时间" width="160">
        <!-- 时间列统一走全局日期工具，避免直出后端 ISO 串（2026-09-18 全站实测 7 页 8 列） -->
        <template #default="{ row }">{{ formatDateTime(row.underwritingCompletedTime) }}</template>
      </el-table-column>
      <!-- 🔴 操作列必须写数字 width 而非 min-width：EP 把「无数字 width」的列判为 flex 列
           （table-layout.mjs:96-107），全表唯一 flex 列时会吸走表格剩余宽——实测该列渲染
           368px(@1920)/1008px(@2560)，而列内按钮实需仅 128px。改 width 后渲染恒等于声明值。 -->
      <el-table-column label="操作" width="200" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="toDetail(row.underwritingId)">详情</el-button>
          <!-- 🔴 权限码修正：原写 underwriting:approve，该码在 admin 的 t_permission/t_menu 种子里
               **0 命中** ⇒ 对非超管永久隐藏。真源是 UnderwritingProxyController：
               `PUT /underwriting/{id}/decision` 的 @PreAuthorize 是 UNDERWRITING_DECIDE（=underwriting:decide）。
               🔴 状态门禁改走 canDecideUnderwriting：原写死 MANUAL_REVIEW，会让超保额阈值转出的
               REVIEW 案件永远看不到「审核」入口（判据详见 constants/underwriting.ts）。 -->
          <!-- 🔴 形态修正：原带 text 属性 ⇒ 同列「详情」带边框、「审核」为文字按钮，
               是全站唯一「一列内混用两种形态」的反例（COLOR-CONTRACT 实测 0/其余页面混用）。
               去掉 text 后与「详情」同为平铺；type=primary 保留 —— 「审核」属 ③ 流转/受理 色桶。 -->
          <el-button
            v-if="canDecideUnderwriting(row.status)"
            size="small"
            type="primary"
            v-permission="'underwriting:decide'"
            @click="toDetail(row.underwritingId)"
          >
            审核
          </el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { View } from '@element-plus/icons-vue'
import { getUnderwritingList } from '@/api/underwriting'
import type { UnderwritingCaseVO } from '@/api/underwriting'
import { canDecideUnderwriting, riskLevelLabel } from '@/constants/underwriting'
import { useTable } from '@/composables/useTable'
import TiTable from '@/components/TiTable/index.vue'
import TiSearchForm from '@/components/TiSearchForm/index.vue'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import TiCopyText from '@/components/TiCopyText/index.vue'
import TiDictSelect from '@/components/TiDictSelect/index.vue'
import { useDict } from '@/composables/useDict'
import { formatDateTime } from '@/utils/date'
import { formatAmount } from '@/utils/format'
import type { PageResult } from '@/types/api.d'

const router = useRouter()
const { getLabel: underwritingStatusLabel } = useDict('UNDERWRITING_STATUS')
const { getLabel: underwritingTypeLabel } = useDict('UNDERWRITING_TYPE')

const queryParams = reactive({
  underwritingType: undefined as string | undefined,
  status: undefined as string | undefined,
  dateRange: undefined as string[] | undefined,
})

const { tableData, tableLoading, tableError, pagination, handleSearch, handleReset, onPageChange, onSizeChange, retry } =
  useTable<UnderwritingCaseVO, typeof queryParams>((params) => {
    const { dateRange, underwritingType, status, pageNum, pageSize } = params
    return getUnderwritingList({
      status,
      underwritingType,
      // 申请时间范围转下游 ISO-8601 起止时刻
      startTime: dateRange?.[0] ? `${dateRange[0]}T00:00:00` : undefined,
      endTime: dateRange?.[1] ? `${dateRange[1]}T23:59:59` : undefined,
      pageNum,
      pageSize,
    }) as Promise<PageResult<UnderwritingCaseVO>>
  }, queryParams)

/** 跳转详情/审核页 */
const toDetail = (underwritingId: string) => {
  router.push(`/underwriting/detail/${underwritingId}`)
}
</script>
