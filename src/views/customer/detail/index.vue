<template>
  <!-- 客户详情 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>客户详情 - {{ customer?.name }}</h3>
      </div>

      <!-- 基本信息 -->
      <el-descriptions v-if="customer" :column="3" border style="margin-bottom: 24px">
        <el-descriptions-item label="客户姓名">{{ customer.name }}</el-descriptions-item>
        <el-descriptions-item label="性别">
          {{ customer.gender === 'MALE' ? '男' : customer.gender === 'FEMALE' ? '女' : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="出生日期">{{ customer.birthday || '-' }}</el-descriptions-item>
        <el-descriptions-item label="证件类型">{{ customer.idType }}</el-descriptions-item>
        <el-descriptions-item label="证件号码">{{ customer.idNo }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ customer.mobile }}</el-descriptions-item>
        <el-descriptions-item label="邮箱" :span="2">{{ customer.email || '-' }}</el-descriptions-item>
        <el-descriptions-item label="注册时间">{{ customer.createdAt }}</el-descriptions-item>
      </el-descriptions>

      <!-- 名下保单列表 -->
      <div class="section-title">名下保单</div>
      <el-table :data="policyList" v-loading="policyLoading" size="small" stripe style="margin-bottom: 24px">
        <el-table-column prop="policyNo" label="保单号" width="160" />
        <el-table-column prop="productName" label="产品名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="premium" label="保费" width="120">
          <template #default="{ row }">¥{{ row.premium?.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="effectiveDate" label="起保日期" width="120" />
        <el-table-column prop="expiryDate" label="到期日期" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <TiStatusTag :value="row.status" />
          </template>
        </el-table-column>
      </el-table>

      <!-- 受益人关系列表 -->
      <div class="section-title">受益人关系</div>
      <el-table :data="beneficiaryList" v-loading="beneficiaryLoading" size="small" stripe>
        <el-table-column prop="name" label="受益人姓名" width="120" />
        <el-table-column prop="relationship" label="与投保人关系" width="140" />
        <el-table-column prop="idNo" label="证件号码" width="180" />
        <el-table-column prop="ratio" label="受益比例" width="120">
          <template #default="{ row }">{{ row.ratio != null ? `${row.ratio}%` : '-' }}</template>
        </el-table-column>
        <el-table-column prop="policyNo" label="关联保单" width="160" />
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getCustomerDetail } from '@/api/customer'
import type { CustomerVO } from '@/types/business.d'
import TiStatusTag from '@/components/TiStatusTag/index.vue'

/** 简化的保单行类型（客户维度展示） */
interface PolicyRow {
  policyNo: string
  productName: string
  premium: number
  effectiveDate: string
  expiryDate: string
  status: string
}

/** 简化的受益人行类型 */
interface BeneficiaryRow {
  name: string
  relationship: string
  idNo: string
  ratio?: number
  policyNo: string
}

const route = useRoute()
const loading = ref(false)
const policyLoading = ref(false)
const beneficiaryLoading = ref(false)
const customer = ref<CustomerVO | null>(null)
const policyList = ref<PolicyRow[]>([])
const beneficiaryList = ref<BeneficiaryRow[]>([])

onMounted(async () => {
  loading.value = true
  try {
    customer.value = await getCustomerDetail(route.params.id as string)
  } finally {
    loading.value = false
  }
  // 保单与受益人数据目前后端接口待接入，暂时为空列表
  policyList.value = []
  beneficiaryList.value = []
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
