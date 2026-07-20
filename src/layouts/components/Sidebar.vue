<template>
  <!-- 左侧菜单栏 -->
  <div class="sidebar" :class="{ 'sidebar--collapsed': collapsed }">
    <!-- Logo 区域 -->
    <div class="sidebar__logo">
      <img src="/logo.svg" alt="Logo" class="sidebar__logo-img" />
      <transition name="fade">
        <span v-if="!collapsed" class="sidebar__logo-text">Titanium</span>
      </transition>
    </div>

    <!-- 菜单主体 -->
    <el-scrollbar class="sidebar__scroll">
      <el-menu
        :default-active="activeMenu"
        :collapse="collapsed"
        :collapse-transition="false"
        background-color="#0f1e3d"
        text-color="#c0ccda"
        active-text-color="#ffffff"
        router
        class="sidebar__menu"
      >
        <template v-for="menu in menuTree" :key="menu.id">
          <!-- 有子菜单：渲染 SubMenu -->
          <el-sub-menu v-if="menu.children && menu.children.length" :index="menu.path || menu.id">
            <template #title>
              <el-icon v-if="menu.icon">
                <component :is="menu.icon" />
              </el-icon>
              <span>{{ menu.title }}</span>
            </template>
            <el-menu-item
              v-for="child in menu.children"
              :key="child.id"
              :index="child.path || child.id"
            >
              <el-icon v-if="child.icon">
                <component :is="child.icon" />
              </el-icon>
              <span>{{ child.title }}</span>
            </el-menu-item>
          </el-sub-menu>
          <!-- 无子菜单：直接 MenuItem -->
          <el-menu-item v-else :index="menu.path || menu.id">
            <el-icon v-if="menu.icon">
              <component :is="menu.icon" />
            </el-icon>
            <template #title>{{ menu.title }}</template>
          </el-menu-item>
        </template>
      </el-menu>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { useMenuStore } from '@/stores/menu'
import { useRoute } from 'vue-router'

interface Props {
  /** 是否折叠 */
  collapsed: boolean
}

defineProps<Props>()

const menuStore = useMenuStore()
const route = useRoute()

const menuTree = computed(() => menuStore.menuTree)
const activeMenu = computed(() => route.path)
</script>

<style scoped lang="scss">
.sidebar {
  width: $sidebar-width;
  height: 100%;
  background-color: $sidebar-bg;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  overflow: hidden;
  flex-shrink: 0;

  &--collapsed {
    width: $sidebar-collapsed-width;
  }

  &__logo {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    height: $topbar-height;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    overflow: hidden;
    white-space: nowrap;
  }

  &__logo-img {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
  }

  &__logo-text {
    font-size: 18px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 1px;
  }

  &__scroll {
    flex: 1;
    overflow: hidden;
  }

  &__menu {
    border-right: none !important;
    width: 100% !important;

    :deep(.el-menu-item) {
      &:hover {
        background-color: $sidebar-hover-bg !important;
      }

      &.is-active {
        background-color: $sidebar-active !important;
        color: $sidebar-active-text !important;
      }
    }

    :deep(.el-sub-menu__title:hover) {
      background-color: $sidebar-hover-bg !important;
    }
  }
}
</style>
