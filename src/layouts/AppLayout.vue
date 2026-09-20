<template>
  <!-- 整体应用布局：左侧菜单 + 顶部 + 主内容 + 右侧数据面板 + 底部 AI -->
  <div class="app-layout">
    <!-- 🔴 跳转链接（Skip Link）——必须是 DOM 里的**第一个可聚焦元素**，故置于布局最前。
         为什么必需：侧栏为满足 WCAG 2.1.1 给 31 个菜单项 + 14 个子菜单标题补了 tabindex="0"
         （EP 的 el-menu 垂直模式零键盘支持，只能由我们补）。补上之后主导航可达了，
         代价是键盘用户按 Tab 要**先穿过 45 个侧栏项**才能到内容区——修复可达性的同时
         拉长了到内容的路径。Skip Link 是这条权衡的标准补偿，两者是一对契约：只要侧栏
         还靠 tabindex 提供键盘可达，这个链接就不能删。
         只加在 AppLayout：BlankLayout（登录页）没有侧栏，不存在要跳过的东西。 -->
    <a href="#main-content" class="skip-link">跳转到主要内容</a>

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
        <!-- tabindex="-1" + id 是 Skip Link 的落点：-1 使容器可被脚本/片段导航聚焦，
             又不进入 Tab 序列本身（否则键盘用户会在内容区开头多按一次空 Tab）。
             聚焦容器的副作用是会画出焦点环，故在样式里显式去掉——落点是整块滚动区，
             给一个撑满视口的描边只会造成「页面被框起来了」的误读，此处以滚动位置
             变化作为「已经跳过来了」的反馈。 -->
        <div id="main-content" tabindex="-1" class="app-layout__content">
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
import { MEDIA_MAX_MOBILE } from '@/constants/layout'

const appStore = useAppStore()
const menuStore = useMenuStore()
const route = useRoute()
const isMobile = useMediaQuery(MEDIA_MAX_MOBILE)
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

    // Skip Link 的落点容器不画焦点环，理由见模板注释。
    // 用 :focus 而非 :focus-visible——容器永远不是被键盘「走到」的，只可能是被跳转聚焦。
    &:focus {
      outline: none;
    }
  }
}

// ── Skip Link ────────────────────────────────────────────────────
//
// 隐藏手法用 `transform: translateY(-100%)` 而非 `left: -9999px`：
// 后者在部分浏览器会给 `position: fixed` 元素撑出横向滚动条，前者不占任何可视区域。
//
// 🔴 焦点环必须换成白色，且 `outline-offset` 取负值。理由是本轮 R2/R3 两条实测教训：
//    · 全局规则给的是 `outline: 2px solid $primary-color; outline-offset: 2px`，
//      offset 为正 ⇒ 描边画在元素**外面**；本链接 fixed 在左上角，外面正是深色侧栏，
//      品牌色 #1a3a6b 压侧栏底 #0f1e3d 仅约 1.3:1，等于没有焦点提示。
//    · 更要命的是本链接**自身背景就是 $primary-color**，若 offset 取正、描边又同色，
//      就重演「描边=背景」的 1:1（与侧栏激活项那次同型）。
//    故：白色描边 + offset 取 -2px（画在自身品牌色底上），白压 #1a3a6b 实测 11.28:1。
//
// 🔴 取值必须跟着 $primary-color 走：若将来把品牌色改浅，白描边会逐渐失效，此处需一并复算。
//
// z-index 用 $z-index-fixed(1020)：高于无定位的侧栏/顶栏，又低于 EP 弹层
// （--el-index-popper 等自 2000 起）——跳转链接不该盖住模态框。
// 走 scoped 而非 :global——本链接就在本组件模板里（下方 mobile-navigation-drawer 用
// :global 是因为 el-drawer 开了 append-to-body，节点被移出组件树，那是必需的特例）。
// scoped 下选择器为 (0,2,0)、带 :focus-visible 时 (0,3,0)，足以压过全局兜底 (0,1,1)。
.skip-link {
  position: fixed;
  top: 0;
  left: 0;
  z-index: $z-index-fixed;
  padding: 10px 18px;
  background: $primary-color;
  color: #ffffff;
  font-size: $font-size-base;
  border-radius: 0 0 $radius-sm 0;
  text-decoration: none;
  transform: translateY(-100%);
  transition: transform 0.15s ease;

  &:focus,
  &:focus-visible {
    transform: translateY(0);
    outline: 2px solid #ffffff;
    outline-offset: -2px;
  }
}

:global(.mobile-navigation-drawer .el-drawer__body) {
  padding: 0;
}

:global(.mobile-navigation-drawer .sidebar) {
  width: 100%;
}
</style>
