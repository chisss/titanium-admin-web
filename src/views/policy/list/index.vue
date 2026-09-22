<template>
  <!-- 保单查询列表页 -->
  <div class="ti-page">
    <!-- 搜索区 -->
    <TiSearchForm
      :model="queryParams"
      :has-advanced="true"
      @search="handleSearch"
      @reset="handleResetAll"
    >
      <!-- 基础搜索 -->
      <el-form-item label="保单号">
        <!-- 🔴 placeholder 必须与后端谓词语义一致：读侧是 cb.like(%…%)（模糊），
             原「精确查询」在说谎——用户输入部分单号反而能查到，与提示自相矛盾 -->
        <el-input v-model="queryParams.policyNo" placeholder="模糊匹配" clearable class="ti-search-control-md" />
      </el-form-item>
      <el-form-item label="投保人">
        <el-input v-model="queryParams.policyHolderName" placeholder="姓名" clearable class="ti-search-control-md" />
      </el-form-item>
      <el-form-item label="被保人">
        <el-input v-model="queryParams.insuredName" placeholder="姓名" clearable class="ti-search-control-md" />
      </el-form-item>
      <el-form-item label="产品编码">
        <!-- 🔴 与保单号相反：产品编码后端是 cb.equal（精确），故不得写「模糊匹配」 -->
        <el-input v-model="queryParams.productCode" placeholder="精确匹配" clearable class="ti-search-control-md" />
      </el-form-item>
      <el-form-item label="保单状态">
        <!-- 🔴 剔除字典中的 3 个历史死码（见 constants/policy.ts）：否则用户选中「投保中」
             「生效中」会查到 0 条，读起来像「系统里没有这类保单」 -->
        <TiDictSelect
          v-model="queryParams.status"
          dict-type="POLICY_STATUS"
          :exclude-values="POLICY_STATUS_DEAD_CODES"
          placeholder="全部"
          class="ti-search-control-sm"
        />
      </el-form-item>

      <!-- 高级搜索（照 billing/payment-operations 范式：日期区间用页面级 ref，不挂 model） -->
      <template #advanced>
        <el-form-item label="生效日期">
          <el-date-picker
            v-model="effectiveRange"
            type="datetimerange"
            value-format="YYYY-MM-DDTHH:mm:ss"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
          />
        </el-form-item>
        <el-form-item label="到期日期">
          <el-date-picker
            v-model="expiryRange"
            type="datetimerange"
            value-format="YYYY-MM-DDTHH:mm:ss"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
          />
        </el-form-item>
      </template>
    </TiSearchForm>

    <!-- 工具栏 -->
    <div class="ti-toolbar">
      <div class="ti-toolbar-left">
        <span class="toolbar-stat">
          <!-- 🔴 D-501-57：总数未知时不得显示猜测值，如实说明并给出本页条数 -->
          <template v-if="pagination.total === null">本页 <b>{{ tableData.length }}</b> 条，总数未知</template>
          <template v-else>共 <b>{{ pagination.total }}</b> 条保单</template>
        </span>
      </div>
    </div>

    <!-- 表格 -->
    <TiTable
      :data="tableData"
      :total="pagination.total"
      :page-num="pagination.pageNum"
      :page-size="pagination.pageSize"
      :loading="tableLoading"
      :max-height="'var(--ti-table-max-height-default)'"
      row-key="policyId"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      :error="tableError"
      @refresh="retry"
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
      <el-table-column prop="premium" label="保费" width="110" align="right">
        <template #default="{ row }">{{ formatAmount(row.premium) }}</template>
      </el-table-column>
      <el-table-column prop="sumInsured" label="保额" width="120" align="right">
        <template #default="{ row }">{{ formatAmount(row.sumInsured) }}</template>
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
      <el-table-column label="操作" width="120" fixed="right" class-name="ti-action-column">
        <template #default="{ row }">
          <el-button size="small" :icon="View" @click="goDetail(row.policyId)">详情</el-button>
        </template>
      </el-table-column>
    </TiTable>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
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
import { POLICY_STATUS_DEAD_CODES } from '@/constants/policy'
import { formatDate } from '@/utils/date'
import { formatAmount } from '@/utils/format'
import type { PolicyVO } from '@/types/business.d'

const { getLabel: policyStatusLabel } = useDict('POLICY_STATUS')

const router = useRouter()

const queryParams = reactive({
  policyNo: '',
  policyHolderName: '',
  insuredName: '',
  productCode: '',
  status: undefined as string | undefined,
})

/**
 * 生效 / 到期日期区间（🔴 页面级 ref，**不挂 model**）。
 *
 * <p>照 billing/payment-operations 范式：`el-date-picker` 的区间值是「一对」，
 * 挂在表单 model 上会让「有没有选日期」与「选了哪两个日期」混在一个键里，
 * 而下游要的是两个独立键（`effectiveDateStart/End`）。故在 fetch 时展开成两键。
 * 代价是 TiSearchForm 的重置快照覆盖不到这两个 ref，必须由本页 `@reset` 显式清空
 * （见 {@link handleResetAll}）。</p>
 */
const effectiveRange = ref<string[]>([])
const expiryRange = ref<string[]>([])

const { tableData, tableLoading, tableError, pagination, fetchData, handleSearch, handleReset, onPageChange, onSizeChange, retry } =
  useTable<PolicyVO, typeof queryParams>((params) => getPolicyList({
    ...params,
    // 未选日期时值为 undefined，axios 会整个键省略 ⇒ 下游按「不过滤」处理（读侧谓词判非 null）
    effectiveDateStart: effectiveRange.value[0],
    effectiveDateEnd: effectiveRange.value[1],
    expiryDateStart: expiryRange.value[0],
    expiryDateEnd: expiryRange.value[1],
  }), queryParams)

fetchData()

/**
 * 重置：**先清区间 ref，再走 useTable 的 handleReset**。
 *
 * <p>顺序不可反 —— handleReset 内部会触发一次 fetchData，而 fetchData 会读这两个 ref；
 * 先 fetch 再清空等于用旧日期多查一次，用户会看到结果闪一下再变。</p>
 */
const handleResetAll = () => {
  effectiveRange.value = []
  expiryRange.value = []
  handleReset()
}

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
  color: $text-disabled;
  font-size: 12px;
  vertical-align: middle;

  &:hover { color: $primary-color; }
}

.toolbar-stat {
  font-size: 13px;
  color: $text-regular;
}
</style>
