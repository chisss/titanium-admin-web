<template>
  <!-- 403 页面 —— 路由级权限门禁的落点（router/index.ts 的 meta.permission 比对失败时跳到这里） -->
  <div class="forbidden">
    <div class="forbidden__content">
      <div class="forbidden__code">403</div>
      <div class="forbidden__title">无权访问</div>
      <div class="forbidden__desc">当前账号没有访问该页面的权限，请联系系统管理员为你的角色开通</div>
      <!-- 展示缺失的权限码：运维排查「为什么他进不去」时，看这一行即可定位，无需再翻代码 -->
      <div v-if="required" class="forbidden__need">
        所需权限码：<el-tag type="danger" size="small">{{ required }}</el-tag>
      </div>
      <div class="forbidden__actions">
        <el-button @click="goBack">返回上一页</el-button>
        <el-button type="primary" @click="goHome">返回首页</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * 403 页是权限门禁的**逃生口**，自身绝不设 meta.permission、且必须在路由白名单内：
 * 否则无权用户被拦到这里又被拦住，只会看到空白页且无法自救。
 */
const route = useRoute()
const router = useRouter()

/** 门禁跳转时带来的缺失权限码（见 router/index.ts 的 /403 跳转） */
const required = computed(() => {
  const need = route.query.need
  return typeof need === 'string' ? need : ''
})

const goHome = () => router.push('/dashboard')

/** 无历史可退时（如直接敲 URL 进来）回首页，避免 router.back() 把人送出站外 */
const goBack = () => {
  if (window.history.length > 1) {
    router.back()
  } else {
    goHome()
  }
}
</script>

<style scoped lang="scss">
.forbidden {
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
    font-weight: $font-weight-bold;
    color: $danger-color;
    line-height: 1;
    opacity: 0.15;
  }

  &__title {
    font-size: $font-size-2xl;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin: -20px 0 $space-3;
  }

  &__desc {
    color: $text-secondary;
  }

  &__need {
    margin-top: $space-3;
    font-size: $font-size-md;
    color: $text-regular;
  }

  &__actions {
    margin-top: $space-6;
    display: flex;
    gap: $space-3;
    justify-content: center;
  }
}
</style>
