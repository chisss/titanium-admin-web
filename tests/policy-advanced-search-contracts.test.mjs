import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// 保单查询「高级搜索」日期区间的**跨仓键名对账**（🔴 R7-06）
//
// 形态说明：这是全仓首条**同时读两个仓**的契约测试（先例见 tests/liquibase-rows.mjs 读
// titanium-admin 的 Liquibase 种子）。之所以必须跨仓，是因为本类缺陷的机理就是
// 「两侧各写一半、任一侧漂移都无人发现」：
//
//   前端 fetch 展开出   effectiveDateStart/End、expiryDateStart/End
//   后端 Controller 声明 @RequestParam(value = "effectiveDateStart", …)
//
// 二者靠**字符串相等**耦合，中间没有任何编译期或运行期校验：后端对未声明的查询参数
// **静默忽略**（Spring 默认行为），于是键名一旦对不上，运行期观测到的是
// 「加了日期条件 → 条数不变 → 无任何报错、无 400、无日志」——与「这个条件下确实没有数据」
// 在界面上完全同形。修复前该缺陷还存在更深一层：后端连参数都没声明，
// 而读侧谓词（PolicyQueryServiceImpl#buildSpecification）早已就绪。
//
// 故本断言做**双向对账**而非「两边各自包含某清单」：从两个文件各抽一个集合、断言相等。
// 单侧改名 ⇒ 差集非空 ⇒ 红；两侧同时改名但改成不同名 ⇒ 同样红。
//
// 🔴 解析必须**抛错而非静默返回空集**（教训来源见 tests/liquibase-rows.mjs 的头部注释）：
// 源码形态一变、正则抽不到东西时，若放任空集，则「空集 == 空集」恒绿 ——
// 门禁还在跑、还在报通过，却已经不再检查任何东西。
const webFile = (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8')

/** 跨仓读取：本仓是 <root>/titanium-admin-web，保单域是同级目录 <root>/titanium-policy */
const policyFile = (rel) => readFile(new URL(`../../titanium-policy/${rel}`, import.meta.url), 'utf8')

/**
 * 剥掉注释，只留可执行代码。
 *
 * <p>🔴 源码文本断言的**头号陷阱**：被注释掉的键仍在文件里，正则照样命中 ⇒ 断言恒绿，
 * 而运行期该键并不存在。本仓已实测过一次（risk-level 契约：把 `HIGH_RISK: 'danger',`
 * 整行注释掉后用例依旧通过，因为命中的是注释里的文本）。
 * 故本文件抽键名 / 抽 value-format 一律在**剔注释后**的文本上进行。</p>
 *
 * <p>与 claim-settlement / field-level-permission / product-revise 等既有契约测试同款实现，
 * 不另创一套（同一判断多套实现 ⇒ 必漂移）。</p>
 */
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')

const listPage = stripComments(await webFile('src/views/policy/list/index.vue'))
const controller = stripComments(
  await policyFile(
    'titanium-policy-web/src/main/java/com/titanium/policy/web/controller/policy/PolicyController.java',
  ),
)

/** 日期区间键的判定：以 DateStart / DateEnd 结尾（两端共用同一判定，避免两份清单漂移） */
const DATE_RANGE_KEY = /^[A-Za-z]+Date(?:Start|End)$/

/** 抽后端 `pagePolicies`（BFF 实际调用的 /web/v1/policies/page）方法**签名**内声明的查询参数名 */
function declaredParamsOfPageEndpoint(source) {
  const start = source.indexOf('pagePolicies(')
  assert.ok(start >= 0, '未在 PolicyController 中找到 pagePolicies 方法 —— 方法名已变，请同步更新本断言')
  const end = source.indexOf(') {', start)
  assert.ok(end > start, '未能定位 pagePolicies 签名结尾 —— 源码形态已变，请同步更新本断言')
  const signature = source.slice(start, end)
  assert.ok(signature.length > 100, `pagePolicies 签名解析过短（${signature.length} 字符），疑似解析失败`)
  return {
    all: [...signature.matchAll(/@RequestParam\(value = "([^"]+)"/g)].map((m) => m[1]),
    dateTimeFormatted: (signature.match(/@DateTimeFormat\(iso = DateTimeFormat\.ISO\.DATE_TIME\)/g) ?? []).length,
    raw: signature,
  }
}

/** 抽前端 fetch 时把日期区间 ref 展开成的键名 */
function expandedDateKeysOfListPage(source) {
  const matches = [...source.matchAll(/(\w+Date(?:Start|End)): \w+Range\.value\[\d\]/g)]
  assert.equal(
    matches.length,
    4,
    `未能在 policy/list 中解析出 4 个日期区间键（实际 ${matches.length} 个）：` +
      '源码形态已变（展开写法被改写、或键被删/改名），请同步更新本断言的解析规则后重跑',
  )
  return matches.map((m) => m[1])
}

test('保单高级搜索：前端展开的日期键与后端声明的查询参数逐一对账', () => {
  const declared = declaredParamsOfPageEndpoint(controller)
  const declaredDateKeys = declared.all.filter((name) => DATE_RANGE_KEY.test(name)).sort()
  const frontKeys = [...new Set(expandedDateKeysOfListPage(listPage))].sort()

  // 先各自非空（防止「空集 == 空集」的恒绿），再对账
  assert.equal(declaredDateKeys.length, 4, `后端 pagePolicies 声明的日期区间参数应为 4 个，实际 ${declaredDateKeys.length} 个`)
  assert.deepEqual(
    frontKeys,
    declaredDateKeys,
    `前端展开的日期键与后端声明的查询参数不一致 —— 不一致的键会被后端**静默忽略**，` +
      `表现为「加了日期条件、条数不变、无任何报错」。\n前端: ${frontKeys.join(', ')}\n后端: ${declaredDateKeys.join(', ')}`,
  )
})

test('保单高级搜索：四个日期参数均按 ISO 日期时间解析（与前端 value-format 对齐）', () => {
  const declared = declaredParamsOfPageEndpoint(controller)

  // 前端 value-format 必须是**带时间部分**的 ISO 串：只给 YYYY-MM-DD 时后端 ISO.DATE_TIME 解析失败（400）
  const valueFormats = [...listPage.matchAll(/value-format="([^"]+)"/g)].map((m) => m[1])
  assert.equal(valueFormats.length, 2, `policy/list 应有 2 个日期区间选择器，实际解析到 ${valueFormats.length} 个 value-format`)
  for (const fmt of valueFormats) {
    assert.match(fmt, /^YYYY-MM-DDTHH:mm:ss$/, `日期区间 value-format 应为 YYYY-MM-DDTHH:mm:ss（当前 ${fmt}），否则后端 ISO.DATE_TIME 解析失败`)
  }

  // 后端：4 个日期参数各带一个 @DateTimeFormat，数量必须相等（少一个即该参数按默认格式解析、必 400）
  const dateParamCount = declared.all.filter((name) => DATE_RANGE_KEY.test(name)).length
  assert.equal(
    declared.dateTimeFormatted,
    dateParamCount,
    `后端日期参数 ${dateParamCount} 个，但带 @DateTimeFormat(ISO.DATE_TIME) 的只有 ${declared.dateTimeFormatted} 个`,
  )
})

test('保单高级搜索：高级区存在且重置会显式清空不挂 model 的日期区间', () => {
  // 日期区间是页面级 ref、不挂 model ⇒ TiSearchForm 的重置快照覆盖不到，
  // 若 @reset 不显式清空，会出现「表单看着已重置、结果仍是按日期过滤的」这一最迷惑的形态
  assert.match(listPage, /:has-advanced="true"/, 'search 区未开启高级搜索（:has-advanced）')
  assert.match(listPage, /<template #advanced>/, '高级搜索插槽缺失')
  assert.match(listPage, /@reset="handleResetAll"/, '重置未接到页面级处理器，日期区间不会被清空')

  const handler = listPage.slice(listPage.indexOf('const handleResetAll'))
  const body = handler.slice(0, handler.indexOf('\n}'))
  assert.match(body, /effectiveRange\.value = \[\]/, 'handleResetAll 未清空生效日期区间')
  assert.match(body, /expiryRange\.value = \[\]/, 'handleResetAll 未清空到期日期区间')

  // 🔴 顺序：清 ref 必须**先于** handleReset —— 后者内部会触发一次 fetch，
  // 先 fetch 再清等于用旧日期多查一次（用户会看到结果闪一下再变）
  assert.ok(
    body.indexOf('effectiveRange.value = []') < body.indexOf('handleReset()'),
    'handleResetAll 中清空区间 ref 必须在 handleReset() 之前，否则会用旧日期多查一次',
  )
})
