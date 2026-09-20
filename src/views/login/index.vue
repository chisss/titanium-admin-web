<template>
  <!-- 登录页 - 保险行业深蓝风格 -->
  <div class="login-page">
    <!-- 背景装饰 -->
    <div class="login-page__bg" />

    <!-- 登录卡片 -->
    <div class="login-card">
      <!-- Logo -->
      <div class="login-card__header">
        <img src="/logo.svg" alt="Logo" class="login-card__logo" />
        <h1 class="login-card__title">Titanium 保险核心</h1>
        <p class="login-card__subtitle">管理后台</p>
      </div>

      <!-- 登录表单 -->
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        class="login-card__form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            :prefix-icon="User"
            placeholder="请输入用户名"
            size="large"
            autocomplete="username"
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            :prefix-icon="Lock"
            type="password"
            placeholder="请输入密码"
            size="large"
            show-password
            autocomplete="current-password"
            @keydown.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item>
          <!-- 🔴 S-12 上线前清理：此处原有一行**明文默认凭据提示**（守卫正则在同一行命中 2 次），
               内网演示用的便利，一旦随镜像上线就是把一套可用账号印在门上，故整行移除。
               行内原本「记住我居左、凭据提示居右」的两栏布局随之只剩一栏，
               包裹用的 .login-card__row 与 .login-card__demo-hint 一并删除（否则留两条死样式）。
               ⚠️ 本条注释刻意**不复述那串账号**：S-12 数的是纯文本命中，把字面量写进注释
               与写进模板一样会算违规（本轮实测：改完模板仍红，红的正是注释这一行）。 -->
          <el-checkbox v-model="form.rememberMe">记住我</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="login-card__btn"
            @click="handleLogin"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 右下角语言切换 -->
    <div class="login-page__locale">
      <el-dropdown trigger="click" @command="handleLocaleChange">
        <span class="login-page__locale-btn">
          🌐 {{ currentLocaleName }} <el-icon><ArrowDown /></el-icon>
        </span>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { User, Lock, ArrowDown } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { SUPPORTED_LOCALES } from '@/constants/locale'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const appStore = useAppStore()

const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  username: '',
  password: '',
  rememberMe: false,
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码不能少于6位', trigger: 'blur' },
  ],
}

const supportedLocales = SUPPORTED_LOCALES
const currentLocaleName = computed(
  () => supportedLocales.find((l) => l.value === appStore.locale)?.label ?? '中文',
)

// 回填「记住我」的用户名
//
// 🔴 此前这个勾选框是个**桩控件**：勾了只往 localStorage 写一个 `ti_remember_me`，
//    而全仓**没有任何一处读它**（登出时还会把它删掉），用户勾与不勾看到的差别是零。
//    补上读取端才让「记住我」名副其实——只回填用户名，密码从不落盘。
//    读取走 store 的 action（而非 getter）的原因见 user.ts 注释：getter 是 computed，
//    对这种非响应式来源只会求值一次并永久缓存。
onMounted(() => {
  const remembered = userStore.readRememberedUsername()
  if (!remembered) return
  form.username = remembered
  form.rememberMe = true
})

// 切换语言：🔴 D-12 移除了同步 vue-i18n locale 的那一行。登录页与顶栏共用
// appStore.setLocale（写 ti_locale 持久化），故此处的选择登录后立即对 useDict 生效。
const handleLocaleChange = (localeValue: string) => {
  appStore.setLocale(localeValue)
}

const handleLogin = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await userStore.login({
      username: form.username,
      password: form.password,
      rememberMe: form.rememberMe,
    })
    // 登录成功：跳转到目标页或默认 dashboard
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.push(decodeURIComponent(redirect))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.login-page {
  height: 100vh;
  width: 100vw;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $login-bg;
  position: relative;
  overflow: hidden;

  // 背景装饰（抽象几何图形）
  // 🔴 色值取自令牌：$primary-light 即品牌色第二档（原写死 rgba(45,90,160,·)），
  //    $sidebar-active 与 $primary-color 同值（原写死 rgba(26,58,107,·)）
  &__bg {
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(ellipse at 20% 50%, rgba($primary-light, 0.3) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 20%, rgba($sidebar-active, 0.4) 0%, transparent 50%);
  }

  &__locale {
    position: fixed;
    bottom: 24px;
    right: 24px;
  }

  &__locale-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 13px;
    cursor: pointer;

    &:hover {
      color: rgba(255, 255, 255, 0.9);
    }
  }
}

.login-card {
  position: relative;
  z-index: 1;
  width: 420px;
  background: rgba(255, 255, 255, 0.97);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);

  &__header {
    text-align: center;
    margin-bottom: 32px;
  }

  &__logo {
    width: 64px;
    height: 64px;
    margin-bottom: 12px;
  }

  &__title {
    font-size: 22px;
    font-weight: 700;
    color: $primary-color;
    margin: 0 0 4px;
  }

  &__subtitle {
    font-size: 14px;
    color: $text-secondary;
    margin: 0;
  }

  &__form {
    .el-form-item {
      margin-bottom: 20px;
    }
  }

  &__btn {
    width: 100%;
    height: 44px;
    font-size: 16px;
    background: linear-gradient(135deg, $primary-color, $primary-lighter);
    border: none;

    &:hover {
      background: linear-gradient(135deg, $primary-light, $primary-lighter);
    }
  }
}
</style>
