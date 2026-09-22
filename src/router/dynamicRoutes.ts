// 动态路由定义 - 需要权限控制的业务路由
//
// 🔴 meta.permission 的双重身份（改之前务必读懂）：
//   ① 它是**路由级门禁**的唯一输入 —— router/index.ts 的 beforeEach 会逐条比对它，
//      不匹配即跳 /403（round6 批次 4 落地）。此前后端有 hasAuthority、前端只有按钮级
//      v-permission/hasPermission，**整页级零门禁**：直接敲 URL 就能进只读账号本不该进的页面。
//   ② 它必须与「该页面的菜单种子 t_menu.perm_code」同码，否则菜单给了入口、路由却拦人
//      （或反之），两条路都进不去一个能用的页面。
//
// 🔴 两个码选取规约（tests/route-permission-contracts.test.mjs 机械固化）：
//   · **详情页/工作台继承所属列表的码**：`*:detail`、`*:view` 这类细分码从未登记进
//     t_permission，任何人都授不了它 ⇒ 一旦用作门禁，连超管之外的全部角色都打不开详情页。
//     详情页本来就是列表行的下钻，可见性应当由列表码决定（有列表权限即能看详情）。
//   · **一码到底**：页面若整页都是写操作（如理赔配置中心，其 controller 连 GET 都要求
//     claim:config:edit），页面码就取那个写码，不另造页面级码制造「看得见读不了」的死胡同。
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
            meta: { title: '产品详情', permission: 'product:list', hidden: true },
          },
          {
            path: 'revise/:id',
            name: 'ProductRevise',
            component: () => import('@/views/product/revise/index.vue'),
            meta: { title: '修订产品', permission: 'product:edit', hidden: true },
          },
          {
            path: 'config/:id',
            name: 'ProductTemplateConfig',
            component: () => import('@/views/product/template-config/index.vue'),
            meta: { title: '产品配置', permission: 'product:config', hidden: true },
          },
          {
            path: 'rate-tables',
            name: 'ProductRateTables',
            component: () => import('@/views/product/rate-tables/index.vue'),
            meta: { title: '费率表', permission: 'product:rate-table' },
          },
          {
            path: 'pricing-plans',
            name: 'ProductPricingPlans',
            component: () => import('@/views/product/pricing-plans/index.vue'),
            meta: { title: '定价包', permission: 'product:pricing' },
          },
          {
            path: 'actuarial-workbench',
            name: 'ProductActuarialWorkbench',
            component: () => import('@/views/product/actuarial-workbench/index.vue'),
            meta: { title: '精算工作台', permission: 'product:actuarial' },
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
            meta: { title: '保单详情', permission: 'policy:list', hidden: true },
          },
          {
            path: 'application',
            name: 'PolicyApplication',
            component: () => import('@/views/policy/application/index.vue'),
            meta: { title: '投保单查询', permission: 'policy:application' },
          },
          {
            path: 'intention',
            name: 'PolicyIntention',
            component: () => import('@/views/policy/intention/index.vue'),
            meta: { title: '意向单查询', permission: 'policy:intention' },
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
          {
            path: 'detail/:id',
            name: 'ClauseDetail',
            component: () => import('@/views/clause/detail/index.vue'),
            meta: { title: '条款详情', permission: 'clause:list', hidden: true },
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
            path: 'commission-payables',
            name: 'CommissionPayables',
            component: () => import('@/views/billing/commission-payables/index.vue'),
            meta: { title: '佣金应付', permission: 'billing:commission' },
          },
          {
            path: 'payment-operations',
            name: 'PaymentOperations',
            component: () => import('@/views/billing/payment-operations/index.vue'),
            meta: { title: '支付运营', permission: 'billing:payment-operations' },
          },
          {
            path: 'detail/:id',
            name: 'BillingDetail',
            component: () => import('@/views/billing/detail/index.vue'),
            meta: { title: '账单详情', permission: 'billing:list', hidden: true },
          },
        ],
      },
      // 规则引擎管理
      {
        path: 'rule-engine',
        name: 'RuleEngine',
        meta: { title: '规则引擎', icon: 'SetUp' },
        children: [
          {
            path: 'list',
            name: 'RuleSetList',
            component: () => import('@/views/rule-engine/list/index.vue'),
            meta: { title: '规则集管理', permission: 'rule-engine:list' },
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
            path: 'create',
            name: 'MaintenanceCreate',
            component: () => import('@/views/maintenance/create/index.vue'),
            meta: { title: '创建保全', permission: 'maintenance:create', hidden: true },
          },
          {
            path: 'workbench/:id',
            name: 'MaintenanceWorkbench',
            component: () => import('@/views/maintenance/workbench/index.vue'),
            meta: { title: '保全工作台', permission: 'maintenance:list', hidden: true },
          },
          {
            path: 'configuration',
            name: 'MaintenanceConfiguration',
            component: () => import('@/views/maintenance/configuration/index.vue'),
            meta: { title: '保全项配置', permission: 'maintenance:config:view' },
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
            meta: { title: '理赔详情', permission: 'claim:list', hidden: true },
          },
          {
            path: 'config',
            name: 'ClaimConfig',
            component: () => import('@/views/claim/config/index.vue'),
            meta: { title: '理赔配置中心', permission: 'claim:config:edit' },
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
            meta: { title: '核保详情', permission: 'underwriting:list', hidden: true },
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
            meta: { title: '客户详情', permission: 'customer:list', hidden: true },
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
          {
            path: 'commission-schemes',
            name: 'CommissionSchemes',
            component: () => import('@/views/channel/commission-schemes/index.vue'),
            meta: { title: '佣金方案', permission: 'channel:commission' },
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
          {
            path: 'config',
            name: 'SystemConfig',
            component: () => import('@/views/system/config/index.vue'),
            meta: { title: '系统配置', permission: 'system:config' },
          },
        ],
      },
    ],
  },
]
