<template>
  <!-- 顶部导航栏 -->
  <div class="topbar">
    <!-- 左侧：折叠按钮 + 面包屑 -->
    <div class="topbar__left">
      <el-button
        class="topbar__collapse-btn"
        :icon="collapsed ? Expand : Fold"
        text
        @click="toggleSidebar"
      />
      <el-breadcrumb separator="/" class="topbar__breadcrumb">
        <el-breadcrumb-item
          v-for="crumb in breadcrumbs"
          :key="crumb.title"
          :to="crumb.path ? { path: crumb.path } : undefined"
        >
          {{ crumb.title }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </div>

    <!-- 右侧：语言切换 + 用户信息 + 退出 -->
    <div class="topbar__right">
      <!-- 语言切换 -->
      <el-dropdown trigger="click" @command="handleLocaleChange">
        <el-button text class="topbar__lang-btn">
          🌐 {{ currentLocaleName }}
          <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="locale in supportedLocales"
              :key="locale.value"
              :command="locale.value"
            >
              {{ locale.flag }} {{ locale.label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- 用户头像 + 下拉菜单 -->
      <el-dropdown trigger="click" @command="handleUserCommand">
        <div class="topbar__user">
          <el-avatar :size="32" :src="userStore.avatar">
            {{ userStore.displayName.charAt(0) }}
          </el-avatar>
          <span class="topbar__username">{{ userStore.displayName }}</span>
          <el-icon><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile">个人信息</el-dropdown-item>
            <el-dropdown-item command="password">修改密码</el-dropdown-item>
            <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Expand, Fold, ArrowDown } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useMenuStore } from '@/stores/menu'
import { useAppStore } from '@/stores/app'
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES } from '@/i18n'

interface Props {
  collapsed: boolean
}

defineProps<Props>()
const emit = defineEmits<{ toggleSidebar: [] }>()

const router = useRouter()
const userStore = useUserStore()
const menuStore = useMenuStore()
const appStore = useAppStore()
const { locale } = useI18n()

const breadcrumbs = computed(() => menuStore.breadcrumbs)
const supportedLocales = SUPPORTED_LOCALES

// 当前语言显示名
const currentLocaleName = computed(
  () => supportedLocales.find((l) => l.value === appStore.locale)?.label ?? appStore.locale,
)

const toggleSidebar = () => {
  emit('toggleSidebar')
}

// 切换语言
const handleLocaleChange = (localeValue: string) => {
  appStore.setLocale(localeValue)
  locale.value = localeValue
}

// 用户下拉命令
const handleUserCommand = async (command: string) => {
  if (command === 'logout') {
    await ElMessageBox.confirm('确认退出登录？', '提示', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await userStore.logout()
    menuStore.resetMenu()
    router.push('/login')
  }
}
</script>

<style scoped lang="scss">
.topbar {
  height: $topbar-height;
  background: $topbar-bg;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 0 0;
  flex-shrink: 0;

  &__left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__collapse-btn {
    color: #ffffff !important;
    font-size: 18px;
    width: 40px;
    height: 40px;
  }

  &__breadcrumb {
    :deep(.el-breadcrumb__inner),
    :deep(.el-breadcrumb__separator) {
      color: rgba(255, 255, 255, 0.7) !important;
    }

    :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
      color: #ffffff !important;
    }
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  &__lang-btn {
    color: rgba(255, 255, 255, 0.85) !important;
    font-size: 13px;
  }

  &__user {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: 6px;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.85);
    transition: background 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  }

  &__username {
    font-size: 14px;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
