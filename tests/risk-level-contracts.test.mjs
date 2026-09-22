import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// 标的风险等级（riskLevel）契约（🔴 R7-20）
//
// 缺陷现场：`riskLevel` 的四个值在后端 `t_dict_data` 中**无对应字典**，前端只能在代码里
// 承载文案。于是同一个四值映射在核保列表页与详情页各写了一份**逐字相同**的内联副本，
// 而保单详情页干脆不写、直接丢给 `TiStatusTag` 的全局兜底表 —— 那张表里 `STANDARD`
// 的文案是「标准承保」，属**核保结论**（`UnderwritingStatus`）；而这里渲染的是标的
// **风险等级**（`RiskLevel`），正确文案是「标准体」。
//
// 后果不是「裸显英文码」那么轻：`STANDARD` 会**静默显示成「标准承保」** —— 一句看起来
// 合理、实则说错的话，且不触发任何告警（另三码不在兜底表内，会 console.warn）。
// 于是出现最坏组合：三个值报错、一个值说错话。
//
// 本文件钉三件事：① 前端文案表与后端枚举逐条对账；② 四值文案只得有一处定义；
// ③ 凡渲染 `riskLevel` 的 `TiStatusTag` 必须显式传 `:label`。

const { RISK_LEVEL_TEXT, riskLevelLabel } = await import('../src/constants/underwriting.ts')

const UNDERWRITING_ENUM = fileURLToPath(
  new URL(
    '../../titanium-metadata/src/main/java/com/titanium/metadata/enums/underwriting/UnderwritingEnum.java',
    import.meta.url,
  ),
)

/**
 * 剔除块注释与行注释。
 *
 * <p>🔴 **源码扫描型断言必须先过这一步**，否则「注释掉的代码」仍会被当作「存在」，
 * 断言退化成恒绿。本条是反向对照的实证：把 `TiStatusTag` 里的 `HIGH_RISK: 'danger',`
 * 整行注释成 `/* HIGH_RISK: 'danger', *​/` 后，用例⑤**依旧通过** —— 正则命中的是注释里的文本。</p>
 *
 * <p>不做字符串字面量感知：本文件待扫描的片段（颜色表、枚举常量、文案表）不含形如 `//`
 * 的字符串，误伤风险为零。若将来扫描对象含 URL，需先补字符串感知再复用。</p>
 *
 * <p>🔴 **扫 .vue 时必须连 HTML 注释一起剥**：模板注释是 `<!-- -->` 而非 `//`。只剥 JS 注释时，
 * 被 `<!-- -->` 包起来的 `<TiStatusTag :value="…riskLevel" />` 照样会被扫到 —— ③ 的覆盖量下限
 * （callSites >= 1）于是恒绿：**唯一的调用点整行注释掉，守卫仍报「口径正常」**。
 * 本仓其余 10 份扫 .vue 的契约文件都已剥 HTML 注释，此处对齐。</p>
 */
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')

/**
 * 取指定嵌套枚举的**块内文本**（花括号配平，不按缩进猜边界）。
 *
 * <p>🔴 必须先切块再解析常量：该文件有 8 个嵌套枚举，其中多行常量的缩进完全一致，
 * 全文正则会静默把别的枚举的码混进来（`UnderwritingStatus` 里同样有 `STANDARD`）。
 * 而按 `^    }` 找块尾也不可靠 —— 块内还有构造器与 `if` 语句（如
 * `return this == DECLINED || this == REJECTED;`），缩进并非只有常量一种。</p>
 */
function enumBlock(source, enumName) {
  const marker = `public enum ${enumName} implements BaseEnum`
  const at = source.indexOf(marker)
  assert.notEqual(at, -1, `未在 UnderwritingEnum.java 中找到 ${enumName}`)
  const open = source.indexOf('{', at)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return assert.fail(`${enumName} 块未闭合`)
}

/** 取 `RiskLevel` 的「落库码 → 枚举自带中文 name」映射 */
function riskLevelDeclared(source) {
  const declared = new Map()
  // 常量形态：`STANDARD(1, "STANDARD", "标准体"),`
  // 构造器 `RiskLevel(Integer enumCode, String code, String name)` 首参不是数字，不会误匹配
  for (const m of enumBlock(stripComments(source), 'RiskLevel').matchAll(
    /([A-Z][A-Z0-9_]*)\(\s*\d+\s*,\s*"([A-Za-z0-9_-]+)"\s*,\s*"([^"]+)"\s*\)/g,
  )) {
    declared.set(m[2], m[3])
  }
  assert.ok(declared.size >= 4, `RiskLevel 只解析到 ${declared.size} 个常量，解析器需同步`)
  return declared
}

/** 花括号配平地取 `export const NAME … = { … }` 的对象体（不按 `}` 直接切，对象可嵌套） */
function objectLiteral(source, name) {
  const at = source.indexOf(name)
  assert.notEqual(at, -1, `未找到 ${name}`)
  const open = source.indexOf('{', at)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return assert.fail(`${name} 对象体未闭合`)
}

/** 递归收集目录下的 .vue / .ts 源文件 */
async function collectSources(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir)
    if (entry.isDirectory()) files.push(...(await collectSources(full)))
    else if (entry.name.endsWith('.vue') || entry.name.endsWith('.ts')) files.push(full)
  }
  return files
}

/**
 * 引号感知地取出每个 `<TiStatusTag …>` 开标签。
 * 不按 `>` 直接切 —— 属性值里可能出现 `>`（如内联比较表达式）。
 */
function tiStatusTags(source) {
  const tags = []
  let cursor = 0
  for (;;) {
    const start = source.indexOf('<TiStatusTag', cursor)
    if (start === -1) break
    let quote = null
    let end = -1
    for (let i = start; i < source.length; i += 1) {
      const c = source[i]
      if (quote) {
        if (c === quote) quote = null
        continue
      }
      if (c === '"' || c === "'") quote = c
      else if (c === '>') { end = i; break }
    }
    assert.notEqual(end, -1, `<TiStatusTag> 开标签未闭合（偏移 ${start}）`)
    tags.push(source.slice(start, end))
    cursor = end
  }
  return tags
}

const relOf = (file) => file.pathname.replace(/^.*\/src\//, 'src/')

test('① RISK_LEVEL_TEXT 与后端 UnderwritingEnum.RiskLevel 逐条一致（两处真源不得漂移）', async () => {
  const declared = riskLevelDeclared(await readFile(UNDERWRITING_ENUM, 'utf8'))

  // 比的是**两处独立真源**：后端枚举（业务语义权威）与前端文案表（界面唯一真源）。
  // 不写「计数相等」断言：计数相等恰好掩盖「一侧多一个、另一侧少一个」；也不内联第三份
  // 期望清单 —— 三份清单必然漂移，坏的那份一旦参与比对就再也对不上真源。
  assert.deepEqual(
    Object.keys(RISK_LEVEL_TEXT).sort(),
    [...declared.keys()].sort(),
    '前端 RISK_LEVEL_TEXT 的键与后端 RiskLevel 枚举值域不一致',
  )

  // 🔴 文案逐字取自后端枚举自带的中文 name，不另行措辞：
  // 改措辞（如「高风险体」→「高风险」）看似无害，实则让枚举 name 失去权威性 ——
  // 后端日志/报表用 name，前端界面用另一套词，运营两边对不上账。
  for (const [code, name] of declared) {
    assert.equal(
      RISK_LEVEL_TEXT[code],
      name,
      `${code} 的文案须逐字取自后端枚举 name「${name}」`,
    )
  }
})

test('② riskLevelLabel：命中给中文、未收录原样返回、空值给 -', () => {
  assert.equal(riskLevelLabel('STANDARD'), '标准体')
  assert.equal(riskLevelLabel('SUB_STANDARD'), '次标准体')
  assert.equal(riskLevelLabel('HIGH_RISK'), '高风险体')
  assert.equal(riskLevelLabel('UNINSURABLE'), '不可保体')

  // 未收录的码原样返回，不吞成通用兜底：后端枚举若新增值，界面显示新码比显示「未知」
  // 更利于定位（「未知」会让人以为是自己看错了，新码能直接搜到）
  assert.equal(riskLevelLabel('SOME_NEW_CODE'), 'SOME_NEW_CODE')

  // 空值口径与全站一致
  assert.equal(riskLevelLabel(undefined), '-')
  assert.equal(riskLevelLabel(null), '-')
  assert.equal(riskLevelLabel(''), '-')
})

test('③ 凡渲染 riskLevel 的 TiStatusTag 必须显式传 :label（该码在全局兜底表里会说错话）', async () => {
  const views = (await collectSources(new URL('../src/views/', import.meta.url)))
    .filter((file) => file.pathname.endsWith('.vue'))

  const missing = []
  let callSites = 0

  for (const file of views) {
    // 🔴 必须先剥注释（含 HTML 注释，见 stripComments 的说明）：原实现直接扫原文，
    //    把调用点整行 `<!-- -->` 注释掉时 tiStatusTags 仍会扫到它，callSites 不降 ⇒ 下限恒绿。
    const source = stripComments(await readFile(file, 'utf8'))
    for (const tag of tiStatusTags(source)) {
      // 只认「本标签渲染的是风险等级」的调用点（:value 引用了 riskLevel）
      if (!/:value="[^"]*riskLevel[^"]*"/.test(tag)) continue
      callSites += 1
      if (!/:label\s*=/.test(tag)) missing.push(relOf(file))
    }
  }

  // 覆盖量下限：调用点归零说明扫描口径失效（测空集恒真）
  assert.ok(callSites >= 1, '未扫描到任何渲染 riskLevel 的 TiStatusTag，口径疑似失效')
  assert.deepEqual(
    missing,
    [],
    `以下调用点未传 :label —— STANDARD 会静默显示成「标准承保」：\n  ${missing.join('\n  ')}`,
  )

  // 🔴 为何不能靠 TiStatusTag 的兜底表兜住：那张表里 STANDARD =「标准承保」，属核保**结论**。
  // 风险等级与核保结论是两个不同的枚举（UnderwritingEnum.RiskLevel / UnderwritingStatus），
  // 恰好共用了 STANDARD 这个码 —— 兜底表按码取文案，无从分辨调用点要的是哪一个。
  // 故此处只能由调用点显式指定，这也是 TiStatusTag 注释里「语义确有分野的码由调用方传 label」的适用场景。
})

test('④ 风险等级的四值文案只得有一处定义（此前列表页与详情页各写一份逐字相同的副本）', async () => {
  const sources = await collectSources(new URL('../src/', import.meta.url))

  // 判据：一个文件里同时出现首值与末值的中文字面量，即它自己定义了一份四值映射。
  // 用「同时出现两个」而非只认某个变量名：副本可以叫任何名字，但四个值的字面量躲不掉。
  const defining = []
  for (const file of sources) {
    const source = stripComments(await readFile(file, 'utf8'))
    if (source.includes("'标准体'") && source.includes("'不可保体'")) defining.push(relOf(file))
  }

  assert.deepEqual(
    defining,
    ['src/constants/underwriting.ts'],
    '风险等级文案出现了第二处定义 —— 两处清单必然漂移，请改引 src/constants/underwriting.ts',
  )
})

test('⑤ 风险等级四值在 TiStatusTag 全局表内都有语义色（此前三值全落 info 灰）', async () => {
  const source = await readFile(
    new URL('../src/components/TiStatusTag/index.vue', import.meta.url),
    'utf8',
  )
  // 解析成**键集合**而非对原文做正则：注释掉的 `HIGH_RISK: 'danger',` 同样能被正则命中，
  // 断言就恒绿了（反向对照已实证）。剔注释 + 收键集合才能让「删/注释掉某一色」真的变红。
  const keys = new Set(
    [...stripComments(objectLiteral(source, 'const COLOR_MAP')).matchAll(
      /(?:^|\n)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g,
    )].map((m) => m[1]),
  )
  assert.ok(keys.size >= 30, `COLOR_MAP 只解析到 ${keys.size} 个键，解析器需同步`)

  for (const code of Object.keys(RISK_LEVEL_TEXT)) {
    assert.ok(
      keys.has(code),
      `${code} 在 TiStatusTag 的 COLOR_MAP 中无语义色，将落 info 灰 —— 风险等级列等于没有颜色`,
    )
  }

  // 只钉颜色不钉文案：本组文案**有意**不进 STATUS_TEXT（同枚举整组统一处理，避免出现
  // 「三个值漏传 label 时告警、STANDARD 静默说错话」的最坏组合）。文案的正确性由 ③ 保证。
})
