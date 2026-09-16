import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const routesSource = await readFile(new URL('../src/router/dynamicRoutes.ts', import.meta.url), 'utf8')
const menuSeedDir = fileURLToPath(
  new URL('../../titanium-admin/titanium-admin-bootstrap/src/main/resources/liquibase/dml/', import.meta.url),
)
const changelogSource = await readFile(
  new URL(
    '../../titanium-admin/titanium-admin-bootstrap/src/main/resources/liquibase/changelog-master.xml',
    import.meta.url,
  ),
  'utf8',
)

/** 解析 dynamicRoutes.ts 中带 component 的叶子路由（目录节点无 component，自然排除） */
function leafRoutes() {
  const pattern = /path: '([^']+)',\s*name: '([^']+)',\s*component: \(\) => import\('@\/views\/([^']+)'\),\s*meta: \{([^}]*)\}/g
  return [...routesSource.matchAll(pattern)].map((match) => {
    const meta = match[4]
    const permission = meta.match(/permission: '([^']+)'/)
    return {
      path: match[1],
      component: match[3],
      permission: permission ? permission[1] : null,
      hidden: /hidden: true/.test(meta),
    }
  })
}

/** 取出种子 DML 中所有 `INSERT INTO t_menu ...` 语句块（菜单行，不含按钮权限行） */
async function menuSeedBlocks() {
  const files = (await readdir(menuSeedDir)).filter((name) => name.endsWith('.sql'))
  const blocks = []
  for (const name of files) {
    const sql = await readFile(join(menuSeedDir, name), 'utf8')
    for (const match of sql.matchAll(/INSERT INTO `t_menu`([\s\S]*?);/g)) blocks.push(match[1])
  }
  return blocks.join('\n')
}

test('每条非 hidden 路由都必须有菜单种子，否则页面不可达', async () => {
  const blocks = await menuSeedBlocks()
  const routes = leafRoutes().filter((route) => !route.hidden && route.permission)

  // 守卫这条测试本身：正则若失配而捕到 0 条路由，上面的断言会空转通过（假绿）。
  assert.ok(routes.length >= 25, `路由解析结果过少（${routes.length} 条），疑似 dynamicRoutes.ts 格式变更导致正则失配`)

  const missing = routes
    .filter((route) => !blocks.includes(`'${route.permission}'`))
    .map((route) => `${route.path} → ${route.permission}`)

  // D-501-28：/claim/config 声明为非 hidden（应在侧边栏出现）、组件真实存在，
  // 但种子中没有 claim:config 菜单行 ⇒ 登录后菜单树不含该节点、全站无任何跳转入口。
  // 判据是「路由声明应在侧边栏出现」与「种子确有该菜单行」两端必须齐备。
  assert.deepEqual(missing, [], `以下路由声明为非 hidden 却没有对应菜单种子：\n${missing.join('\n')}`)
})

test('每个菜单种子文件都被 changelog-master 收录', async () => {
  const files = (await readdir(menuSeedDir)).filter((name) => name.endsWith('.sql'))
  const unregistered = files.filter((name) => !changelogSource.includes(name))

  // 种子写了但不 include，等于没写：Liquibase 不会执行，环境上依旧缺行。
  assert.deepEqual(unregistered, [], `以下 DML 未被 changelog-master.xml 收录：\n${unregistered.join('\n')}`)
})

test('理赔配置中心页面级权限与按钮级权限分列，页面缺一不可', async () => {
  const blocks = await menuSeedBlocks()

  // 页面级（MENU）：决定菜单树是否出现该节点 —— 缺它则整页不可达
  assert.match(blocks, /'claim:config'/)
  // 按钮级（BUTTON）：决定页内维护动作是否放行 —— 与页面级是两个层次，不可互相替代
  const buttonSeed = await readFile(
    join(menuSeedDir, 'admin_write_endpoint_permissions_202609161030_weisun_dml.sql'),
    'utf8',
  )
  assert.match(buttonSeed, /'claim:config:edit'/)
  assert.match(routesSource, /title: '理赔配置中心', permission: 'claim:config'/)
})
