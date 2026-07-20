<template>
  <!-- 404 页面 -->
  <div class="not-found">
    <div class="not-found__content">
      <div class="not-found__code">404</div>
      <div class="not-found__title">页面未找到</div>
      <div class="not-found__desc">您访问的页面不存在，请检查 URL 或返回首页</div>
      <el-button type="primary" @click="goHome">返回首页</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
const goHome = () => router.push('/dashboard')
</script>

<style scoped lang="scss">
.not-found {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $content-bg;

  &__content {
    text-align: center;
  }

  &__code {
    font-size: 120px;
    font-weight: 900;
    color: $primary-color;
    line-height: 1;
    opacity: 0.15;
  }

  &__title {
    font-size: 24px;
    font-weight: 600;
    color: #303133;
    margin: -20px 0 12px;
  }

  &__desc {
    color: #909399;
    margin-bottom: 24px;
  }
}
</style>
