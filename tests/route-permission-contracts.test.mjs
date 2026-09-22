import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import test from 'node:test'
import { seedRows } from './liquibase-rows.mjs'

// 路由级权限门契约（round6 批次 4）
//
// 缺陷背景：后台此前只有**两层**权限——后端逐端点的 `hasAuthority`、前端按钮级的
// `v-permission`/`hasPermission`——**整页级零门禁**。只读账号直接敲 URL 就能打开本不该进的
// 页面，页内写入口再各自被按钮门拦一道，而漏拦的那几个就成了"看得见、点得动、提交即 403"的空壳。
// 本次新增第三层：router/index.ts 的 beforeEach 逐条比对 `meta.permission`，不匹配跳 /403。
//
// 🔴 加门禁的**真正难点不在守卫本身，而在路由码的质量**：门禁一上线，任何"授不出去的码"
//    立刻从"无害的装饰"变成"锁死页面的闸门"。实测 43 条带码路由中：
//      · 7 条 `*:detail`（product/policy/clause/billing/claim/underwriting/customer）**从未登记进
//        t_permission** —— 无权可授，即除了持 `*` 通配的超管，所有角色都打不开详情页；
//      · 1 条 `claim:config` 是页面级码，而该 controller 连 GET 都要求 `claim:config:edit`
//        —— 授页面码者看得见菜单却读不到数据，授按钮码者连菜单都没有；
//      · 1 条 `maintenance:view` 与 `maintenance:list` 并列存在，工作台从工单列表下钻，
//        却要求另一个码，运营角色点进去就是 403。
//    故本用例断言的不只是"守卫接线了"，更是"每条路由码都**可授**且**与该页面的菜单/下钻关系自洽**"。
const routesSource = await readFile(new URL('../src/router/dynamicRoutes.ts', import.meta.url), 'utf8')
const routerSource = await readFile(new URL('../src/router/index.ts', import.meta.url), 'utf8')
const staticRoutesSource = await readFile(new URL('../src/router/staticRoutes.ts', import.meta.url), 'utf8')

/** 解析 dynamicRoutes.ts 中带 component 的叶子路由（目录节点无 component，自然排除） */
function leafRoutes() {
  const pattern =
    /path: '([^']+)',\s*name: '([^']+)',\s*component: \(\) => import\('@\/views\/([^']+)'\),\s*meta: \{([^}]*)\}/g
  return [...routesSource.matchAll(pattern)].map((match) => {
    const meta = match[4]
    const permission = meta.match(/permission: '([^']+)'/)
    return {
      path: match[1],
      // 菜单种子的 component 列不带 `.vue` 后缀（见 t_menu 种子），统一去掉以便配对
      component: match[3].replace(/\.vue$/, ''),
      permission: permission ? permission[1] : null,
      hidden: /hidden: true/.test(meta),
    }
  })
}

const routes = leafRoutes()
const menus = await seedRows('t_menu')
const permissions = await seedRows('t_permission')
const grantableCodes = new Set(permissions.map((row) => row.perm_code))
const menuByComponent = new Map(menus.filter((m) => m.component).map((m) => [m.component, m]))

/**
 * 无菜单种子行的路由（隐藏下钻页 / 有页内入口的配置页）→ 其路由码。
 *
 * 🔴 这是一份**必须手工维护的白名单**，不是"豁免名单"：每条都写清了取码依据，
 *    集合本身参与断言（多一条少一条都失败），故新增此类路由时必须回来把依据写在这里，
 *    而不是让断言悄悄放过。
 */
const ROUTES_WITHOUT_MENU = {
  'product/create/index': 'product:create', // 写入口：产品列表页「新建」按钮
  'product/detail/index': 'product:list', // 详情页继承列表码（`product:detail` 未登记，见文件头）
  'product/revise/index': 'product:edit', // 写入口：产品详情页「修订」
  'product/template-config/index': 'product:config', // 写入口：产品详情页「模板配置」
  'policy/detail/index': 'policy:list', // 详情页继承列表码
  'clause/edit/index': 'clause:edit', // 写入口：条款列表页「新建/编辑」
  'clause/detail/index': 'clause:list', // 详情页继承列表码
  'billing/detail/index': 'billing:list', // 详情页继承列表码
  'maintenance/create/index': 'maintenance:create', // 写入口：保全工单列表页「创建保全」
  'maintenance/workbench/index': 'maintenance:list', // 工作台由工单列表下钻，继承列表码
  'maintenance/configuration/index': 'maintenance:config:view', // 页内入口：保全申请页「保全项配置」
  'claim/detail/index': 'claim:list', // 详情页继承列表码
  'underwriting/detail/index': 'underwriting:list', // 详情页继承列表码
  'customer/detail/index': 'customer:list', // 详情页继承列表码
}

/**
 * 刻意不设 meta.permission 的路由（唯一：登录落地页 dashboard）。
 *
 * 🔴 落地页一旦带码，没被授该码的角色一登录就被自己的门禁弹走，而 403 页的「返回首页」
 *    又会把他送回同一个 403 —— 死循环，用户无法自救。故它不是"漏了设码"，是必须无码。
 */
const ROUTES_DELIBERATELY_UNCODED = new Set(['dashboard/index'])

test('每条路由的 meta.permission 都必须能授出去（未登记的码谁都授不了）', () => {
  // 守卫这条测试自身：正则若失配而捕到 0 条路由，下面的断言会空转通过（假绿）
  assert.ok(
    routes.length >= 40,
    `路由解析结果过少（${routes.length} 条），疑似 dynamicRoutes.ts 格式变更导致正则失配`,
  )
  assert.ok(
    grantableCodes.size >= 120,
    `t_permission 解析结果过少（${grantableCodes.size} 条），疑似种子格式变更导致解析器失配`,
  )

  const unregistered = routes
    .filter((route) => route.permission && !grantableCodes.has(route.permission))
    .map((route) => `${route.path} → ${route.permission}`)

  // 判据是「角色能拿到这个码吗」：可授予的码只能来自 t_permission（角色-权限关联行指向它）。
  // 前端自造一个后端/种子都没有的码，等于给自己装了一扇**谁都打不开**的门。
  assert.deepEqual(
    unregistered,
    [],
    `以下路由的权限码未登记进 t_permission，无法授予任何角色（门禁上线即锁死这些页面）：\n${unregistered.join('\n')}`,
  )
})

test('有菜单种子的路由必须与菜单同码', () => {
  const menuBacked = routes.filter((route) => menuByComponent.has(route.component))

  // 菜单有码而路由无码：菜单把入口收紧了，路由却敞开着，等于同一条路径两套判据
  const uncoded = menuBacked
    .filter((route) => !route.permission && !ROUTES_DELIBERATELY_UNCODED.has(route.component))
    .map(
      (route) =>
        `${route.path}(${route.component}) 菜单码=${menuByComponent.get(route.component).perm_code}，路由未设码`,
    )
  assert.deepEqual(uncoded, [], `以下路由的菜单有码但路由未设码：\n${uncoded.join('\n')}`)

  const mismatched = menuBacked
    .filter((route) => route.permission)
    .filter((route) => menuByComponent.get(route.component).perm_code !== route.permission)
    .map((route) => {
      const menu = menuByComponent.get(route.component)
      return `${route.path}(${route.component}) 路由=${route.permission} 菜单=${menu.perm_code}`
    })

  // 两处码不一致时，两条路都进不去一个能用的页面：菜单给了入口而路由拦人（或反之）。
  // claim:config → claim:config:edit 的收敛（B4）就是这条断言催出来的。
  assert.deepEqual(mismatched, [], `路由码与菜单码不一致：\n${mismatched.join('\n')}`)
})

test('无菜单种子的路由其码必须在白名单内且与依据一致', () => {
  const actual = Object.fromEntries(
    routes
      .filter((route) => !menuByComponent.has(route.component))
      .map((route) => [route.component, route.permission]),
  )

  assert.deepEqual(
    actual,
    ROUTES_WITHOUT_MENU,
    '无菜单路由集合或取码与白名单不符：新增此类路由必须在 ROUTES_WITHOUT_MENU 中写明取码依据' +
      '（写入口用其写码；下钻详情页继承所属列表的码），并同步更新本表',
  )
})

test('dashboard 是登录落地页，不得设 meta.permission', () => {
  const dashboard = routes.find((route) => route.component === 'dashboard/index')
  assert.ok(dashboard, '未解析到 dashboard 路由')
  // 依据见 ROUTES_DELIBERATELY_UNCODED 的说明：设码会让无该码的角色陷入 403 死循环
  assert.equal(
    dashboard.permission,
    null,
    'dashboard 不得设 meta.permission：它是登录落地页，设码会让无该码的角色陷入 403 死循环',
  )
  assert.ok(
    ROUTES_DELIBERATELY_UNCODED.has(dashboard.component),
    'dashboard 必须登记在 ROUTES_DELIBERATELY_UNCODED 中，否则「有菜单种子的路由必须与菜单同码」会把它判为漏设码',
  )
})

test('路由门禁已接线：守卫读 meta.permission，403 落点三处齐备', () => {
  // ① 守卫真的在读 meta.permission 并跳 /403（不是只把码写在路由元信息里当装饰）
  assert.match(routerSource, /const required = to\.meta\.permission/, '守卫未读取 meta.permission')
  assert.match(routerSource, /path: '\/403'/, '守卫未跳转 /403')
  // ② 门禁必须在「用户信息已加载」之后：permissions 为空时 hasPermission 恒 false，
  //    提到加载之前会把每一次首屏导航都误判成无权
  assert.ok(
    routerSource.indexOf('await userStore.loadUserInfo()') < routerSource.indexOf('to.meta.permission'),
    '路由门禁出现在用户信息加载之前，会把合法用户的首次导航误判为无权',
  )
  // ③ /403 自身必须免门禁：它是权限门禁的落点，被门禁覆盖就形成「被拦到 403 又被 403 拦住」
  assert.match(routerSource, /whiteList = \[[^\]]*'\/403'/, '/403 不在路由白名单内')
  assert.match(staticRoutesSource, /path: '\/403'/, 'staticRoutes 未声明 /403')
  assert.match(staticRoutesSource, /@\/views\/403\.vue/, '/403 未指向 403.vue')
  assert.ok(
    existsSync(new URL('../src/views/403.vue', import.meta.url)),
    'src/views/403.vue 不存在',
  )
})
