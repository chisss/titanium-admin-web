<template>
  <!-- 无菜单布局（登录页等） -->
  <div class="blank-layout">
    <router-view />
  </div>
</template>

<script setup lang="ts">
// 空布局：仅渲染路由视图，无侧边栏/顶栏
</script>

<style scoped lang="scss">
.blank-layout {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}
</style>
