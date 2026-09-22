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
  //    /403 必须与 /404 同在白名单：它是路由门禁的落点，自身无 Token 也不能再被弹回登录页
  const whiteList = ['/login', '/404', '/403']
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

  // 4. 路由级权限门禁：meta.permission 不匹配即跳 403
  //
  // 🔴 此前**整页级零门禁**：后端 hasAuthority 逐端点管着、前端按钮级有 v-permission/hasPermission，
  //    但「这一页能不能进」无人判定——只读账号直接敲 URL 就能打开本不该进的页面，
  //    页内每个写入口再各自被按钮门拦一道（拦不住的那几个就成了可操作的空壳）。
  //    文档级（菜单树）+ 端点级（后端）+ 页面级（此处）三者齐备，才是完整的一层门。
  //
  // 🔴 置于「用户信息已加载」之后：permissions 为空数组时 hasPermission 恒 false，
  //    若把门禁提到加载之前，任何一次首屏导航都会把合法用户误判成无权。
  // 🔴 超管走 userStore.hasPermission 的 `*` 通配（与后端 EffectivePermissions 的展开同源），
  //    故此处无需再判角色。
  // 🔴 dashboard 刻意不设 meta.permission（见 dynamicRoutes.ts）：它是登录落地页，
  //    一旦给它设码，没被授该码的角色一登录就被自己的门禁弹走，无处可去。
  const required = to.meta.permission as string | undefined
  if (required && !userStore.hasPermission(required)) {
    return next({ path: '/403', query: { need: required, from: to.fullPath }, replace: true })
  }

  return next()
})

router.afterEach(() => {
  NProgress.done()
})

export default router
