<template>
  <!-- 整体应用布局：左侧菜单 + 顶部 + 主内容 + 右侧数据面板 + 底部 AI -->
  <div class="app-layout">
    <!-- 左侧侧边栏 -->
    <Sidebar v-if="!isMobile" :collapsed="appStore.sidebarCollapsed" />
    <el-drawer
      v-model="mobileNavigationVisible"
      class="mobile-navigation-drawer"
      direction="ltr"
      size="min(82vw, 320px)"
      :with-header="false"
      append-to-body
    >
      <Sidebar :collapsed="false" />
    </el-drawer>

    <!-- 右侧主体区域（垂直排列：顶栏 + 内容 + AI助手） -->
    <div class="app-layout__main">
      <!-- 顶部导航栏 -->
      <Topbar
        :collapsed="isMobile ? !mobileNavigationVisible : appStore.sidebarCollapsed"
        @toggle-sidebar="handleSidebarToggle"
      />

      <!-- 中间内容区（横向：路由视图 + 数据面板） -->
      <div class="app-layout__body">
        <!-- 主内容路由视图 -->
        <div class="app-layout__content">
          <router-view v-slot="{ Component, route }">
            <transition name="slide">
              <component :is="Component" :key="route.path" />
            </transition>
          </router-view>
        </div>

        <!-- 右侧数据面板 -->
        <DataPanel
          v-if="!isMobile"
          :collapsed="appStore.dataPanelCollapsed"
          @collapse="appStore.dataPanelCollapsed = true"
          @expand="appStore.dataPanelCollapsed = false"
        />
      </div>

      <!-- 底部 AI 助手 -->
      <AiChat
        :expanded="appStore.aiChatExpanded"
        @toggle="appStore.toggleAiChat"
        @expand="appStore.aiChatExpanded = true"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import Sidebar from './components/Sidebar.vue'
import Topbar from './components/Topbar.vue'
import DataPanel from './components/DataPanel.vue'
import AiChat from './components/AiChat.vue'
import { useAppStore } from '@/stores/app'
import { useMenuStore } from '@/stores/menu'
import { useRoute } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'

const appStore = useAppStore()
const menuStore = useMenuStore()
const route = useRoute()
const isMobile = useMediaQuery('(max-width: 767px)')
const mobileNavigationVisible = ref(false)

const handleSidebarToggle = () => {
  if (isMobile.value) {
    mobileNavigationVisible.value = !mobileNavigationVisible.value
    return
  }
  appStore.toggleSidebar()
}

// 根据路由 meta 更新面包屑
watch(
  () => route.meta,
  (meta) => {
    if (meta?.title) {
      appStore.setPageTitle(meta.title as string)
      // 简单面包屑构建（实际可从路由匹配链中构建）
      menuStore.setBreadcrumbs([
        { title: '首页', path: '/dashboard' },
        { title: meta.title as string },
      ])
    }
  },
  { immediate: true },
)

watch(
  () => route.path,
  () => {
    mobileNavigationVisible.value = false
  },
)
</script>

<style scoped lang="scss">
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;

  &__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  &__body {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }

  &__content {
    flex: 1;
    overflow-y: auto;
    background: $content-bg;
    min-width: 0;
  }
}

:global(.mobile-navigation-drawer .el-drawer__body) {
  padding: 0;
}

:global(.mobile-navigation-drawer .sidebar) {
  width: 100%;
}
</style>
