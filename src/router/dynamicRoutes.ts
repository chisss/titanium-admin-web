// 动态路由定义 - 需要权限控制的业务路由
import type { RouteRecordRaw } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'

export const dynamicRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: AppLayout,
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '数据看板', icon: 'Odometer', affix: true },
      },
      // 产品管理
      {
        path: 'product',
        name: 'Product',
        meta: { title: '产品管理', icon: 'Box' },
        children: [
          {
            path: 'list',
            name: 'ProductList',
            component: () => import('@/views/product/list/index.vue'),
            meta: { title: '产品列表', permission: 'product:list' },
          },
          {
            path: 'create',
            name: 'ProductCreate',
            component: () => import('@/views/product/create/index.vue'),
            meta: { title: '新建产品', permission: 'product:create', hidden: true },
          },
          {
            path: 'detail/:id',
            name: 'ProductDetail',
            component: () => import('@/views/product/detail/index.vue'),
            meta: { title: '产品详情', permission: 'product:detail', hidden: true },
          },
        ],
      },
      // 保单管理
      {
        path: 'policy',
        name: 'Policy',
        meta: { title: '保单管理', icon: 'Document' },
        children: [
          {
            path: 'list',
            name: 'PolicyList',
            component: () => import('@/views/policy/list/index.vue'),
            meta: { title: '保单查询', permission: 'policy:list' },
          },
          {
            path: 'detail/:id',
            name: 'PolicyDetail',
            component: () => import('@/views/policy/detail/index.vue'),
            meta: { title: '保单详情', permission: 'policy:detail', hidden: true },
          },
        ],
      },
      // 条款管理
      {
        path: 'clause',
        name: 'Clause',
        meta: { title: '条款管理', icon: 'Files' },
        children: [
          {
            path: 'list',
            name: 'ClauseList',
            component: () => import('@/views/clause/list/index.vue'),
            meta: { title: '条款列表', permission: 'clause:list' },
          },
          {
            path: 'edit/:id?',
            name: 'ClauseEdit',
            component: () => import('@/views/clause/edit/index.vue'),
            meta: { title: '条款编辑', permission: 'clause:edit', hidden: true },
          },
        ],
      },
      // 计费管理
      {
        path: 'billing',
        name: 'Billing',
        meta: { title: '计费管理', icon: 'CreditCard' },
        children: [
          {
            path: 'list',
            name: 'BillingList',
            component: () => import('@/views/billing/list/index.vue'),
            meta: { title: '账单查询', permission: 'billing:list' },
          },
          {
            path: 'detail/:id',
            name: 'BillingDetail',
            component: () => import('@/views/billing/detail/index.vue'),
            meta: { title: '账单详情', permission: 'billing:detail', hidden: true },
          },
        ],
      },
      // 保全管理
      {
        path: 'maintenance',
        name: 'Maintenance',
        meta: { title: '保全管理', icon: 'Tools' },
        children: [
          {
            path: 'list',
            name: 'MaintenanceList',
            component: () => import('@/views/maintenance/list/index.vue'),
            meta: { title: '保全工单', permission: 'maintenance:list' },
          },
          {
            path: 'detail/:id',
            name: 'MaintenanceDetail',
            component: () => import('@/views/maintenance/detail/index.vue'),
            meta: { title: '保全详情', permission: 'maintenance:detail', hidden: true },
          },
        ],
      },
      // 理赔管理
      {
        path: 'claim',
        name: 'Claim',
        meta: { title: '理赔管理', icon: 'FirstAidKit' },
        children: [
          {
            path: 'list',
            name: 'ClaimList',
            component: () => import('@/views/claim/list/index.vue'),
            meta: { title: '理赔案件', permission: 'claim:list' },
          },
          {
            path: 'detail/:id',
            name: 'ClaimDetail',
            component: () => import('@/views/claim/detail/index.vue'),
            meta: { title: '理赔详情', permission: 'claim:detail', hidden: true },
          },
        ],
      },
      // 核保管理
      {
        path: 'underwriting',
        name: 'Underwriting',
        meta: { title: '核保管理', icon: 'DocumentChecked' },
        children: [
          {
            path: 'list',
            name: 'UnderwritingList',
            component: () => import('@/views/underwriting/list/index.vue'),
            meta: { title: '核保工单', permission: 'underwriting:list' },
          },
          {
            path: 'detail/:id',
            name: 'UnderwritingDetail',
            component: () => import('@/views/underwriting/detail/index.vue'),
            meta: { title: '核保详情', permission: 'underwriting:detail', hidden: true },
          },
        ],
      },
      // 客户管理
      {
        path: 'customer',
        name: 'Customer',
        meta: { title: '客户管理', icon: 'User' },
        children: [
          {
            path: 'list',
            name: 'CustomerList',
            component: () => import('@/views/customer/list/index.vue'),
            meta: { title: '客户列表', permission: 'customer:list' },
          },
          {
            path: 'detail/:id',
            name: 'CustomerDetail',
            component: () => import('@/views/customer/detail/index.vue'),
            meta: { title: '客户详情', permission: 'customer:detail', hidden: true },
          },
        ],
      },
      // 渠道管理
      {
        path: 'channel',
        name: 'Channel',
        meta: { title: '渠道管理', icon: 'Connection' },
        children: [
          {
            path: 'list',
            name: 'ChannelList',
            component: () => import('@/views/channel/list/index.vue'),
            meta: { title: '渠道列表', permission: 'channel:list' },
          },
        ],
      },
      // 监管报告
      {
        path: 'regulatory',
        name: 'Regulatory',
        meta: { title: '监管报告', icon: 'DataAnalysis' },
        children: [
          {
            path: 'list',
            name: 'RegulatoryList',
            component: () => import('@/views/regulatory/list/index.vue'),
            meta: { title: '报告列表', permission: 'regulatory:list' },
          },
        ],
      },
      // 通知管理
      {
        path: 'notification',
        name: 'Notification',
        meta: { title: '通知管理', icon: 'Bell' },
        children: [
          {
            path: 'list',
            name: 'NotificationList',
            component: () => import('@/views/notification/list/index.vue'),
            meta: { title: '通知列表', permission: 'notification:list' },
          },
        ],
      },
      // 文档档案
      {
        path: 'document',
        name: 'Document',
        meta: { title: '文档档案', icon: 'Folder' },
        children: [
          {
            path: 'list',
            name: 'DocumentList',
            component: () => import('@/views/document/list/index.vue'),
            meta: { title: '文档列表', permission: 'document:list' },
          },
        ],
      },
      // 系统管理
      {
        path: 'system',
        name: 'System',
        meta: { title: '系统管理', icon: 'Setting' },
        children: [
          {
            path: 'tenant',
            name: 'Tenant',
            component: () => import('@/views/system/tenant/index.vue'),
            meta: { title: '租户管理', permission: 'system:tenant' },
          },
          {
            path: 'user',
            name: 'User',
            component: () => import('@/views/system/user/index.vue'),
            meta: { title: '用户管理', permission: 'system:user' },
          },
          {
            path: 'role',
            name: 'Role',
            component: () => import('@/views/system/role/index.vue'),
            meta: { title: '角色权限', permission: 'system:role' },
          },
          {
            path: 'menu',
            name: 'Menu',
            component: () => import('@/views/system/menu/index.vue'),
            meta: { title: '菜单管理', permission: 'system:menu' },
          },
          {
            path: 'dict',
            name: 'Dict',
            component: () => import('@/views/system/dict/index.vue'),
            meta: { title: '字典管理', permission: 'system:dict' },
          },
          {
            path: 'log',
            name: 'Log',
            component: () => import('@/views/system/log/index.vue'),
            meta: { title: '操作日志', permission: 'system:log' },
          },
        ],
      },
    ],
  },
]
