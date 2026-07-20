<template>
  <!-- 理赔案件详情 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>理赔案件 - {{ detail?.claimNo }}</h3>
        <TiStatusTag v-if="detail" :value="detail.status" />
      </div>

      <!-- 基本信息 -->
      <el-descriptions v-if="detail" :column="3" border style="margin-bottom: 24px">
        <el-descriptions-item label="报案号">{{ detail.claimNo }}</el-descriptions-item>
        <el-descriptions-item label="保单号">{{ detail.policyNo }}</el-descriptions-item>
        <el-descriptions-item label="出险人">{{ detail.insuredName }}</el-descriptions-item>
        <el-descriptions-item label="理赔类型">{{ detail.claimType }}</el-descriptions-item>
        <el-descriptions-item label="报案日期">{{ detail.reportDate }}</el-descriptions-item>
        <el-descriptions-item label="出险日期">{{ detail.occurrenceDate }}</el-descriptions-item>
        <el-descriptions-item label="申请赔付金额">
          {{ detail.claimAmount != null ? `¥${detail.claimAmount.toLocaleString()}` : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="实际赔付金额">
          {{ detail.paidAmount != null ? `¥${detail.paidAmount.toLocaleString()}` : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="处理备注">{{ detail.processNote || '-' }}</el-descriptions-item>
      </el-descriptions>

      <!-- 流转操作区 -->
      <template v-if="detail && detail.status !== 'SETTLED' && detail.status !== 'REJECTED'">
        <el-divider />
        <div class="action-section">
          <div class="action-title">案件处理</div>

          <!-- 结案操作单独展示赔付金额输入 -->
          <template v-if="nextAction === 'settle'">
            <el-form :model="settleForm" label-width="100px" style="max-width: 480px; margin-bottom: 12px">
              <el-form-item label="实际赔付金额" required>
                <el-input-number
                  v-model="settleForm.paidAmount"
                  :min="0"
                  :precision="2"
                  style="width: 200px"
                />
              </el-form-item>
              <el-form-item label="结案备注">
                <el-input v-model="settleForm.note" type="textarea" :rows="2" style="width: 360px" />
              </el-form-item>
            </el-form>
          </template>

          <el-input
            v-else
            v-model="processNote"
            type="textarea"
            :rows="2"
            placeholder="处理备注（可选）"
            style="max-width: 480px; margin-bottom: 12px"
          />

          <div class="action-buttons">
            <el-button
              v-for="btn in actionButtons"
              :key="btn.action"
              :type="btn.type"
              :loading="actionLoading"
              @click="handleAction(btn.action)"
            >
              {{ btn.label }}
            </el-button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getClaimDetail, processClaim, settleClaim } from '@/api/claim'
import type { ClaimCaseVO } from '@/api/claim'
import TiStatusTag from '@/components/TiStatusTag/index.vue'

/** 各状态对应的下一步操作按钮配置 */
const STATUS_ACTIONS: Record<string, Array<{ action: string; label: string; type: 'primary' | 'warning' | 'success' | 'danger' }>> = {
  REPORTED:      [{ action: 'investigate', label: '立案查勘', type: 'primary' }],
  INVESTIGATING: [{ action: 'appraise', label: '进入定损', type: 'primary' }, { action: 'reject', label: '拒赔', type: 'danger' }],
  APPROVING:     [{ action: 'approve', label: '核损通过', type: 'success' }, { action: 'reject', label: '拒赔', type: 'danger' }],
  APPROVED:      [{ action: 'settle', label: '赔付结案', type: 'success' }],
}

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const actionLoading = ref(false)
const detail = ref<ClaimCaseVO | null>(null)
const processNote = ref('')
const settleForm = ref({ paidAmount: 0, note: '' })

/** 当前状态下一步操作按钮 */
const actionButtons = computed(() => STATUS_ACTIONS[detail.value?.status ?? ''] ?? [])

/** 是否结案操作 */
const nextAction = computed(() => {
  if (detail.value?.status === 'APPROVED') return 'settle'
  return ''
})

onMounted(async () => {
  loading.value = true
  try {
    detail.value = await getClaimDetail(route.params.id as string)
  } finally {
    loading.value = false
  }
})

/** 执行操作 */
const handleAction = async (action: string) => {
  await ElMessageBox.confirm(`确认执行"${action}"操作？`, '操作确认', { type: 'warning' })
  actionLoading.value = true
  try {
    if (action === 'settle') {
      if (!settleForm.value.paidAmount) {
        ElMessage.warning('请填写实际赔付金额')
        return
      }
      await settleClaim(route.params.id as string, {
        paidAmount: settleForm.value.paidAmount,
        note: settleForm.value.note || undefined,
      })
    } else {
      await processClaim(route.params.id as string, action, processNote.value || undefined)
    }
    ElMessage.success('操作成功')
    router.back()
  } catch {
    ElMessage.error('操作失败，请重试')
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
  }
}
</style>
