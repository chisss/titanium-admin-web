<template>
  <!-- 顶部导航栏 -->
  <div class="topbar">
    <!-- 左侧：折叠按钮 + 面包屑 -->
    <div class="topbar__left">
      <el-button
        class="topbar__collapse-btn"
        :icon="collapsed ? Expand : Fold"
        text
        :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
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
        <el-button text class="topbar__lang-btn" :aria-label="`切换语言，当前${currentLocaleName}`">
          <span class="topbar__lang-icon" aria-hidden="true">🌐</span>
          <span class="topbar__lang-label">{{ currentLocaleName }}</span>
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
        <div class="topbar__user" role="button" tabindex="0" aria-label="用户菜单">
          <el-avatar :size="32" :src="userStore.avatar">
            {{ userStore.displayName.charAt(0) }}
          </el-avatar>
          <span class="topbar__username">{{ userStore.displayName }}</span>
          <el-icon><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="logout">退出登录</el-dropdown-item>
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
import { SUPPORTED_LOCALES } from '@/constants/locale'

interface Props {
  collapsed: boolean
}

defineProps<Props>()
const emit = defineEmits<{ toggleSidebar: [] }>()

const router = useRouter()
const userStore = useUserStore()
const menuStore = useMenuStore()
const appStore = useAppStore()

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
//
// 🔴 D-12：原先除写 appStore 外还同步 vue-i18n 的 locale，随前端 i18n 一并移除。
// 切换后真正生效的是 useDict 按 appStore.locale 取后端下发的 `i18nLabels` 译文，
// 不再有「改了一个没人读的值」这种表面动作。
const handleLocaleChange = (localeValue: string) => {
  appStore.setLocale(localeValue)
}

// 用户下拉命令
//
// 🔴 这里原有 `profile`（个人信息）与 `password`（修改密码）两项菜单，但 handleUserCommand
//    里**没有任何一个分支处理它们**——点下去下拉收起、页面毫无反应，是典型的死入口。
//    逐项核实后的处置：
//    · 修改密码 —— 后端**没有**自助改密端点（AuthController 只有 login/refresh/logout/
//      profile/user-info；域内的 AdminUser.changePassword 服务的是「管理员重置**他人**密码」的
//      /web/v1/users/{id}/reset-password），且本任务只动前端仓，通不了 ⇒ 移除入口。
//    · 个人信息 —— 后端 `GET /web/v1/auth/profile` 确实存在、可实现；但本任务是「上线前清理」，
//      不新增界面，故一并移除，登记为后续特性（补个只读弹层即可接上）。
//    「退出登录」上的 `divided` 也一并去掉：它是用来与上面两项隔开的，单项菜单再加分隔线只会
//    在弹层顶部多出一道没有下文的横线。
const handleUserCommand = async (command: string) => {
  if (command !== 'logout') return
  await ElMessageBox.confirm('确认退出登录？', '提示', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning',
  })
  await userStore.logout()
  menuStore.resetMenu()
  router.push('/login')
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
    border-radius: $radius-md;
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

@media (max-width: $breakpoint-mobile) {
  .topbar {
    padding-right: 4px;

    &__left {
      min-width: 0;
    }

    &__breadcrumb {
      min-width: 0;
      max-width: 126px;
      overflow: hidden;
      white-space: nowrap;

      :deep(.el-breadcrumb__item:not(:last-child)) {
        display: none;
      }
    }

    &__lang-btn {
      width: 36px;
      padding: 8px;
    }

    &__lang-label,
    &__username {
      display: none;
    }

    &__user {
      gap: 4px;
      padding: 4px;
    }
  }
}
</style>
