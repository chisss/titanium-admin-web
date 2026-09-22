import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// 核赔结算对话框契约（round6 批次 2）
//
// 缺陷背景：理赔详情页「核赔结算」对话框给了一个**自由输入**的赔付金额框，旁边一句静态提示
// 「本案件已定损，核定赔付金额须等于定损核定额 xxx，不得人工调整」。提示归提示，输入框照样能改——
// 而后端 `Claim.resolveSettledAmount` 对定损在案的案件**拒绝**任何与定损核定额不等的入参
// （`ClaimSettlementAmountException.mismatch`）。于是操作员把金额改一下，就等于给自己安排了一次
// 必然失败的提交，且错误要到点「确认结算」之后才出现。
//
// 同一对话框的「收款账户」被标为「（可选）」，四种给付方式下都显示——而现金/支票/冲抵保费
// 根本没有「账户」语义，摆在那里只会让用户犹豫要不要填。
//
// 形态说明：**后端源码比对 + 页面接线断言**。金额与收款方的权威都在 claim 域与 payment 域的
// 真实源码里，故先读后端把判据钉死，再断言页面按同一判据接线——避免把「看起来合理的 UI」当成正确。
const viewSource = await readFile(
  new URL('../src/views/claim/detail/index.vue', import.meta.url),
  'utf8',
)

/** 剥掉注释，只留可执行代码（说明性注释里刻意引用了历史缺陷，全文匹配会假阳性） */
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')

const viewCode = stripComments(viewSource)

// 🔴 跨仓库读取：金额权威在 claim 聚合，收款方语义在 claim 枚举与 payment 入站契约
const claimAggregateSource = await readFile(
  new URL(
    '../../titanium-claim/titanium-claim-domain/src/main/java/com/titanium/claim/aggregate/Claim.java',
    import.meta.url,
  ),
  'utf8',
)
const quickPaySource = await readFile(
  new URL(
    '../../titanium-claim/titanium-claim-application/src/main/java/com/titanium/claim/application/orchestration/assessment/QuickPayOrchestrator.java',
    import.meta.url,
  ),
  'utf8',
)
const settlementVOSource = await readFile(
  new URL(
    '../../titanium-claim/titanium-claim-domain/src/main/java/com/titanium/claim/valueobject/ClaimSettlement.java',
    import.meta.url,
  ),
  'utf8',
)
const claimEnumSource = await readFile(
  new URL('../../titanium-metadata/src/main/java/com/titanium/metadata/enums/claim/ClaimEnum.java', import.meta.url),
  'utf8',
)
const payoutMessageSource = await readFile(
  new URL(
    '../../titanium-payment/titanium-payment-infrastructure/src/main/java/com/titanium/payment/infrastructure/messaging/inbound/ClaimPayoutInstructionMessage.java',
    import.meta.url,
  ),
  'utf8',
)

test('① 后端金额判据：定损在案时与核定额不等即拒，未定损时调用方必传', () => {
  // 未定损：调用方不传即拒（`ClaimSettlementAmountException.required`）
  assert.match(claimAggregateSource, /if \(lossAssessment == null\) \{\s*\n\s*if \(providedAmount == null\) \{\s*\n\s*throw ClaimSettlementAmountException\.required\(claimId\);/)
  // 定损在案：金额权威是定损核定额，传入非等值即拒——这是本次「锁死输入」的依据
  assert.match(claimAggregateSource, /BigDecimal assessedAmount = lossAssessment\.payableAmount\(\);/)
  assert.match(
    claimAggregateSource,
    /if \(providedAmount != null && providedAmount\.compareTo\(assessedAmount\) != 0\) \{\s*\n\s*throw ClaimSettlementAmountException\.mismatch\(claimId, assessedAmount, providedAmount\);/,
    '与定损核定额不等必须拒绝，而非静默采信核定额',
  )
  // 结算是金额的最后一道闸口：责任比例量纲越界即拒，绝不放行不可信的核定金额
  assert.match(claimAggregateSource, /if \(LossAssessment\.isOutOfDecimalScale\(lossAssessment\.liabilityRatio\(\)\)\)/)
  // 金额本身还须大于 0
  assert.match(settlementVOSource, /settledAmount == null \|\| settledAmount\.compareTo\(BigDecimal\.ZERO\) <= 0/)

  // 🔴 快赔自动通道的既有判据：有定损则**不传金额**（交聚合以核定额裁决），无定损才传申报金额
  assert.match(
    quickPaySource,
    /return view\.getAssessedPayableAmount\(\) == null \? view\.getClaimAmount\(\) : null;/,
    '有定损核定额时不传金额，是「金额权威在聚合」的直接体现',
  )
})

test('② 页面按同一判据接线：有定损核定额即锁死赔付金额输入', () => {
  assert.match(
    viewCode,
    /const settledAmountLocked = computed\(\(\) => claim\.value\?\.assessedPayableAmount != null\)/,
  )
  // 锁的是输入框本身，不是只加一句提示——提示拦不住手
  assert.match(viewCode, /:disabled="settledAmountLocked"/)
  // 两种情形各有说明，且都点出「为什么」与「怎么改」
  assert.match(viewCode, /已按定损核定额锁定，不可调整/)
  assert.match(viewCode, /如需变更金额，请先修正定损/)
  assert.match(viewCode, /本案件无定损核定结果，赔付金额由核赔人判定，必须大于 0/)
  // 打开对话框时按核定额预填（未定损回退申报金额），与后端 resolveProvidedAmount 同序
  assert.match(
    viewCode,
    /settleForm\.settledAmount = claim\.value\?\.assessedPayableAmount \?\? claim\.value\?\.claimAmount \?\? 0/,
  )
  // 上一次打开留下的值必须清空：静默带入会把上一个案子的收款账户挂到本案件的赔付凭证上
  assert.match(viewCode, /settleForm\.payeeAccount = ''\s*\n\s*settleForm\.conclusion = ''\s*\n\s*settleForm\.payoutMethod = ''/)
})

test('③ 收款账户只在银行转账下出现——它是四种给付方式里唯一有账户语义的', () => {
  // 后端枚举是判据来源，不是前端自定的名单
  const methods = [...claimEnumSource.matchAll(/^\s{8}([A-Z_]+)\(\d+, "([A-Z_]+)", "([^"]+)"\)/gm)]
    .filter((m) => ['BANK_TRANSFER', 'CASH', 'CHECK', 'OFFSET_PREMIUM'].includes(m[2]))
    .map((m) => ({ code: m[2], name: m[3] }))
  assert.deepEqual(
    methods.map((m) => m.code),
    ['BANK_TRANSFER', 'CASH', 'CHECK', 'OFFSET_PREMIUM'],
    'PayoutMethod 的取值集合是判据基础，变更须同步本用例与页面判据',
  )
  // 页面以 BANK_TRANSFER 为唯一「需要收款账户」的方式
  assert.match(viewCode, /const needsPayeeAccount = computed\(\(\) => settleForm\.payoutMethod === 'BANK_TRANSFER'\)/)
  assert.match(viewCode, /v-if="needsPayeeAccount"/)
  assert.match(viewCode, /@change="onPayoutMethodChange"/)
  // 切到无账户的方式即清空已填账户，避免「现金赔付」的支付单带着一个银行账户
  assert.match(viewCode, /const onPayoutMethodChange = \(\) => \{\s*\n\s*if \(!needsPayeeAccount\.value\) settleForm\.payeeAccount = ''/)
})

test('④ 收款账户**不得**设为必填：后端对四种方式都不强制，快赔即以银行转账 + 空收款方结算', () => {
  // 「空收款方」是后端接受的正常状态，分账给付（身故/全残）正是靠它触发按份额分账
  assert.match(
    payoutMessageSource,
    /payeeAccount\s+收款账户（按受益人分账给付时为空，由支付域按份额分账）/,
    '空收款方是契约内的合法取值，前端若设为必填即「拦住后端本可接受的输入」',
  )
  assert.match(
    quickPaySource,
    /ClaimEnum\.PayoutMethod\.BANK_TRANSFER, null, ClaimConstants\.QUICK_PAY_CONCLUSION/,
    '快赔自动通道以银行转账 + 空收款方结算，构成「不得必填」的反例',
  )
  // 结算规则里不得出现 payeeAccount 的必填项
  const settleRules = viewCode.slice(
    viewCode.indexOf('const settleRules: FormRules = {'),
    viewCode.indexOf('}', viewCode.indexOf('const settleRules: FormRules = {')),
  )
  assert.doesNotMatch(settleRules, /payeeAccount/, '收款账户不进校验规则（后端无此要求）')
  // 但必须如实说明留空的后果，而不是含糊的「可选」
  assert.match(viewCode, /留空时赔付指令不携带收款方，出款前需另行补录/)
})

test('⑤ 空串不等于「有收款方」：提交前归一，且无账户语义的方式不带该字段', () => {
  assert.match(viewCode, /payeeAccount: needsPayeeAccount\.value \? settleForm\.payeeAccount\.trim\(\) \|\| undefined : undefined,/)
  // 与上一版「原样透传 reactive 对象」的对比：空串会被后端反序列化成 ""，使支付单记下
  // 一个「字段存在但内容为空」的收款账户，与分账给付的 null 在数据上无法区分
  assert.doesNotMatch(viewCode, /settleClaim\(claimId, \{ \.\.\.settleForm \}\)/)
})
