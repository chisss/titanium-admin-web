<template>
  <!-- 账单详情 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>账单详情 - {{ bill?.billNo }}</h3>
        <TiStatusTag v-if="bill" :value="bill.status" />
      </div>

      <el-descriptions v-if="bill" :column="3" border style="margin-bottom: 24px">
        <el-descriptions-item label="账单号">{{ bill.billNo }}</el-descriptions-item>
        <el-descriptions-item label="保单号">{{ bill.policyNo }}</el-descriptions-item>
        <el-descriptions-item label="投保人">{{ bill.holderName }}</el-descriptions-item>
        <el-descriptions-item label="账单金额">¥{{ bill.amount?.toLocaleString() }}</el-descriptions-item>
        <el-descriptions-item label="到期日">{{ bill.dueDate }}</el-descriptions-item>
        <el-descriptions-item label="实缴日">{{ bill.paidDate || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间" :span="3">{{ bill.createdAt }}</el-descriptions-item>
      </el-descriptions>

      <!-- 缴费计划 -->
      <div class="section-title">缴费计划</div>
      <el-table :data="scheduleList" v-loading="scheduleLoading" size="small" stripe>
        <el-table-column prop="period" label="期次" width="80" />
        <el-table-column prop="dueDate" label="到期日" width="130" />
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="{ row }">¥{{ row.amount?.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <TiStatusTag :value="row.status" />
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getBillDetail, getPremiumSchedule } from '@/api/billing'
import type { BillVO, PremiumScheduleVO } from '@/api/billing'
import TiStatusTag from '@/components/TiStatusTag/index.vue'

const route = useRoute()
const loading = ref(false)
const scheduleLoading = ref(false)
const bill = ref<BillVO | null>(null)
const scheduleList = ref<PremiumScheduleVO[]>([])

onMounted(async () => {
  const id = route.params.id as string
  loading.value = true
  try {
    bill.value = await getBillDetail(id)
  } finally {
    loading.value = false
  }
  // 加载缴费计划
  scheduleLoading.value = true
  try {
    scheduleList.value = await getPremiumSchedule(id)
  } catch {
    // 计划加载失败不阻断主流程
    scheduleList.value = []
  } finally {
    scheduleLoading.value = false
  }
})
</script>

<style scoped lang="scss">
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;

  h3 {
    margin: 0;
    font-size: 18px;
    flex: 1;
  }
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}
</style>
