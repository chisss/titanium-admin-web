import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// 理赔配置「新建即静默覆盖」护栏契约（🔴 D-501-53）
// 形态说明：源码文本断言。该缺陷的现场是**跨层**的（前端「新建」→ HTTP 请求体无主键 → 后端按业务键
// upsert 命中既有行 → 静默改写别人的规则，行数不变、无提示）。后端护栏类单测锁不住「前端到底有没有
// 把主键发出去」与「有没有编辑入口」，此处补齐。
const panelSource = await readFile(
  new URL('../src/views/claim/config/ConfigPanel.vue', import.meta.url),
  'utf8',
)
const indexSource = await readFile(new URL('../src/views/claim/config/index.vue', import.meta.url), 'utf8')

test('配置面板存在独立的「编辑」入口，与「新建」分离', () => {
  // 改造前只有「新建」与「删除」，没有任何修改既有配置的入口 ——
  // 若只让后端拒绝业务键冲突，既有配置将永久无法修改（功能回归），故编辑入口是本缺陷的必要组成。
  assert.match(panelSource, /const openEdit = \(row: Record<string, unknown>\) =>/)
  assert.match(panelSource, /<el-button size="small" @click="openEdit\(row\)">编辑<\/el-button>/)

  // 弹窗标题区分两种语义，避免用户在编辑态误以为是新建
  assert.match(panelSource, /:title="`\$\{editingId \? '编辑' : '新建'\}\$\{title\}`"/)

  // 行级操作列宽度须容得下「编辑 + 删除 + 行级动作」
  // 🔴 ui-102 起改锁「意图」而非自算公式：原来断言 `Math.max(230, 180 + extraCount * 90)`，
  // 那是为「编辑 + 删除 + N 个行级动作」手算的 min-width；S-03 要求全站操作列宽度收敛到 5 档，
  // 自算宽度必须让位。
  // 🔴 R7-11（2026-09-21）起判据属性由 `min-width` 改为**数字 `width`**：EP 把「无数字 width」
  // 的列判为 flex 列（table-layout.mjs:96-107），操作列若当表内唯一 flex 列会吸走表格全部余宽
  // （核保工单实测 368px@1920 / 1008px@2560，列内按钮实需仅 128px）。故全站操作列一律声明
  // 数字 width，宽度由「同时可见的动作数」查档（真源 src/constants/table.ts）。
  // 本列最坏 3 个动作（编辑 + 删除 + 该面板唯一的行级动作「暂停」/「撤销」，均无图标 ⇒ 各 48px）
  // = 24 + 48×3 + 8×2 = 184px ⇒ 2 档 200px。阈值 160 是「不得窄于实需」的下限意图，保持不变。
  // 🔴 属性顺序不敏感：本轮给该列加了权限门 `v-if="canEdit"`（round6 批次 3），
  // 而原正则写死 `<el-table-column label="操作"` 会把 `v-if` 在前的情形判成「操作列不存在」——
  // 那是把**写法**当判据，不是把**意图**当判据。改按标签名锚定，其余断言一条不放松。
  const actionColumnTag = panelSource.match(/<el-table-column[^>]*\blabel="操作"[^>]*>/)?.[0]
  assert.ok(actionColumnTag, '配置面板应存在操作列')
  const actionColumnWidth = Number(actionColumnTag.match(/(?<![-\w])width="(\d+)"/)?.[1])
  assert.ok(
    actionColumnWidth >= 160,
    `操作列宽度须容得下「编辑 + 删除 + 行级动作」（实测 ${actionColumnWidth}px）`,
  )
  assert.match(actionColumnTag, /class-name="ti-action-column"/)
  // 🔴 收紧：整列受权限门控制。只读账号若看到空「操作」表头会以为页面坏了，
  // 详见 tests/permission-gate-contracts.test.mjs ②（该码的权威在后端 ClaimConfigProxyController）
  assert.match(actionColumnTag, /v-if="canEdit"/)
})

test('提交时按编辑态注入主键：编辑走更新分支，新建不带主键交给后端裁决', () => {
  // 后端 application 层按主键有无分流（templateId 空=新增雪花ID，非空=全量更新），
  // 主键不发出去则「编辑」退化成「新建」，护栏反而会拦住用户自己。
  assert.match(panelSource, /if \(editingId\.value\) payload\[props\.idKey\] = editingId\.value/)

  // 新建路径先做业务键占用校验，命中即拒绝并指向编辑入口
  assert.match(panelSource, /const findBusinessKeyConflict = \(\): Record<string, unknown> \| undefined =>/)
  assert.match(panelSource, /if \(!editingId\.value\) \{\s*\n\s*const conflict = findBusinessKeyConflict\(\)/)
  assert.match(panelSource, /该业务键已被配置「\$\{conflict\[props\.idKey\]\}」占用，请改用「编辑」修改既有配置/)

  // 占用判据口径须与后端一致：按 businessKeyFields 声明的字段逐项全等比较
  assert.match(panelSource, /keys\.every\(\(key\) => String\(row\[key\] \?\? ''\) === String\(form\[key\] \?\? ''\)\)/)

  // 保存提示区分「保存/更新」，让用户可自证走的是哪条分支
  assert.match(panelSource, /\$\{props\.title\}\$\{editingId\.value \? '更新' : '保存'\}成功/)
})

test('五组按业务键唯一的配置声明了与后端业务键一致的前置校验字段', () => {
  // 字段名与各 adapter 的 findByTenantIdAnd...(业务键) 一一对应，声明错则前端校验形同虚设
  assert.match(panelSource, /businessKeyFields\?: string\[\]/)
  assert.match(indexSource, /:business-key-fields="panel\.businessKeyFields"/)

  const expectations = [
    ["key: 'flow'", "businessKeyFields: \\['insuranceLine', 'claimType'\\]"],
    ["key: 'payout'", "businessKeyFields: \\['insuranceLine', 'claimType'\\]"],
    ["key: 'quickPay'", "businessKeyFields: \\['claimType'\\]"],
    ["key: 'document'", "businessKeyFields: \\['insuranceLine', 'claimType'\\]"],
    ["key: 'timeLimit'", "businessKeyFields: \\['insuranceLine', 'claimStage'\\]"],
  ]
  for (const [panelKey, fields] of expectations) {
    const start = indexSource.indexOf(panelKey)
    assert.notEqual(start, -1, `未找到面板 ${panelKey}`)
    // 面板声明以「下一个面板起始」为界，避免跨面板误配
    const rest = indexSource.slice(start)
    const end = rest.indexOf('\n    key: ', 1)
    const block = end === -1 ? rest : rest.slice(0, end)
    assert.match(block, new RegExp(fields), `面板 ${panelKey} 的业务键字段声明不符`)
  }

  // 医院网络/黑名单无业务键唯一约束，不得声明（否则会误拦合法的同名多行）
  const hospitalBlock = indexSource.slice(indexSource.indexOf("key: 'hospital'"))
  assert.doesNotMatch(hospitalBlock.slice(0, hospitalBlock.indexOf("key: 'blacklist'")), /businessKeyFields/)
})
