// 路由初始化 + 导航守卫
import { createRouter, createWebHistory } from 'vue-router'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import { staticRoutes } from './staticRoutes'
import { dynamicRoutes } from './dynamicRoutes'
import { useUserStore } from '@/stores/user'
import { useMenuStore } from '@/stores/menu'

// 配置 NProgress
NProgress.configure({ showSpinner: false })

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [...staticRoutes, ...dynamicRoutes],
  scrollBehavior: () => ({ top: 0 }),
})

// 导航守卫
router.beforeEach(async (to, _from, next) => {
  NProgress.start()

  const userStore = useUserStore()
  const menuStore = useMenuStore()

  // 1. 无 Token → 跳转登录（白名单除外）
  const whiteList = ['/login', '/404']
  if (!userStore.isLoggedIn) {
    if (whiteList.includes(to.path)) {
      return next()
    }
    return next(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  // 2. 已登录访问 /login → 跳转 dashboard
  if (to.path === '/login') {
    return next('/dashboard')
  }

  // 3. 已登录但未加载用户信息 → 拉取用户信息和菜单
  if (!userStore.loaded) {
    try {
      await userStore.loadUserInfo()
      await menuStore.loadMenuTree()
      // 重新导航以确保路由元信息生效
      return next({ ...to, replace: true })
    } catch {
      // 加载失败清除会话，跳转登录
      userStore.clearSession()
      menuStore.resetMenu()
      return next('/login')
    }
  }

  return next()
})

router.afterEach(() => {
  NProgress.done()
})

export default router
