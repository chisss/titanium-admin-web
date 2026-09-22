import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// 保单生命周期操作门禁契约（round6 批次 1）
//
// 形态说明：本测试**行为断言为主 + 源码文本断言为辅**。门禁表（constants/policy.ts）是纯函数，
// 可以直接 import 后穷举「10 个动作 × 7 个状态」的全矩阵——这比文本断言强得多。
// 但**状态码本身**的正确性来自后端枚举，前端无从推导，故第一组用例直接读 Java 源文件比对，
// 从根上锁死「幻码」这类缺陷（前端曾写下 5 个后端从不产生的状态码）。
const { POLICY_ACTION_RULES, POLICY_STATUSES, checkPolicyAction } = await import('../src/constants/policy.ts')

const policyDetailSource = await readFile(
  new URL('../src/views/policy/detail/index.vue', import.meta.url),
  'utf8',
)

/**
 * 剥掉全部注释，只留可执行代码。
 *
 * <p>🔴 这一步不可省：本轮修复的**说明性注释里刻意引用了历史缺陷代码**
 * （如「此前判 `status === 'ACTIVE'`（幻码）」），全文匹配会把「记录缺陷」
 * 误判成「缺陷仍在」，测试随即变成假阳性告警。
 * 断言的对象应当是**代码**，不是文档。</p>
 */
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '') // 模板注释（跨行）
    .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释与 JSDoc（跨行）
    .replace(/^[ \t]*\/\/.*$/gm, '') // 整行行注释

const policyDetailCode = stripComments(policyDetailSource)
const businessTypesSource = await readFile(new URL('../src/types/business.d.ts', import.meta.url), 'utf8')
// 🔴 跨仓库路径：门禁的权威判据是**读侧**枚举（前端拿到的 status 来自查询投影），本测试直接读它
const policyReadSideEnumSource = await readFile(
  new URL('../../titanium-metadata/src/main/java/com/titanium/metadata/enums/policy/PolicyEnum.java', import.meta.url),
  'utf8',
)
// 写侧枚举与投影映射：用于断言「前端值域 = 读侧码」且桥接点存在
const policyStatusEnumSource = await readFile(
  new URL('../../titanium-policy/titanium-policy-common/src/main/java/com/titanium/policy/common/enums/PolicyStatusCode.java', import.meta.url),
  'utf8',
)
const policyProjectionSource = await readFile(
  new URL('../../titanium-policy/titanium-policy-query/src/main/java/com/titanium/policy/query/handler/projection/PolicyProjectionEventHandler.java', import.meta.url),
  'utf8',
)
const policyAggregateSource = await readFile(
  new URL('../../titanium-policy/titanium-policy-domain/src/main/java/com/titanium/policy/aggregate/Policy.java', import.meta.url),
  'utf8',
)

/** 从 Java 枚举源码中抽出全部 code 字面量：`NAME(1, "CODE", "中文")`（4 空格缩进的顶级枚举成员） */
const extractJavaEnumCodes = (source) =>
  [...source.matchAll(/^\s{4}[A-Z_]+\(\d+,\s*"([A-Z_]+)"/gm)].map((m) => m[1])

/**
 * 从 `PolicyEnum.java` 这类「外层类 + 多个内层枚举」的文件中，只抽指定内层枚举的成员码。
 *
 * <p>🔴 必须限定块范围：该文件同时定义 IntentStatus / ProposalStatus / PolicyStatus 等多个枚举，
 * 全文抽码会把`IntentStatus.CONFIRMED` 之类混进来。块边界取内层枚举的闭合花括号（4 空格缩进）。</p>
 */
const extractNestedEnumCodes = (source, enumName) => {
  const start = source.indexOf(`enum ${enumName} implements`)
  assert.notEqual(start, -1, `metadata 中应存在枚举 ${enumName}`)
  const rest = source.slice(start)
  const end = rest.indexOf('\n    }')
  const block = end === -1 ? rest : rest.slice(0, end)
  return [...block.matchAll(/^\s+[A-Z_]+\(\d+,\s*"([A-Z_]+)"/gm)].map((m) => m[1])
}

test('① 前端状态码集合与**读侧** PolicyEnum.PolicyStatus 逐一相等（门禁须与数据同源）', () => {
  // 🔴 判据口径：门禁消费的是查询接口返回的 `PolicyVO.status`，它来自读侧投影，故真源是
  //    读侧枚举。此前本用例的真源是**写侧** `PolicyStatusCode`，于是「前端码 == 写侧码」这个
  //    断言恒绿，而前端实际拿到的读侧码（PENDING_EFFECTIVE）被判成幻码 ⇒ 撤销保单永不可达。
  //    教训：**门禁的对象是数据，不是「看起来更权威的那个枚举」。**
  const readSideCodes = extractNestedEnumCodes(policyReadSideEnumSource, 'PolicyStatus')
  assert.equal(readSideCodes.length, 7, '读侧保单状态应为 7 个')
  assert.deepEqual(
    [...POLICY_STATUSES].sort(),
    [...readSideCodes].sort(),
    '前端 POLICY_STATUSES 必须与读侧 PolicyEnum.PolicyStatus 完全一致',
  )

  // 真幻码：两侧枚举都不产生
  for (const phantom of ['ACTIVE', 'PENDING', 'PENDING_PAYMENT', 'PROPOSAL']) {
    assert.ok(!readSideCodes.includes(phantom), `读侧不应存在幻码 ${phantom}`)
    assert.ok(!POLICY_STATUSES.includes(phantom), `前端不得再出现幻码 ${phantom}`)
  }

  // 写侧码不得进入前端值域（写侧 NOT_EFFECTIVE ↔ 读侧 PENDING_EFFECTIVE，非同一枚举）
  const writeSideCodes = extractJavaEnumCodes(policyStatusEnumSource)
  assert.equal(writeSideCodes.length, 7, '写侧保单状态应为 7 个')
  assert.ok(writeSideCodes.includes('NOT_EFFECTIVE'), '写侧 NOT_EFFECTIVE 是真实状态，必须存在')
  assert.ok(
    !POLICY_STATUSES.includes('NOT_EFFECTIVE'),
    '前端值域是读侧码，不得含写侧 NOT_EFFECTIVE（用它做门禁即「撤销保单」不可达的成因）',
  )

  // 两套枚举的桥接点在投影处理器：映射代码消失则前端读侧口径静默失效
  assert.ok(
    policyProjectionSource.includes('case NOT_EFFECTIVE -> PolicyEnum.PolicyStatus.PENDING_EFFECTIVE'),
    '写侧→读侧的状态映射（NOT_EFFECTIVE → PENDING_EFFECTIVE）必须存在',
  )
})

test('② types/business.d.ts 的 PolicyStatus 联合与 POLICY_STATUSES 一致', () => {
  // 类型域必须与实际值域一致；幻码在编译期是完全合法的字符串，类型检查对这类缺陷无感，
  // 故只能在测试里锁。
  const unionMatch = businessTypesSource.match(/export type PolicyStatus =([\s\S]*?)\n\n/)
  assert.ok(unionMatch, '应能取到 PolicyStatus 联合类型定义')
  const unionCodes = [...unionMatch[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])
  assert.deepEqual(unionCodes.sort(), [...POLICY_STATUSES].sort())
})

test('③ 门禁表覆盖全部 10 个动作，且状态白名单只含真实状态码', () => {
  const actions = Object.keys(POLICY_ACTION_RULES)
  assert.deepEqual(
    actions.sort(),
    ['annuityPay', 'annuityStart', 'cancel', 'dividend', 'endorsement', 'mature', 'resume', 'suspend', 'terminate', 'waive'],
    '详情页 el-dropdown 的十个 command 必须逐一有门禁条目',
  )
  for (const [action, rule] of Object.entries(POLICY_ACTION_RULES)) {
    for (const status of rule.statuses) {
      assert.ok(
        POLICY_STATUSES.includes(status),
        `${action} 的白名单含非真实状态码 ${status}（这正是 cancel 曾永不可达的成因）`,
      )
    }
    assert.ok(rule.reason.length > 0, `${action} 必须给出阻断原因文案（禁用项要能自我解释）`)
  }
})

test('④ 状态白名单与后端聚合根守卫逐条对齐', () => {
  // 每条断言都对应 Policy.java 中一处真实守卫，注释给出该守卫的错误文案原文
  const expectAllowed = (action, status, javaMessage) => {
    assert.ok(policyAggregateSource.includes(javaMessage), `后端守卫文案应存在：${javaMessage}`)
    assert.equal(
      checkPolicyAction(action, { status }).allowed,
      true,
      `${action} 在 ${status} 下应放行（后端守卫：${javaMessage}）`,
    )
  }
  const expectBlocked = (action, status) => {
    assert.equal(checkPolicyAction(action, { status }).allowed, false, `${action} 在 ${status} 下应阻断`)
  }

  // suspend：:336 `status != EFFECTIVE` → "Only EFFECTIVE policies can be suspended"
  expectAllowed('suspend', 'EFFECTIVE', 'Only EFFECTIVE policies can be suspended')
  for (const s of ['PENDING_EFFECTIVE', 'SUSPENDED', 'LAPSED', 'TERMINATED', 'EXPIRED', 'CANCELLED']) {
    expectBlocked('suspend', s)
  }

  // resume：:348 `status != SUSPENDED` → "Only SUSPENDED policies can be resumed"
  expectAllowed('resume', 'SUSPENDED', 'Only SUSPENDED policies can be resumed')
  for (const s of POLICY_STATUSES.filter((x) => x !== 'SUSPENDED')) expectBlocked('resume', s)

  // terminate：:387-388 三者之一
  for (const s of ['EFFECTIVE', 'SUSPENDED', 'LAPSED']) {
    expectAllowed('terminate', s, 'Only EFFECTIVE, SUSPENDED or LAPSED policies can be terminated')
  }
  for (const s of ['PENDING_EFFECTIVE', 'TERMINATED', 'EXPIRED', 'CANCELLED']) expectBlocked('terminate', s)

  // cancel：:607 `status != NOT_EFFECTIVE`（**写侧**守卫）→ "Only NOT_EFFECTIVE policies can be cancelled"
  // 🔴 参数用**读侧**码：写侧 NOT_EFFECTIVE 经投影映射为读侧 PENDING_EFFECTIVE，
  //    门禁消费的是读侧 status，故这里允许的状态是 PENDING_EFFECTIVE。
  expectAllowed('cancel', 'PENDING_EFFECTIVE', 'Only NOT_EFFECTIVE policies can be cancelled')
  for (const s of POLICY_STATUSES.filter((x) => x !== 'PENDING_EFFECTIVE')) expectBlocked('cancel', s)

  // endorse：:405 `status != EFFECTIVE` → "Only EFFECTIVE policies can be endorsed"
  expectAllowed('endorsement', 'EFFECTIVE', 'Only EFFECTIVE policies can be endorsed')
  for (const s of POLICY_STATUSES.filter((x) => x !== 'EFFECTIVE')) expectBlocked('endorsement', s)

  // waive：:1208 "仅生效保单可办理保费豁免"
  expectAllowed('waive', 'EFFECTIVE', '仅生效保单可办理保费豁免')
  for (const s of POLICY_STATUSES.filter((x) => x !== 'EFFECTIVE')) expectBlocked('waive', s)

  // annuityStart：:1091/:1094/:1097
  expectAllowed('annuityStart', 'EFFECTIVE', '仅生效保单可启动年金给付')
  assert.ok(policyAggregateSource.includes('非年金险种保单不可启动年金给付'))
  assert.ok(policyAggregateSource.includes('年金给付期已启动，不可重复启动'))
  for (const s of POLICY_STATUSES.filter((x) => x !== 'EFFECTIVE')) expectBlocked('annuityStart', s)

  // mature：:1153/:1158 "仅生效保单可满期给付" + 仅两全险
  expectAllowed('mature', 'EFFECTIVE', '仅生效保单可满期给付')
  assert.ok(policyAggregateSource.includes('仅两全险(ENDOWMENT)可满期给付满期金'))
  for (const s of POLICY_STATUSES.filter((x) => x !== 'EFFECTIVE')) expectBlocked('mature', s)

  // annuityPay：:1121 后端**不校验 status**，唯一前置是给付计划已启动
  assert.ok(policyAggregateSource.includes('年金给付期未启动，不可给付'))
  assert.deepEqual(POLICY_ACTION_RULES.annuityPay.statuses, [], '后端未设状态前置，前端不得凭空加')
})

test('⑤ 形态级判据：投连/万能险不得派发红利（PolicyForm.isInvestmentLinked）', () => {
  // :1244 `policyForm.isInvestmentLinked()` → 投连/万能被拒
  assert.ok(policyAggregateSource.includes('投连/万能险不适用红利派发'))
  for (const form of ['INVESTMENT_LINKED', 'UNIVERSAL']) {
    assert.equal(checkPolicyAction('dividend', { status: 'EFFECTIVE', policyForm: form }).allowed, false)
  }
  // 传统型生效保单可派发
  assert.equal(checkPolicyAction('dividend', { status: 'EFFECTIVE', policyForm: 'TRADITIONAL' }).allowed, true)
  // 🔴 形态缺失（存量数据 policyForm 为 null）时后端放行，前端不得擅自阻断——
  //    凭空收紧等于削减能力，且会让存量保单永远点不了这项
  assert.equal(checkPolicyAction('dividend', { status: 'EFFECTIVE', policyForm: null }).allowed, true)
  // 与后端 Java 的判据同源：只有这两个形态算投资连结
  assert.ok(policyAggregateSource.includes('this.policyForm != null && this.policyForm.isInvestmentLinked()'))
})

test('⑥ 保单未加载时全部阻断，且原因不得谎称是状态问题', () => {
  for (const action of Object.keys(POLICY_ACTION_RULES)) {
    for (const subject of [null, undefined, {}]) {
      const { allowed, reason } = checkPolicyAction(action, subject)
      assert.equal(allowed, false)
      assert.ok(reason.length > 0)
    }
  }
  assert.match(checkPolicyAction('suspend', null).reason, /加载中/)
})

test('⑦ 阻断原因须点明当前状态，供禁用项自我解释', () => {
  const { allowed, reason } = checkPolicyAction('terminate', { status: 'TERMINATED' })
  assert.equal(allowed, false)
  assert.match(reason, /TERMINATED/, '原因里要带当前状态，否则用户不知道卡在哪一步')
  assert.match(reason, /生效|暂停|失效/, '原因里要说清需要什么状态')
})

test('⑧ 详情页不再内联状态判断，幻码不得回归', () => {
  // 门禁的唯一真源是 constants/policy.ts；页面内联判断正是 ACTIVE / PENDING 幻码的温床
  assert.ok(policyDetailCode.includes("from '@/constants/policy'"))
  assert.ok(policyDetailCode.includes('checkPolicyAction(item.key, policy.value)'))
  assert.ok(policyDetailCode.includes('checkPolicyAction(cmd as PolicyActionKey, policy.value)'))

  // 🔴 幻码清单不含 PENDING_EFFECTIVE：它是**读侧**真实码（见测试①），此前被误列为幻码
  for (const phantom of ["'ACTIVE'", "'PENDING'", "'PROPOSAL'", "'PENDING_PAYMENT'"]) {
    assert.ok(
      !policyDetailCode.includes(phantom),
      `保单详情页不得再出现幻码 ${phantom}`,
    )
  }
  // 已删除的旧内联判据
  assert.ok(!policyDetailCode.includes('canCancel'), 'canCancel（两个幻码）应已被门禁表取代')
})

test('⑨ 菜单项全量渲染 + 按门禁禁用，而非逐项 v-if 隐藏', () => {
  // 依据项目设计契约：Disable commands that are invalid for the current lifecycle state
  // instead of relying on backend rejection。隐藏会让同一份菜单在不同状态下长相不一，
  // 用户无法建立状态机心智模型。
  assert.match(policyDetailCode, /v-for="item in actionMenu"/)
  assert.match(policyDetailCode, /:disabled="!item\.allowed"/)
  assert.ok(
    !/command="(suspend|resume|terminate|cancel|waive|dividend|annuityStart|annuityPay|mature|endorsement)"[\s\S]{0,120}v-if=/.test(
      policyDetailCode,
    ),
    '操作项不得再逐项 v-if 隐藏',
  )
})

test('⑩ 不可逆资金动作的金额录入必须带 inputValidator（防 NaN / 负数提交）', () => {
  // 🔴 原先三处 ElMessageBox.prompt 均无 inputValidator：空值 → Number('') = 0、
  //    非数字 → NaN、负数原样通过，全都直接发给后端，而这几个动作全不可逆。
  const promptCount = (policyDetailCode.match(/ElMessageBox\.prompt\(/g) ?? []).length
  assert.equal(promptCount, 1, '金额录入应收敛到唯一的 promptAmount 帮助函数')

  const helper = policyDetailCode.match(/const promptAmount = async[\s\S]*?\n\}/)
  assert.ok(helper, '应存在 promptAmount 帮助函数')
  assert.ok(helper[0].includes('inputValidator'), '金额录入必须带实时校验')
  assert.ok(helper[0].includes('Number.isFinite'), '必须拒绝 NaN')
  assert.ok(helper[0].includes('num <= 0'), '必须拒绝零与负数')

  // 三处资金动作都经该帮助函数，且取消时提前结束（不再走 .then 的未处理拒绝）
  for (const amountVar of ['dividendAmount', 'amountPerInstallment', 'maturityBenefit']) {
    assert.ok(
      policyDetailCode.includes(`const ${amountVar} = await promptAmount(`),
      `${amountVar} 必须经 promptAmount 录入`,
    )
    assert.ok(policyDetailCode.includes(`if (${amountVar} === null) break`), `${amountVar} 取消时应提前结束`)
  }
})

test('⑪ 确认框不得产生未处理的 Promise 拒绝', () => {
  // 🔴 原先把 ElMessageBox.confirm 直接 await 且无 catch：用户点「取消」即抛 'cancel'，
  //    无人接管 → 未处理拒绝，控制台报错而界面无反馈。
  const confirmCount = (policyDetailCode.match(/ElMessageBox\.confirm\(/g) ?? []).length
  assert.equal(confirmCount, 1, '确认框应收敛到唯一的 confirmAction 帮助函数')
  const helper = policyDetailCode.match(/const confirmAction = async[\s\S]*?\n\}/)
  assert.ok(helper, '应存在 confirmAction 帮助函数')
  assert.ok(helper[0].includes('catch'), 'confirmAction 必须吞掉 cancel/close 拒绝')
  assert.match(helper[0], /return false/)
})

test('⑫ 三个死占位 tab 中，有接口能力的两项必须接线', () => {
  // 理赔记录：getClaimList 早就接受 policyId 过滤，纯前端未接线
  assert.match(policyDetailCode, /getClaimList\(\{ policyId: policy\.value!\.policyId/)
  // 缴费记录：getPremiumSchedule(policyId) 已存在
  assert.match(policyDetailCode, /getPremiumSchedule\(policy\.value!\.policyId\)/)
  // 假空态文案不得残留（「暂无」与「查不到」必须可区分）
  assert.ok(!policyDetailCode.includes('description="暂无理赔记录"'))
  assert.ok(!policyDetailCode.includes('description="暂无缴费记录"'))
  assert.ok(!policyDetailCode.includes('description="暂无操作日志"'))
  // 操作日志 tab 无 policyId 查询能力，须说明原因并给出出口，而不是裸空态
  assert.ok(policyDetailCode.includes('/system/log'))
})
