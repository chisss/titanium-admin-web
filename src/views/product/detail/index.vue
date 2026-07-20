<template>
  <!-- 产品详情页 -->
  <div class="ti-page">
    <div class="ti-card" v-loading="loading">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" text @click="$router.back()">返回</el-button>
        <h3>产品详情</h3>
        <TiStatusTag v-if="product" :value="product.status" />
      </div>

      <el-descriptions v-if="product" :column="3" border>
        <el-descriptions-item label="产品名称">{{ product.name }}</el-descriptions-item>
        <el-descriptions-item label="产品代码">{{ product.code }}</el-descriptions-item>
        <el-descriptions-item label="险种分类">{{ product.category }}</el-descriptions-item>
        <el-descriptions-item label="最低保费">
          {{ product.minPremium ? `¥${product.minPremium.toLocaleString()}` : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="最高保额">
          {{ product.maxCoverage ? `¥${product.maxCoverage.toLocaleString()}` : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="创建人">{{ product.createdBy }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ product.createdAt }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ product.updatedAt }}</el-descriptions-item>
        <el-descriptions-item label="产品描述" :span="3">
          {{ product.description || '-' }}
        </el-descriptions-item>
      </el-descriptions>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getProductDetail } from '@/api/product'
import TiStatusTag from '@/components/TiStatusTag/index.vue'
import type { ProductVO } from '@/types/business.d'

const route = useRoute()
const loading = ref(false)
const product = ref<ProductVO | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    product.value = await getProductDetail(route.params.id as string)
  } finally {
    loading.value = false
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
</style>
