import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { seedRows } from './liquibase-rows.mjs'

// 字段级权限（B2）契约
//
// 缺陷背景：产品的定价/费率表/精算/核保四组配置此前只受 `product:edit` 保护 ——
// 「能改产品的人就能改费率和核保规则」，精算与运营拿同一个码。B2 后端加了字段守卫
// （`FieldWriteGuard` + `GuardedWrites`，判据「提交值 ≠ 当前值 ⇒ 需权限」），前端必须同源。
//
// 本组用例钉的都是**不会崩的错法**——每一处的表现都是「页面照常渲染、请求照常返回 200」，
// 只有对应断言能发现：
//   · 前端字段名与后端目录不一致 ⇒ 守卫永远判不出改动（越权放行）；
//   · 表单给受限字段填默认值 ⇒ 什么都没改的用户被拦，且报错点名他没碰过的字段；
//   · 权限码只建不绑 ⇒ 超级管理员自己也被拦（hasAuthority 精确匹配）。
const reviseSource = await readFile(new URL('../src/views/product/revise/index.vue', import.meta.url), 'utf8')
const ruleEngineSource = await readFile(
  new URL('../src/views/rule-engine/list/index.vue', import.meta.url),
  'utf8',
)
const guardSource = await readFile(
  new URL(
    '../../titanium-admin/titanium-admin-infrastructure/src/main/java/com/titanium/admin/infrastructure/security/fieldguard/FieldWriteGuard.java',
    import.meta.url,
  ),
  'utf8',
)
const catalogSource = await readFile(
  new URL(
    '../../titanium-admin/titanium-admin-infrastructure/src/main/java/com/titanium/admin/infrastructure/security/fieldguard/GuardedWrites.java',
    import.meta.url,
  ),
  'utf8',
)
const permissionSource = await readFile(
  new URL(
    '../../titanium-admin/titanium-admin-common/src/main/java/com/titanium/admin/common/constant/AdminPermission.java',
    import.meta.url,
  ),
  'utf8',
)

/** 剥掉注释，只留可执行代码（注释里刻意引用了历史缺陷写法，全文匹配会假阳性） */
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')

const reviseCode = stripComments(reviseSource)
const ruleEngineCode = stripComments(ruleEngineSource)

/** 后端目录里核保块的受守卫字段名（`newUnderwritingConfig.<字段>`） */
function guardedUnderwritingFields() {
  const names = [...catalogSource.matchAll(/newUnderwritingConfig\.(\w+)/g)].map((m) => m[1])
  assert.ok(names.length > 0, 'GuardedWrites 必须登记核保块字段')
  return names
}

/** 前端修订单里 newUnderwritingConfig 区块的键名（有权限分支的显式键 + 无权限分支的快照展开） */
function submittedUnderwritingFields() {
  const block = reviseCode.match(
    /newUnderwritingConfig: canEditUnderwriting\.value[\s\S]*?: \{ \.\.\.raw\.underwritingConfig \}/,
  )
  assert.ok(block, '修订页必须按 canEditUnderwriting 分支组装 newUnderwritingConfig，无权限时整块透传快照')
  return [...block[0].matchAll(/\n\s+(\w+):/g)].map((m) => m[1])
}

test('① 前端提交的核保字段与后端守卫目录逐字段一致', () => {
  // 🔴 这是本组的地基：守卫按**字段名**把「提交值」与「当前值」配对。
  //    前端少发一个字段 ⇒ 该字段在下游被清空而守卫看不见（越权 + 静默清空）；
  //    前端多发一个守卫没登记的字段 ⇒ 那个字段不受字段权限约束（权限漏口）。
  const catalog = [...guardedUnderwritingFields()].sort()
  const submitted = [...submittedUnderwritingFields()].sort()
  assert.deepEqual(
    submitted,
    catalog,
    '修订页 newUnderwritingConfig 的键必须与 GuardedWrites 登记的核保字段完全相同',
  )
})

test('② 受限区块的权限码前端与后端同源', () => {
  // 前端 v-if 用的码与后端守卫要的码必须是同一个字符串，否则「界面可编辑、后端拒绝」
  const codes = [...permissionSource.matchAll(/String (PRODUCT_PRICING_EDIT|PRODUCT_ACTUARIAL_EDIT|PRODUCT_RATE_TABLE_EDIT|UNDERWRITING_CONFIG_EDIT) = "([^"]+)"/g)].map(
    (m) => m[2],
  )
  assert.deepEqual(
    codes.sort(),
    ['product:actuarial:edit', 'product:pricing:edit', 'product:rate-table:edit', 'underwriting:config:edit'].sort(),
  )
  assert.match(reviseCode, /hasPermission\('product:pricing:edit'\)/)
  assert.match(reviseCode, /hasPermission\('underwriting:config:edit'\)/)
  assert.match(ruleEngineCode, /hasPermission\('underwriting:config:edit'\)/)
  // 目录里四个码各管一组字段（少一个码 = 一组配置无人管）
  for (const code of ['product:pricing:edit', 'product:actuarial:edit', 'product:rate-table:edit', 'underwriting:config:edit']) {
    assert.ok(catalogSource.includes(code), `GuardedWrites 必须使用权限码 ${code}`)
  }
})

test('③ 无权限时受限区块只读，并说明缺的是哪个码', () => {
  assert.match(reviseCode, /:disabled="!canEditUnderwriting"/, '核保配置区块在缺码时必须整体禁用')
  assert.match(reviseCode, /:disabled="!canEditPricing"/, '定价区块在缺码时必须整体禁用')
  // 只读必须给出**原因与去处**，否则用户只会看到一堆点不动的控件
  assert.match(reviseCode, /核保配置为只读[\s\S]{0,160}underwriting:config:edit/)
  assert.match(reviseCode, /定价为只读[\s\S]{0,160}product:pricing:edit/)
})

test('④ 载荷对无权限的区块按详情原值透传', () => {
  assert.match(reviseCode, /newUnderwritingConfig: canEditUnderwriting\.value/)
  assert.match(reviseCode, /:\s*\{ \.\.\.raw\.underwritingConfig \}/)
  assert.match(reviseCode, /newPricingBasicRule: canEditPricing\.value/)
  assert.match(reviseCode, /:\s*\{ \.\.\.pr \}/, '无定价权限时 newPricingBasicRule 必须整块透传快照')
  assert.match(reviseCode, /newPricingMode: canEditPricing\.value \? form\.value\.pricingMode : pr\.pricingMode \?\? raw\.pricingMode/)
})

test('⑤ 回填不得给受限字段填默认值（那是伪造出来的改动）', () => {
  // 🔴 这三处 `?? 默认值` 是 B2 落地时真实存在过的写法：
  //    快照里 underwritingMode 为 null 时表单预置 'SMART'，于是「只想改产品名」的用户
  //    提交的载荷里核保模式从 null 变成 'SMART' —— 后端判为改动，整单被 74008000 拦下，
  //    而报错点名的「核保模式」他根本没打开过。有权用户更糟：默认值被当成真实改动写进新版本。
  const prefill = reviseCode.match(/const prefillForm = \(raw[\s\S]*?\n\}/)
  assert.ok(prefill, '应存在 prefillForm')
  for (const fabricated of ["?? 'SMART'", "?? 'RATE_TABLE'", '?? false']) {
    assert.ok(
      !prefill[0].includes(fabricated),
      `prefillForm 不得对受限字段使用默认值 ${fabricated}（会伪造出一次改动）`,
    )
  }
  assert.match(prefill[0], /underwritingMode: uw\.underwritingMode/, '核保模式必须照抄快照')
  assert.match(prefill[0], /pricingMode: pr\.pricingMode \?\? raw\.pricingMode/, '定价模式必须照抄快照')
})

test('⑥ 规则集写入按类型分流，且三处写入口都受同一判据约束', () => {
  // 后端：类型分流闸只登记 UNDERWRITING（其他类型归各自业务权限，本批不擅自加限制）
  assert.match(catalogSource, /TypeGate\.of\("核保规则集写入", "规则集类型",\s*"UNDERWRITING", UNDERWRITING_CONFIG_EDIT\)/)
  assert.match(guardSource, /public void enforce\(TypeGate gate, String value\)/)
  // 前端：判据落在规则集类型上，而非按钮本身（同一个「激活」按钮，定价类不需要这个码）
  assert.match(ruleEngineCode, /const writableRuleSet = \(ruleSetType\?: string\) =>[\s\S]{0,120}UNDERWRITING/)
  // 三处写入口：启/停、追加规则、新建（新建按对话框里选的类型判定）
  assert.match(ruleEngineCode, /row\.status === 'DRAFT' && writableRuleSet\(row\.ruleSetType\)/)
  assert.match(ruleEngineCode, /row\.status === 'ACTIVE' && writableRuleSet\(row\.ruleSetType\)/)
  assert.match(ruleEngineCode, /detail\?\.status === 'DRAFT' && writableRuleSet\(detail\?\.ruleSetType\)/)
  assert.match(ruleEngineCode, /:disabled="!writableRuleSet\(form\.ruleSetType\)"/)
  // 只读时给出原因（不能只是按钮消失，用户不知道为什么）
  assert.match(ruleEngineCode, /核保规则集需要「维护核保配置（underwriting:config:edit）」权限/)
})

test('⑦ underwriting:config:edit 必须有种子且绑定 SUPER_ADMIN', async () => {
  // 🔴 只建码不绑码 = 功能回归：hasAuthority 是精确匹配，超级管理员也拿不到 ⇒ 管理员自身改核保配置被拦。
  //    只绑码不建码更糟 —— 授权页面上根本看不到这一项。
  const permissions = await seedRows('t_permission')
  const row = permissions.find((p) => p.perm_code === 'underwriting:config:edit')
  assert.ok(row, 't_permission 必须登记 underwriting:config:edit')
  assert.equal(row.perm_type, 'BUTTON')
  assert.equal(row.is_deleted, '0')

  const rolePermissions = await seedRows('t_role_permission')
  assert.ok(
    rolePermissions.some((rp) => rp.role_id === '1' && rp.permission_id === row.id),
    `SUPER_ADMIN（role_id=1）必须绑定权限点 ${row.id}（underwriting:config:edit）`,
  )
})

test('⑧ 登记该权限点的种子文件必须挂在 changelog-master 上，否则永不执行', async () => {
  // 种子放对了目录但没 include，是最安静的一种失效：文件在、内容对、CI 全绿，只是从没跑过。
  const changelog = await readFile(
    new URL(
      '../../titanium-admin/titanium-admin-bootstrap/src/main/resources/liquibase/changelog-master.xml',
      import.meta.url,
    ),
    'utf8',
  )
  const dmlDir = new URL(
    '../../titanium-admin/titanium-admin-bootstrap/src/main/resources/liquibase/dml/',
    import.meta.url,
  )
  const { readdir } = await import('node:fs/promises')
  const names = (await readdir(dmlDir)).filter((name) => name.endsWith('.sql'))

  const owners = []
  for (const name of names) {
    const sql = await readFile(new URL(name, dmlDir), 'utf8')
    if (/INSERT INTO `t_permission`[\s\S]*?'underwriting:config:edit'/.test(sql)) owners.push(name)
  }
  assert.equal(owners.length, 1, `underwriting:config:edit 应恰由一个种子文件登记，实际：${owners.join(', ')}`)
  assert.ok(
    changelog.includes(owners[0]),
    `种子文件 ${owners[0]} 必须被 changelog-master.xml include，否则该权限点永远不会落库`,
  )
})
