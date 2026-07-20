<template>
  <!-- 保全工单详情 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>保全工单 - {{ detail?.workOrderNo }}</h3>
        <TiStatusTag v-if="detail" :value="detail.status" />
      </div>

      <el-descriptions v-if="detail" :column="3" border style="margin-bottom: 24px">
        <el-descriptions-item label="工单号">{{ detail.workOrderNo }}</el-descriptions-item>
        <el-descriptions-item label="保单号">{{ detail.policyNo }}</el-descriptions-item>
        <el-descriptions-item label="投保人">{{ detail.holderName }}</el-descriptions-item>
        <el-descriptions-item label="保全类型">
          <el-tag size="small">{{ detail.maintenanceTypeLabel || detail.maintenanceType }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="申请人">{{ detail.applicantName }}</el-descriptions-item>
        <el-descriptions-item label="申请时间">{{ detail.applyTime }}</el-descriptions-item>
        <el-descriptions-item label="生效时间">{{ detail.effectiveTime || '-' }}</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
      </el-descriptions>

      <!-- 审核操作区 - 仅待处理状态可见 -->
      <template v-if="detail?.status === 'PENDING'">
        <el-divider />
        <div class="action-section">
          <div class="action-title">审核操作</div>
          <el-form ref="auditFormRef" :model="auditForm" label-width="80px" style="max-width: 480px">
            <el-form-item label="驳回原因" prop="rejectReason">
              <el-input
                v-model="auditForm.rejectReason"
                type="textarea"
                :rows="3"
                placeholder="审核通过时可不填；驳回时必填"
              />
            </el-form-item>
          </el-form>
          <div class="action-buttons">
            <el-button type="primary" :loading="actionLoading" @click="handleApprove">审核通过</el-button>
            <el-button type="danger" :loading="actionLoading" @click="handleReject">审核驳回</el-button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getMaintenanceDetail, approveMaintenance, rejectMaintenance } from '@/api/maintenance'
import type { MaintenanceVO } from '@/api/maintenance'
import TiStatusTag from '@/components/TiStatusTag/index.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const actionLoading = ref(false)
const detail = ref<MaintenanceVO | null>(null)
const auditForm = ref({ rejectReason: '' })

onMounted(async () => {
  loading.value = true
  try {
    detail.value = await getMaintenanceDetail(route.params.id as string)
  } finally {
    loading.value = false
  }
})

/** 审核通过 */
const handleApprove = async () => {
  await ElMessageBox.confirm('确认审核通过该保全工单？', '审核确认', { type: 'warning' })
  actionLoading.value = true
  try {
    await approveMaintenance(route.params.id as string, auditForm.value.rejectReason || undefined)
    ElMessage.success('审核通过成功')
    router.back()
  } catch {
    ElMessage.error('审核操作失败，请重试')
  } finally {
    actionLoading.value = false
  }
}

/** 审核驳回 */
const handleReject = async () => {
  if (!auditForm.value.rejectReason.trim()) {
    ElMessage.warning('请填写驳回原因')
    return
  }
  await ElMessageBox.confirm('确认驳回该保全工单？', '驳回确认', { type: 'warning' })
  actionLoading.value = true
  try {
    await rejectMaintenance(route.params.id as string, auditForm.value.rejectReason)
    ElMessage.success('已驳回')
    router.back()
  } catch {
    ElMessage.error('驳回操作失败，请重试')
  } finally {
    actionLoading.value = false
  }
}
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

.action-section {
  padding: 4px 0 8px;

  .action-title {
    font-size: 15px;
    font-weight: 600;
    color: #303133;
    margin-bottom: 16px;
  }

  .action-buttons {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }
}
</style>
