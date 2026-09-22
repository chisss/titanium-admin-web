import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

// 权限门契约（round6 批次 3）
//
// 缺陷背景：后台的写入口权限门覆盖严重不均——`product/list`、`rate-tables`、`pricing-plans`、
// `maintenance/configuration` 等页面已按权限码收放按钮，而**理赔配置中心整页（7 组配置 ×
// 新建/编辑/删除/停用/终止/撤销）、理赔详情的 8 个状态机动作、核保决策表单、条款编辑页、
// 产品创建向导与模板配置页**全部零权限门。只读账号可以点「新建」、填完整张表单，
// 点保存才被后端 403 拒 —— 与项目设计契约「禁用当前状态下无效的命令，而不是依赖后端拒绝」直接相悖。
//
// 形态说明：**后端源码为唯一权威 + 前端接线断言**。
// 权限码的全部权威在 `AdminPermission` 常量字面量与各 proxy controller 的 `@PreAuthorize` 上，
// 故本用例把两处机械抽取出来，先断言「前端用到的每一个权限码都真实存在于后端」
// （防拼错、防臆造），再断言核心配置面的写入口按**端点对应的那个码**接线（防张冠李戴）。
//
// 🔴 本用例刻意不发明任何码，也不允许「取并集」式的宽松判据：前端比后端更严即为
// 「拦住后端本可接受的输入」，比后端更松即为「放行一次必然失败的提交」，两者都是缺陷。
const viewSource = async (rel) => readFile(new URL(`../src/views/${rel}`, import.meta.url), 'utf8')

/** 剥掉注释，只留可执行代码（说明性注释里刻意引用了历史缺陷与端点，全文匹配会假阳性） */
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')

const claimConfigPanelSource = await readFile(
  new URL('../src/views/claim/config/ConfigPanel.vue', import.meta.url),
  'utf8',
)
const claimConfigPanelCode = stripComments(claimConfigPanelSource)

const claimDetailCode = stripComments(await viewSource('claim/detail/index.vue'))
const claimListCode = stripComments(await viewSource('claim/list/index.vue'))
const underwritingDetailCode = stripComments(await viewSource('underwriting/detail/index.vue'))
const clauseEditCode = stripComments(await viewSource('clause/edit/index.vue'))
const productCreateCode = stripComments(await viewSource('product/create/index.vue'))
const productReviseCode = stripComments(await viewSource('product/revise/index.vue'))
const templateConfigCode = stripComments(await viewSource('product/template-config/index.vue'))
const maintenanceConfigEditorCode = stripComments(
  await readFile(
    new URL('../src/views/maintenance/configuration/MaintenanceConfigurationEditor.vue', import.meta.url),
    'utf8',
  ),
)

// ── 后端权威：权限码字面量全集 + 各 proxy controller 的端点→码映射 ──────────────
const adminPermissionSource = await readFile(
  new URL(
    '../../titanium-admin/titanium-admin-common/src/main/java/com/titanium/admin/common/constant/AdminPermission.java',
    import.meta.url,
  ),
  'utf8',
)

/** 后端权限码全集（`String XXX = "x:y:z"` 的字面量） */
const BACKEND_PERMISSION_CODES = new Set(
  [...adminPermissionSource.matchAll(/String [A-Z_]+ = "([a-z][a-z0-9:-]+)"/g)].map((m) => m[1]),
)

const proxyControllerSource = (rel) =>
  readFile(
    new URL(
      `../../titanium-admin/titanium-admin-web/src/main/java/com/titanium/admin/web/controller/proxy/${rel}`,
      import.meta.url,
    ),
    'utf8',
  )

/**
 * 抽出某 controller 的「HTTP 方法 + 路径 → 权限码」映射。
 *
 * <p>逐行状态机而非正则：`@PreAuthorize` 与它标注的 `@XxxMapping` 相邻但**中间可能夹注释与
 * 其它注解**，且一个方法可能没有权限注解（内部端点）。行扫描能可靠地把注解绑定到紧随其后的
 * 映射上，正则跨行匹配则容易错配到相邻方法的码上——错配即假绿。</p>
 */
function endpointPermissions(source) {
  const byEndpoint = new Map()
  let pending = null
  for (const line of source.split('\n')) {
    if (line.includes('@PreAuthorize')) {
      const codeRef = /AdminPermission\.([A-Z_]+)/.exec(line)
      const literal = /"([a-z][a-z0-9:-]+)"/.exec(line)
      if (literal) {
        pending = literal[1]
      } else if (codeRef) {
        const value = new RegExp(`String ${codeRef[1]} = "([^"]+)"`).exec(adminPermissionSource)
        pending = value ? value[1] : null
      }
      continue
    }
    const mapping = /@(Get|Post|Put|Delete|Patch)Mapping(?:\("([^"]*)"\))?/.exec(line)
    if (mapping) {
      if (pending) {
        byEndpoint.set(`${mapping[1].toUpperCase()} ${mapping[2] ?? '/'}`, pending)
      }
      pending = null
    }
  }
  return byEndpoint
}

const claimEndpoints = endpointPermissions(await proxyControllerSource('claim/ClaimProxyController.java'))
const claimConfigEndpoints = endpointPermissions(await proxyControllerSource('claim/ClaimConfigProxyController.java'))
const underwritingEndpoints = endpointPermissions(
  await proxyControllerSource('underwriting/UnderwritingProxyController.java'),
)
const clauseEndpoints = endpointPermissions(await proxyControllerSource('clause/ClauseProxyController.java'))
const productEndpoints = endpointPermissions(await proxyControllerSource('product/ProductProxyController.java'))

test('① 前端用到的权限码必须真实存在于后端 AdminPermission（禁臆造、禁拼错）', () => {
  // 判定形状：小写冒号分段，正是权限码的形态
  const shape = /^[a-z][a-z0-9-]*(:[a-z0-9-]+)+$/
  const invented = []
  const checked = new Set()

  for (const [file, source] of [
    ['claim/config/ConfigPanel.vue', claimConfigPanelSource],
    ['claim/detail/index.vue', claimDetailCode],
    ['claim/list/index.vue', claimListCode],
    ['underwriting/detail/index.vue', underwritingDetailCode],
    ['clause/edit/index.vue', clauseEditCode],
    ['product/create/index.vue', productCreateCode],
    ['product/revise/index.vue', productReviseCode],
    ['product/template-config/index.vue', templateConfigCode],
  ]) {
    for (const m of source.matchAll(/['"]([a-z][a-z0-9-]*(?::[a-z0-9-]+)+)['"]/g)) {
      const code = m[1]
      if (!shape.test(code) || checked.has(code)) continue
      checked.add(code)
      if (!BACKEND_PERMISSION_CODES.has(code)) invented.push(`${code} (${file})`)
    }
  }

  assert.deepEqual(invented, [], '前端的权限码必须能在 AdminPermission 中找到，否则是必然失败的提交')
  assert.ok(checked.size >= 12, `本批次至少接线 12 个不同权限码，实得 ${checked.size}`)
  // 后端确有码表可依，防「两边都空」造成的假绿
  assert.ok(BACKEND_PERMISSION_CODES.size > 80, `后端权限码全集应远多于本次用到的，实得 ${BACKEND_PERMISSION_CODES.size}`)
  assert.ok(BACKEND_PERMISSION_CODES.has('claim:settle') && BACKEND_PERMISSION_CODES.has('product:config'))
})

test('② 理赔配置中心：整页 7 组配置同属一个后端权限码，写入口按该码收放', () => {
  // 后端无差别只给 CLAIM_CONFIG_EDIT（连 GET 也只给这一个码）——先钉死这个前提
  const codes = new Set([...claimConfigEndpoints.values()])
  assert.deepEqual([...codes], ['claim:config:edit'], '理赔配置全部端点共用 claim:config:edit，是单一码的前提')
  assert.equal(claimConfigEndpoints.size >= 30, true, `理赔配置端点应远多于本次列出的几条，实得 ${claimConfigEndpoints.size}`)

  // 页面按同一码收放：不新建、不编辑、不删除、不状态动作
  assert.match(claimConfigPanelCode, /const canEdit = computed\(\(\) => hasPermission\('claim:config:edit'\)\)/)
  assert.match(claimConfigPanelCode, /<el-button v-if="canEdit" type="primary" :icon="Plus" @click="openCreate">/)
  // 只读账号整列不渲染：留空表头会让人以为页面坏了
  assert.match(claimConfigPanelCode, /<el-table-column v-if="canEdit" label="操作"/)
})

test('③ 理赔详情：8 个状态机动作逐个按**其端点**的码收放，不得统一用一个码糊过去', () => {
  // 端点→码的权威映射（逐条断言，防后端改码而前端不知道）
  assert.equal(claimEndpoints.get('PUT /{id}/status'), 'claim:approve')
  assert.equal(claimEndpoints.get('POST /{id}/survey'), 'claim:survey')
  assert.equal(claimEndpoints.get('POST /{id}/loss-assessment'), 'claim:survey')
  assert.equal(claimEndpoints.get('POST /{id}/settlement'), 'claim:settle')
  assert.equal(claimEndpoints.get('POST /{id}/quick-pay'), 'claim:settle')
  assert.equal(claimEndpoints.get('POST /{id}/close'), 'claim:settle')
  assert.equal(claimEndpoints.get('POST /{id}/reject'), 'claim:approve')
  assert.equal(claimEndpoints.get('POST /'), 'claim:create')

  // 动作定义携带权限码，且逐键与该端点对齐
  assert.match(claimDetailCode, /permission: string/)
  assert.match(claimDetailCode, /\{ key: 'start', label: '立案', type: 'primary', permission: 'claim:approve' \}/)
  assert.match(claimDetailCode, /\{ key: 'approve', label: '核赔通过', type: 'success', permission: 'claim:approve' \}/)
  assert.match(claimDetailCode, /\{ key: 'quickPay', label: '快赔自动核赔', type: 'warning', permission: 'claim:settle' \}/)
  assert.match(claimDetailCode, /\{ key: 'settle', label: '核赔结算', type: 'success', permission: 'claim:settle' \}/)
  assert.match(claimDetailCode, /\{ key: 'close', label: '结案归档', type: 'info', permission: 'claim:settle' \}/)
  assert.match(claimDetailCode, /permission: 'claim:survey' \}/)
  assert.match(claimDetailCode, /permission: 'claim:approve' \}/)

  // 状态机筛选之上再叠一层权限筛选；无权限的动作不渲染（恒灰按钮说不出「为什么不能点」）
  assert.match(claimDetailCode, /const statusActions = computed<ClaimAction\[\]>\(\(\) => \{/)
  assert.match(
    claimDetailCode,
    /const currentActions = computed<ClaimAction\[\]>\(\(\) =>\s*\n\s*statusActions\.value\.filter\(\(action\) => hasPermission\(action\.permission\)\),?\s*\n\)/,
  )

  // 报案入口按 CLAIM_CREATE
  assert.match(claimListCode, /<el-button v-if="hasPermission\('claim:create'\)" type="primary" :icon="Plus" @click="dialogVisible = true">/)
})

test('④ 核保决策：整块表单（非仅按钮）按 underwriting:decide 收放', () => {
  assert.equal(underwritingEndpoints.get('PUT /{id}/decision'), 'underwriting:decide')
  // 判据必须与页签/区块是否渲染同一处：填完整张决策表才被 403 拒是最差的引导
  assert.match(
    underwritingDetailCode,
    /<template v-if="canDecide && hasPermission\('underwriting:decide'\)">/,
  )
})

test('⑤ 条款编辑：新建与编辑是两个端点两个码，按模式取码而非取并集', () => {
  assert.equal(clauseEndpoints.get('POST /'), 'clause:create')
  assert.equal(clauseEndpoints.get('PUT /{id}'), 'clause:edit')
  assert.equal(clauseEndpoints.get('POST /{clauseId}/coverages'), 'clause:edit')
  assert.equal(clauseEndpoints.get('DELETE /{clauseId}/coverages/{coverageId}'), 'clause:edit')

  // 一页两模（同源表单），保存按钮按 isEdit 取码
  assert.match(clauseEditCode, /v-if="hasPermission\(isEdit \? 'clause:edit' : 'clause:create'\)"/)
  // 责任增删恒为 clause:edit（后端两处都是该码），且已生效条款的只读仍由 :disabled 承担
  assert.equal([...clauseEditCode.matchAll(/v-if="hasPermission\('clause:edit'\)"/g)].length, 2)
  assert.match(clauseEditCode, /:disabled="!isEdit"/)
})

test('⑥ 产品侧：创建/修订/模板/寿险规格各按其端点取码', () => {
  assert.equal(productEndpoints.get('POST /'), 'product:create')
  assert.equal(productEndpoints.get('POST /{id}/revise'), 'product:edit')
  assert.equal(productEndpoints.get('POST /templates'), 'product:create')
  assert.equal(productEndpoints.get('PUT /templates/{templateId}'), 'product:edit')
  assert.equal(productEndpoints.get('POST /{id}/life-config'), 'product:config')

  // 创建向导一页两模：按 reviseFromId 分叉取码
  assert.match(
    productCreateCode,
    /v-if="currentStep === 4 && hasPermission\(reviseFromId \? 'product:edit' : 'product:create'\)"/,
  )
  // 模板对话框走 POST /templates ⇒ product:create
  assert.match(productCreateCode, /v-if="hasPermission\('product:create'\)"[\s\S]{0,120}?handleCreateTemplate/)
  // 独立修订页走 POST /{id}/revise ⇒ product:edit
  assert.match(productReviseCode, /v-if="hasPermission\('product:edit'\)"/)
})

test('⑦ 模板配置：一次保存分叉两个端点，两个码各管各的，不得取并集或交集', () => {
  assert.match(templateConfigCode, /const canEditTemplate = computed\(\(\) => hasPermission\('product:edit'\)\)/)
  assert.match(templateConfigCode, /const canConfigureLife = computed\(\(\) => hasPermission\('product:config'\)\)/)
  // 保存按钮取必经调用（updateTemplate）的码
  assert.match(templateConfigCode, /<el-button v-if="canEditTemplate" type="primary" :loading="saving" @click="handleSave">保存配置<\/el-button>/)
  // 寿险规格页签与那一次 life-config 调用取同一个码
  assert.match(templateConfigCode, /<el-tab-pane v-if="isLifeLine && canConfigureLife" label="保额管理\(寿险规格\)" name="lifeSpec">/)
  assert.match(
    templateConfigCode,
    /if \(isLifeLine\.value && canConfigureLife\.value && lifeSpecFilled\(\)\) \{/,
    'life-config 的调用条件必须含权限：页签不渲染时那些字段无从被改，发这一次请求只会 403',
  )
  // 🔴 校验分支必须与页签渲染用同一判据：页签不渲染时 lifeFormRef 为空，`?.` 短路返回 undefined，
  //    `!undefined` 为真 —— 不判权限会把「表单不存在」误读成「校验不通过」，保存静默不执行
  assert.match(templateConfigCode, /if \(canConfigureLife\.value && isLifeLine\.value && !\(await lifeFormRef\.value\?\.validate\(\)/)
})

test('⑧ 保全项访问规则：如实披露「可配置但无执行器」，禁止让运营误以为已受限', async () => {
  // 后端事实（本用例的判据来源）：accessRule 的生产读取点只有三类，均非鉴权
  const maintenanceFiles = [
    'titanium-maintenance-application/src/main/java/com/titanium/maintenance/application/orchestration/configuration/MaintenanceConfigurationValidator.java',
    'titanium-maintenance-domain/src/main/java/com/titanium/maintenance/configuration/MaintenanceItemConfigurationHasher.java',
    'titanium-maintenance-web/src/main/java/com/titanium/maintenance/web/mapper/MaintenanceConfigurationWebMapper.java',
  ]
  const sources = []
  for (const rel of maintenanceFiles) {
    sources.push(
      await readFile(new URL(`../../titanium-maintenance/${rel}`, import.meta.url), 'utf8'),
    )
  }
  // 三类读取点的特征签名：校验（收集码做存在性比对）、哈希、DTO 映射
  assert.match(sources[0], /PERMISSION_NOT_FOUND/)
  assert.match(sources[0], /SENSITIVE_FIELD_VIEW_PERMISSION/)
  assert.match(sources[1], /operationPermissionCodes", rule\.operationPermissionCodes\(\)\.stream\(\)\.sorted\(\)/)
  assert.match(sources[2], /controls\.accessRule\(\)\.operationPermissionCodes\(\)/)

  // 唯一真正生效的敏感字段查看权限走服务端硬编码常量，与配置值无关
  const caseQueryAccessResolver = await readFile(
    new URL(
      '../../titanium-maintenance/titanium-maintenance-web/src/main/java/com/titanium/maintenance/web/security/MaintenanceCaseQueryAccessResolver.java',
      import.meta.url,
    ),
    'utf8',
  )
  assert.match(caseQueryAccessResolver, /private static final String SENSITIVE_VIEW_PERMISSION = "maintenance:sensitive:view";/)

  // 前端必须披露这个事实（否则运营配完即误认为访问已受限，属合规口径下的静默失效）
  assert.match(maintenanceConfigEditorCode, /操作权限 \/ 查看权限当前仅登记，尚未参与鉴权/)
  assert.match(maintenanceConfigEditorCode, /案件受理、审核、执行与查询都不读取它们/)
  assert.match(maintenanceConfigEditorCode, /请勿据此认为访问已被限制/)
})

// ── ⑨⑩：全站权限码体检（round6 批次 3 续） ─────────────────────────────────────
//
// ①-⑧ 只覆盖本批次改动的 8 个文件。但「前端引用了一个后端不存在/不可授予的权限码」这类缺陷
// 与文件无关——全站体检实测：前端共引用 100 个码，其中 12 个（全部在 `router/dynamicRoutes.ts`
// 的 `meta.permission` 上）**既不在 `AdminPermission` 也不在库种子 `t_permission`**。
// 故 ⑨⑩ 把判据从「8 个文件」扩到「整个 src/」，并把「菜单权限到底靠什么生效」钉死。

/** 引号感知地切出 VALUES 里的各个 `(...)` 元组 */
function sqlTuples(body) {
  const out = []
  let depth = 0
  let cur = ''
  let inQuote = false
  for (const ch of body) {
    if (inQuote) {
      cur += ch
      if (ch === "'") inQuote = false
      continue
    }
    if (ch === "'") {
      inQuote = true
      cur += ch
      continue
    }
    if (ch === '(') {
      depth++
      if (depth === 1) cur = ''
      continue
    }
    if (ch === ')') {
      depth--
      if (depth === 0) out.push(cur)
      continue
    }
    if (depth > 0) cur += ch
  }
  return out
}

/** 引号感知地切分一个元组的字段，并去掉包裹引号；NULL 原样保留 */
function sqlFields(tuple) {
  const out = []
  let cur = ''
  let inQuote = false
  for (const ch of tuple) {
    if (ch === "'") inQuote = !inQuote
    if (ch === ',' && !inQuote) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim().replace(/^'|'$/g, ''))
}

/**
 * 把 `INSERT INTO `table` (cols) VALUES ...` 逐行解析成「列名 → 值」对象数组。
 *
 * <p>🔴 必须按**列清单**取值，不能对整行套正则：各批种子的列顺序并不一致
 * （`t_menu` 有 perm_code 在第 8 列、也有第 5 列的形态），行正则一旦写死顺序就静默漏行——
 * 实测漏到 `menuCodes` 只剩 0 条，而断言若只查总数并不会察觉。</p>
 */
function sqlRows(source, table) {
  const rows = []
  // 🔴 `\s*` 不可省：部分种子的列清单与 `VALUES` 之间换了行，写死 `) VALUES` 会**静默漏掉整条语句**。
  //    实测该疏漏使语料从 128 行缩到 87 行，两侧同步缩水后「对账干净」是假象。
  const re = new RegExp('INSERT INTO `' + table + '`\\s*\\(([^)]*)\\)\\s*VALUES', 'g')
  let m
  while ((m = re.exec(source))) {
    const cols = m[1].split(',').map((s) => s.replace(/[`\s]/g, ''))
    let body = ''
    let quotes = 0
    for (let i = re.lastIndex; i < source.length; i++) {
      const ch = source[i]
      body += ch
      if (ch === "'") quotes++
      if (ch === ';' && quotes % 2 === 0) break
    }
    for (const tuple of sqlTuples(body)) {
      rows.push(Object.fromEntries(cols.map((c, i) => [c, sqlFields(tuple)[i]])))
    }
  }
  return rows
}

/**
 * 抽 `INSERT INTO `t_permission` (...) VALUES ...` 里的 perm_code 全集。
 *
 * <p>为何要解析库种子而非只看 AdminPermission：**菜单/查看类权限码不经过 Java 常量**——
 * 它们由 `t_permission` 行授予角色，`MenuController` 再按角色持有的码过滤菜单
 * （`MenuApplicationService.getUserMenuTree` → `menuRepository.findByPermCodes`）。
 * 只看 Java 常量会把 `policy:application`、`system:dict` 这类**合法且正在生效**的码误判为臆造。</p>
 */
function seededPermissionCodes(sqlFiles) {
  const codes = new Set()
  for (const [, source] of sqlFiles) {
    for (const row of sqlRows(source, 't_permission')) {
      const value = row.perm_code
      if (value && value !== 'NULL') codes.add(value)
    }
  }
  return codes
}

/** 全站扫描配置：权限码**使用点**（不含路由 meta，那是 ⑨ 的管辖范围） */
const permissionUsageFiles = (
  await readdir(new URL('../src', import.meta.url), { recursive: true })
).filter((f) => /\.(vue|ts)$/.test(f) && !f.endsWith('router/dynamicRoutes.ts'))

const USAGE_LINE = /hasPermission\(|hasAllPermissions\(|v-permission=|permission: /
const CODE_LITERAL = /['"]([a-z][a-z0-9-]*(?::[a-z0-9-]+)+)['"]/g

test('⑨ 全站权限码引用必须可授予（Java 常量 ∪ 库种子 t_permission），路由 meta 除外', async () => {
  const dmlDir = new URL(
    '../../titanium-admin/titanium-admin-bootstrap/src/main/resources/liquibase/dml/',
    import.meta.url,
  )
  const dmlFiles = (await readdir(dmlDir)).filter((f) => f.endsWith('.sql'))
  const sqlFiles = []
  for (const f of dmlFiles) sqlFiles.push([f, await readFile(new URL(f, dmlDir), 'utf8')])

  const seeded = seededPermissionCodes(sqlFiles)
  assert.ok(seeded.size > 100, `库种子权限码应上百，实得 ${seeded.size}——种子解析失效会让本用例假绿`)
  // 反向锚点：库种子与 Java 常量**互有对方没有的码**，缺任一侧这层判据就不成立
  assert.ok(seeded.has('policy:application'), 'policy:application 走菜单授权，不在 Java 常量里')
  assert.ok(BACKEND_PERMISSION_CODES.has('claim:settle'), 'claim:settle 走端点授权，不在菜单种子里')
  const grantable = new Set([...BACKEND_PERMISSION_CODES, ...seeded])

  const offenders = []
  const checked = new Set()
  let scanned = 0
  for (const rel of permissionUsageFiles) {
    const lines = (await readFile(new URL(`../src/${rel}`, import.meta.url), 'utf8')).split('\n')
    lines.forEach((line, i) => {
      if (!USAGE_LINE.test(line)) return
      scanned++
      for (const m of line.matchAll(CODE_LITERAL)) {
        const code = m[1]
        if (checked.has(code)) continue
        checked.add(code)
        if (!grantable.has(code)) offenders.push(`${code} (src/${rel}:${i + 1})`)
      }
    })
  }

  assert.deepEqual(offenders, [], '前端引用的权限码必须可授予，否则该门要么恒真要么恒假')
  assert.ok(scanned >= 80, `全站权限使用点应远多于本批次 8 个文件，实得 ${scanned} 行`)
  assert.ok(checked.size >= 60, `全站应引用 60 个以上不同权限码，实得 ${checked.size}`)
})

test('⑩ 路由 meta.permission 的唯一消费点是路由门禁，注册策略与菜单权威不变', async () => {
  // 🔴 本用例原先锁的是「为什么那 12 个码今天无害」：`src/` 全仓**没有任何**地方读取
  //    `meta.permission`，路由全量注册、菜单可见性由**后端**决定，故它是一份**死元数据**——
  //    写错不影响任何行为，但也不提供任何保护；一旦被接进路由过滤，其中 7 个后端与种子
  //    都没有的码会让对应页面**对所有人永久不可见**。
  //
  // round6 批次 4 把两端都做了：先修码（详情页继承列表码、理赔配置中心一码到底），
  // 再把 meta.permission 接进 `router/index.ts` 的 beforeEach 做**整页级门禁**。
  // 「路由码 ↔ 菜单码 ↔ 可授性」的全量对账已移交 tests/route-permission-contracts.test.mjs
  // （那里以 t_permission 种子为权威，比此处按 AdminPermission 常量 + 手工豁免清单更严），
  // 本处只保留两条不重复的事实：**谁在消费它**、**注册策略没变**。
  const srcFiles = (await readdir(new URL('../src', import.meta.url), { recursive: true })).filter(
    (f) => /\.(vue|ts)$/.test(f),
  )
  const readers = []
  for (const rel of srcFiles) {
    // 🔴 比对前剥注释：403.vue / dynamicRoutes.ts 的说明性注释里刻意点了 meta.permission
    //    （讲清它是什么、为什么 dashboard 不设它），那不是消费点。口径与 D-04 的注释豁免一致：
    //    规则说的是「有人读它」，不是「有人提到它」。
    const text = stripComments(await readFile(new URL(`../src/${rel}`, import.meta.url), 'utf8'))
    if (/meta\??\.permission/.test(text)) readers.push(rel)
  }
  // 消费点必须**唯一**：多一处就会多一套页面可见性判据，与后端菜单树形成双源而互相漂移。
  assert.deepEqual(
    readers,
    ['router/index.ts'],
    `路由 meta.permission 的消费点应仅有 router/index.ts，实得：${readers.join(', ')}`,
  )

  // 静态注册的事实（而非按权限过滤后 addRoute）——门禁是「拦」，不是「不注册」：
  // 不注册会让 403 页无从判定该跳到哪，也无法向用户解释缺哪个码
  const routerIndex = await readFile(new URL('../src/router/index.ts', import.meta.url), 'utf8')
  assert.match(routerIndex, /routes: \[\.\.\.staticRoutes, \.\.\.dynamicRoutes\]/)
  assert.doesNotMatch(routerIndex, /filter\(.*permission/)

  // 菜单可见性的权威在后端：按角色持有的码过滤菜单，且目录会补齐父级
  const menuService = await readFile(
    new URL(
      '../../titanium-admin/titanium-admin-application/src/main/java/com/titanium/admin/application/command/system/MenuApplicationService.java',
      import.meta.url,
    ),
    'utf8',
  )
  assert.match(menuService, /permissionRepository\.findPermCodesByRoleIds\(roleIds\)/)
  assert.match(menuService, /menuRepository\.findByPermCodes\(permCodes\)/)
})

test('⑪ 角色配置界面可勾选但无任何执行器的权限码不得增加（与「保全项访问规则」同类缺陷）', async () => {
  // 缺陷形态：`t_menu`（按钮型 'F'）与 `t_permission` 共同构成角色配置界面的权限树，
  // 勾选即授予。但一个码要被**真正执行**，必须落到三处之一：
  //   ① 端点鉴权（`@PreAuthorize(hasAuthority(...))`，或 `MaintenanceConfigurationController`
  //      那样以本地常量传给 `contextResolver.require(request, SUBMIT)`）；
  //   ② 菜单可见性（`t_menu` 中 C/M 型的 perm_code——`MenuApplicationService.getUserMenuTree`
  //      按角色持有的码过滤菜单，勾了确实少一个菜单）；
  //   ③ 前端门（`hasPermission(...)` / `v-permission`，勾了确实少一个按钮）。
  // 三者皆无 ⇒ 运营在角色页勾上它，界面无变化、接口无拦截，**与 ⑧ 的 accessRule 是同一类
  // 「可配置但无执行器」**。⑧ 处置的是单个字段，本用例处置权限树整体。
  //
  // 🔴 判定方向刻意取**保守**：只要该码出现在任何「含权限判定标记」的 Java 文件里就算已执行。
  //    漏判（把死码算成活的）可接受，误判（把活码说成死的）会立刻摧毁用例可信度——I-01 的教训。
  const dmlDir = new URL(
    '../../titanium-admin/titanium-admin-bootstrap/src/main/resources/liquibase/dml/',
    import.meta.url,
  )
  const javaRoot = new URL('../../', import.meta.url)
  const javaFiles = (await readdir(javaRoot, { recursive: true }))
    .filter((f) => f.endsWith('.java') && !f.includes('target/') && !f.includes('/test/'))
  const ENFORCEMENT_MARKER = /hasAuthority|getAuthority|\.require\(|Permission|PERMISSION/
  const executed = new Set()
  for (const rel of javaFiles) {
    const source = await readFile(new URL(rel, javaRoot), 'utf8')
    if (!ENFORCEMENT_MARKER.test(source)) continue
    for (const m of source.matchAll(/"([a-z][a-z0-9-]*(?::[a-z0-9-]+)+)"/g)) executed.add(m[1])
  }
  assert.ok(executed.size > 90, `判定点里的权限字面量应上百，实得 ${executed.size}——扫描失效会让本用例假绿`)

  // 菜单可见性码（C=菜单 / M=目录）与可勾选码（按钮型 F + t_permission）
  const dmlFiles = (await readdir(dmlDir)).filter((x) => x.endsWith('.sql'))
  const sqlFiles = []
  for (const f of dmlFiles) sqlFiles.push([f, await readFile(new URL(f, dmlDir), 'utf8')])

  const menuCodes = new Set()
  const grantable = new Set()
  for (const [, source] of sqlFiles) {
    for (const row of sqlRows(source, 't_menu')) {
      const code = row.perm_code
      if (!code || code === 'NULL') continue
      grantable.add(code)
      // 🔴 判 `menu_type` 而非「行里有没有 F」：按钮型 'F' 只是可勾选，不产生菜单可见性，
      //    把它算作已执行会让本用例对「只登记不生效」的按钮权限整体失明。
      if (row.menu_type !== 'F') menuCodes.add(code)
    }
  }
  for (const code of seededPermissionCodes(sqlFiles)) grantable.add(code)
  assert.ok(grantable.size >= 120, `可勾选权限码应上百，实得 ${grantable.size}`)
  assert.ok(menuCodes.size >= 25, `菜单级权限码应不少于 25，实得 ${menuCodes.size}`)

  // 前端引用的码（与 ⑨ 同口径）
  const frontendCodes = new Set()
  for (const rel of permissionUsageFiles) {
    for (const line of (await readFile(new URL(`../src/${rel}`, import.meta.url), 'utf8')).split('\n')) {
      if (!USAGE_LINE.test(line)) continue
      for (const m of line.matchAll(CODE_LITERAL)) frontendCodes.add(m[1])
    }
  }
  assert.ok(frontendCodes.size >= 60, `前端引用码应不少于 60，实得 ${frontendCodes.size}`)

  const dead = [...grantable].filter(
    (c) => !executed.has(c) && !menuCodes.has(c) && !frontendCodes.has(c),
  )
  // 🔴 这是**当前实测的存量清单**，不是「应当如此」。它的价值在于：任何人新增一个
  //    「只在权限树里存在」的码，本用例立刻 RED，逼他补齐执行点或说明为何先登记。
  //    批次 3 实测：25 条候选中 5 条经复核确已执行（maintenance:config:submit/approve/publish/retire
  //    走 `contextResolver.require(request, SUBMIT)`，maintenance:sensitive:view 走
  //    `MaintenanceCaseQueryAccessResolver` 的硬编码常量），故清单为 20 条。
  //    2026-09-21 F3 批次：20 → 7。8 个 `*:view` 只读码改为 GET 端点双码放行
  //    （`hasAnyAuthority('x:list','x:view')`，32 个 GET 端点）；`product:export` 挂到既有的
  //    `/export` 端点 + 导出按钮；`system:role:delete` 新增 `DELETE /web/v1/roles/{id}`
  //    （内置角色与在绑定角色由应用服务拒绝）+ 角色页删除按钮；`customer:create`/`customer:edit`
  //    新增 BFF 写端点 + 客户新增/编辑抽屉；`system:dict:refresh` 挂到字典页「刷新缓存」按钮
  //    （清浏览器内字典缓存——admin 服务端无字典缓存，此点已在按钮注释中如实写明）。
  //    余下 7 条是**两侧都没有该能力**的码（6 个导出 + 客户删除）：下游无导出/删除端点，
  //    管理后台也无对应界面，故不补执行点，留给产品侧决策（要么下线该权限点，要么先建下游能力）。
  assert.deepEqual(
    dead.sort(),
    [
      'billing:export',
      'claim:export',
      'customer:delete',
      'customer:export',
      'maintenance:export',
      'policy:export',
      'underwriting:export',
    ],
    '可勾选但无执行器的权限码数量已变：变多说明新增了空权限（先补执行点），变少请同步缩短清单',
  )
})
