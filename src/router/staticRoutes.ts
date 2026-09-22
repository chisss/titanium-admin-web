// 静态路由 - 登录页、404 等不需要权限的路由
import type { RouteRecordRaw } from 'vue-router'

export const staticRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', hidden: true },
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/views/404.vue'),
    meta: { title: '页面未找到', hidden: true },
  },
  {
    // 403 与 404 同属「无需权限的落点」：它是路由门禁把无权用户送来的地方，
    // 若给它设 meta.permission 或被门禁覆盖，无权用户会陷入「被拦到 403 又被 403 拦住」的死循环。
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/403.vue'),
    meta: { title: '无权访问', hidden: true },
  },
  {
    // 匹配所有未知路由，重定向到 404
    path: '/:pathMatch(.*)*',
    redirect: '/404',
    meta: { hidden: true },
  },
]
