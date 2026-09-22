#!/usr/bin/env node
/**
 * ui-guard.mjs —— 后台前端设计系统机械守卫
 *
 * 设计意图：把「风格一致性」从**靠人记住**变成**靠脚本拦住**。
 *
 * 用法：
 *   node scripts/ui-guard.mjs              # 报告全部规则，按 config 的 target 判定，有 FAIL 即 exit 1
 *   node scripts/ui-guard.mjs --rule=D-04  # 只校验一条规则（harness 任务的 validation.command 用这个）
 *   node scripts/ui-guard.mjs --list       # 列出规则与当前实测值
 *   node scripts/ui-guard.mjs --json       # 机器可读输出
 *
 * 逃生舱：任何一行含 `ui-guard-ignore` 注释即被跳过，异常因此是**显式且可审计**的，
 * 而不是把阈值悄悄放宽。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const IGNORE_MARK = 'ui-guard-ignore'

// ─────────────────────────── 文件收集 ───────────────────────────

/** 递归收集源码文件，剔除 node_modules/dist/coverage */
function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'coverage' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, exts, out)
    else if (exts.includes(extname(name))) out.push(full)
  }
  return out
}

/** 读文件并按行剔除含逃生标记的行 */
function readLines(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => !l.includes(IGNORE_MARK))
}

/** 缓存：一次运行内不重复读盘 */
const _cache = new Map()
function lines(file) {
  if (!_cache.has(file)) _cache.set(file, readLines(file))
  return _cache.get(file)
}

const VUE = () => walk(SRC, ['.vue'])
const VUE_SCSS = () => walk(SRC, ['.vue', '.scss'])
const ALL_TS = () => walk(SRC, ['.vue', '.ts', '.scss'])

/**
 * 正则全量匹配，返回 [{file, line, text, match, groups}]
 * 🔴 必须用 matchAll：`String.prototype.match` 在带 `g` 标志时**不返回捕获组**，
 * 而本文件多数规则依赖 groups[1] 取值（断点、宽度…），用 match 会静默量到 undefined。
 * 另：matchAll 支持一行内多次命中，match 只能取首个。
 */
function grep(files, re) {
  const hits = []
  const g = re.flags.includes('g') ? re : new RegExp(re.source, re.flags + 'g')
  for (const f of files) {
    lines(f).forEach((text, i) => {
      for (const m of text.matchAll(g)) {
        hits.push({ file: relative(ROOT, f), line: i + 1, text: text.trim(), match: m[0], groups: m })
      }
    })
  }
  return hits
}

/** 统计某捕获组取值 → 出现次数的分布 */
function distribution(hits, pick = (h) => h.match) {
  const d = new Map()
  for (const h of hits) {
    const k = pick(h)
    d.set(k, (d.get(k) ?? 0) + 1)
  }
  return d
}

// ─────────────────────────── 页面清单 ───────────────────────────

const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'scripts/ui-manifest.json'), 'utf8'))
const LIST_PAGES = MANIFEST.listPages

// ─────────────────────────── 规则实现 ───────────────────────────
// 每条规则返回 { value:number, detail:string, offenders:string[] }
// value 与 config 中的 target 用 op 比较（默认 lte，即 value <= target 视为通过）

// ── 令牌消费类规则（D-15 / D-17）**共用**的声明口径 ──────────────────────
//
// 🔴 两条规则必须共用同一套正则。第一版各写各的，结果同一份代码报出两个字面量总数
//    （D-15 说 226、D-17 说 272）——「命中档位 + 档位外」与「字面量总数」对不上，
//    谁也不知道哪个对。**同一个量只能有一个真源**，哪怕它只是几条正则。
//
// 🔴 每条还必须带上**语义族**（prefix）。第一版 D-17 只按「裸值相等」判定命中，
//    于是 `font-size: 20px` 撞上 `$space-5: 20px` 被算成「有档不用」——可令牌表里
//    根本没有 20px 的字号档，照它改会把 `$space-5` 用在字号上，语义全错。
//    **跨族按值比对会产出错误建议**，故命中判定必须限定在同族内。
const TOKEN_DECL_RE = [
  { family: 'font-size', num: false, prefix: ['font-size-'], re: /font-size\s*:\s*([^;{}]+)/ },
  { family: 'space', num: false, prefix: ['space-'], re: /(?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?\s*:\s*([^;{}]+)/ },
  { family: 'radius', num: false, prefix: ['radius-', 'border-radius'], re: /border-radius\s*:\s*([^;{}]+)/ },
  { family: 'font-weight', num: true, prefix: ['font-weight-'], re: /font-weight\s*:\s*([^;{}]+)/ },
]

/** 剥掉**行内**注释后再匹配：`padding: 8px; // 与 12px 对齐` 里的 12px 不是声明值 */
const stripInlineComment = (l) => l.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '')

/** 单行长度的字面量（px/rem/em）；简写多值如 `padding: 8px 12px` 不计入，避免一值多算 */
const LENGTH_LITERAL = /^-?\d+(?:\.\d+)?(?:px|rem|em)$/

/** 遍历所有样式声明位置，回调 (值, 声明口径, 文件, 行号) */
function eachTokenDecl(cb) {
  for (const p of VUE_SCSS()) {
    if (p.endsWith('variables.scss')) continue // 令牌定义文件本身不参与消费统计
    lines(p).forEach((raw, i) => {
      const l = raw.trim()
      if (/^(\/\/|\*|\/\*|<!--)/.test(l)) return // 整行注释
      const code = stripInlineComment(l)
      for (const decl of TOKEN_DECL_RE) {
        const m = code.match(decl.re)
        if (m) cb(m[1].trim(), decl, p, i + 1)
      }
    })
  }
}

// ── 「写操作是否有在途反馈」判据（I-01）**共用**的识别口径 ────────────────
//
// 🔴 本条判据的**可见域**完全由下面两个函数决定——它既是能力的边界，也是误报的来源。
//    设计取舍：**宁可窄而准，不可宽而假**。一条被假阳性淹没的守卫会立刻失去信任，
//    跑出绿也说明不了任何事（本轮 G-01 的教训：守卫数的是文本、不是语义）。
//
// 🔴 为什么要做**调用闭包**而不是只扫模板：本轮修掉的 40+ 个缺口里，模板上写的是
//    `@click="handleSubmit(row)"`，真正调写接口的动作在**函数体**里。只 grep 模板
//    上「@click 里直接出现接口名」的写法，全站只命中 2 处——那正是「空心绿」：
//    规则绿着，我修的东西一个都不在它的视野里。判据必须走到函数体里去看。
//
// ① 哪些 api 函数算「写」
//    两条判据取并集：函数名动词前缀在白名单内，**或**函数体直接出现 http.put/delete/patch。
//    🔴 为什么不能只看 http.post：本仓读接口大量借 POST 做搜索（getDictTypeList /
//    getTemplate / getClaimDetail…），只看 post 会把半个读接口集合算成写。
//    🔴 为什么还留动词白名单：PUT/DELETE/PATCH 是**结构性信号**，不受命名习惯影响，
//    但有些写动作确实走 POST（如 create* / submit*）——两者互补，缺一不可。
const WRITE_VERB_RE = /^(?:create|update|delete|remove|add|save|submit|approve|reject|publish|retire|revoke|activate|deactivate|enable|disable|toggle|reset|assign|unassign|bind|unbind|replace|operate|execute|complete|start|claim|effect|resolve|refresh|import|export|upload|generate|confirm|cancel|freeze|release|refund|apply|commit|rollback|reopen|batch|sync|run)/

let _writeFns = null
/** 全站 api 模块里的写接口函数名集合（一次运行内缓存） */
function apiWriteFns() {
  if (_writeFns) return _writeFns
  const set = new Set()
  for (const f of walk(join(SRC, 'api'), ['.ts'])) {
    const src = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释：注释里提到的接口名不算实现
      .replace(/^\s*\/\/.*$/gm, '')
    // 按 export 语句切段：一段 = 一个导出（箭头函数单表达式体因此天然成段）
    for (const seg of src.split(/(?=^export\s)/m)) {
      const m = seg.match(/^export\s+(?:async\s+)?(?:const|function)\s+(\w+)/)
      if (!m) continue
      if (WRITE_VERB_RE.test(m[1]) || /\bhttp\.(?:put|delete|patch)\s*[<(]/.test(seg)) set.add(m[1])
    }
  }
  _writeFns = set
  return set
}

/** text 中是否调用了 names 里的任一函数 */
const callsAny = (text, names) => {
  for (const n of names) if (new RegExp(`\\b${n}\\s*\\(`).test(text)) return true
  return false
}

/**
 * 取 .vue 源码中 `<template>` 块的 [起, 止) 偏移。
 * 无 template 块时返回 null（此类组件不在判据内，不假装扫过）。
 */
function templateRange(src) {
  const start = src.indexOf('<template>')
  const end = src.lastIndexOf('</template>')
  return start < 0 || end < 0 ? null : [start, end]
}

/**
 * 取 `src` 中名为 name 的局部函数/箭头函数的函数体文本。
 * 大括号配对到底；表达式体箭头函数（无 `{`）取到行尾。
 * 找不到定义返回 null。
 */
function bodyOf(src, name) {
  const m = new RegExp(`(?:\\bconst|\\blet|\\bfunction)\\s+${name}\\s*[=(]`).exec(src)
  if (!m) return null
  const lineEnd = src.indexOf('\n', m.index)
  const brace = src.indexOf('{', m.index + m[0].length - 1)
  if (brace < 0 || (lineEnd >= 0 && brace > lineEnd)) {
    return src.slice(m.index, lineEnd < 0 ? src.length : lineEnd)
  }
  let depth = 0
  for (let j = brace; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}' && --depth === 0) return src.slice(brace, j + 1)
  }
  return src.slice(brace)
}

/** 偏移 → 行号（1 起） */
const lineAt = (text, index) => text.slice(0, index).split('\n').length

/**
 * 匹配一个起始标签，**属性值内的 `>` 不算标签结束**。
 *
 * 🔴 不能用 `[^>]*>`：箭头函数的 `=>` 自带一个 `>`，会把标签**在属性中途截断**。
 *    实测后果——`@command="(action: string) => operate(row, action)"` 的标签被切在 `=>`
 *    的 `=` 处，于是既读不到 `@command`（下半段没了），也读不到它之后的 `:loading`。
 *    全站 48 个下拉标签里，凡用内联箭头的一律落在视野之外，规则却报「全部达标」——
 *    这是本判据第一版的**空心绿**，与 G-01「数的是文本不是语义」同族：
 *    **正则的写法决定了可见域，看不见 ≠ 不存在**。
 *
 * 🔴 `(?=[\s>])` 不可省：没有它 `<el-dropdown>` 会把 `<el-dropdown-menu>` 和
 *    `<el-dropdown-item>` 一并算成下拉本体，虚增载体数。
 *
 * 交替式 `"[^"]*"|'[^']*'|[^>"']` 表示「先吃掉成对的引号属性值，再逐字符吃非 `>` 非引号」，
 * 故三种引号写法（双/单/裸值）都成立。
 *
 * `tags` 是**捕获组内**的标签名交替（如 `'el-button|el-switch'`），故 m[1] 即标签名。
 */
const openTagRe = (tags) => new RegExp(`<(${tags})(?=[\\s>])(?:"[^"]*"|'[^']*'|[^>"'])*>`, 'g')

// ── 表格列解析（S-01c / S-03 / S-15 / S-16 / S-17 / S-19 / S-20 共用）────
//
// 🔴 为什么不能按行 grep：操作列的**属性可以跨行**（核保工单的开标签横跨 66-88 行），
//    按行匹配只能看到 `label="操作"` 那一行，拿不到同一标签内的 width，会静默量成「未声明」。
const NUM_W = /(?<![\w-])width="(\d+)"/
const DYN_W = /:(?:min-)?width="/ // 动态绑定在静态期无法求值，两条规则都跳过

/** 逐个 <el-table>/<TiTable> 元素切块（配平嵌套，容忍自闭合），返回 {file, line, block} */
function vueTables() {
  const out = []
  for (const f of VUE()) {
    const src = lines(f).join('\n')
    for (const m of src.matchAll(/<(el-table|TiTable)(?![\w-])/g)) {
      const tag = m[1]
      const tagRe = new RegExp(`</?${tag}(?![\\w-])`, 'g')
      let depth = 0
      let i = m.index
      let end = src.length
      while (i < src.length) {
        tagRe.lastIndex = i
        const t = tagRe.exec(src)
        if (!t) break
        const isClose = src[t.index + 1] === '/'
        const gt = src.indexOf('>', t.index)
        if (gt < 0) break
        const selfClose = src[gt - 1] === '/'
        if (!isClose && !selfClose) depth++
        else if (isClose) depth--
        i = gt + 1
        if (depth === 0) {
          end = i
          break
        }
      }
      out.push({
        file: relative(ROOT, f),
        line: src.slice(0, m.index).split('\n').length,
        block: src.slice(m.index, end),
      })
    }
  }
  return out
}

/**
 * 块内每个列：开标签 `tag`、行号 `line`、**列体** `body`（开标签之后到配平闭合标签之前）。
 *
 * <p>🔴 列体切片**必须配平**：自闭合列（`… />`，如内联编辑表里的「基准值」「必填」）没有闭合
 * 标签，用 `indexOf('</el-table-column>')` 会一路串到**后面某个列**的闭合标签，把后续列的内容
 * 算进本列 —— 实测让裸的「基准值」列被误判为「列内含按钮」，进而被误纳为操作列（S-20）。
 * 自闭合列直接判为空体。</p>
 */
function blockColumns(t) {
  return [...t.block.matchAll(openTagRe('el-table-column'))].map((c) => {
    const tag = c[0]
    const start = c.index + tag.length
    const end = t.block.indexOf('</el-table-column>', start)
    const body = /\/>\s*$/.test(tag) || end < 0 ? '' : t.block.slice(start, end)
    return { tag, body, line: t.line + t.block.slice(0, c.index).split('\n').length - 1 }
  })
}

/**
 * **操作列**识别口径（S-20，2026-09-21 放宽）。
 *
 * <p>旧口径是 `label="操作"|"动作"` 或带 `ti-action-column` 类，漏掉了两类真实操作列：
 * ① `label="查看"` —— 详情页窄表里的「详情 / 工作台」跳转列（policy/detail 两处）；
 * ② `label="冲突处理"` —— 保全工作台按需建列的三按钮决策列。二者此前**完全不在任何守卫射程内**。</p>
 *
 * <p>新口径 = `label ∈ {操作, 查看, 动作, 处理}` ∪「列内含**固定文案**的动作按钮」。
 * 🔴 后一支必须带两个排除条件，否则会大面积误报——两者都是实测反例，不是预防性设计：</p>
 * <ul>
 *   <li><b>排除「按钮文案是插值」</b>：`<el-button link @click="goDetail(row.id)">{{ row.name }}</el-button>`
 *       是**名称即入口**（clause/list 条款名称、product/list 产品名称与版本共 3 处），
 *       列宽由内容决定、走 `min-width` 承接，与「动作承载列」是两种载体。
 *       把它们纳进来会让 S-16 要求它们写死档位宽度，直接压坏表格布局。</li>
 *   <li><b>排除「列内含录入控件」</b>：保全工作台「拟变更值」列内有 el-input/el-select，
 *       附带一个「清除」按钮（清空该格），是**行内编辑列**而非操作列。
 *       （同页的「冲突处理」列只有按钮，故仍被正确纳入。）</li>
 * </ul>
 * <p>另：`maintenance/configuration` 内联编辑表的两列纯图标删除按钮（自闭合、无文案）
 * 亦被「固定文案」条件排除——这类列是行内增删行，S-15 刻意保留其 link/text 形态。</p>
 */
const ACTION_LABELS = /label="(操作|查看|动作|处理)"/
const INLINE_EDITOR =
  /<(el-input|el-input-number|el-select|el-checkbox|el-radio|el-switch|el-date-picker|el-time-picker|el-textarea|TiDictSelect|TiDictTreeSelect)\b/

/** 列内是否存在**固定文案**的动作按钮（文案非空且不含插值 `{{`） */
function hasFixedTextButton(body) {
  for (const m of body.matchAll(openTagRe('el-button'))) {
    if (/\/>\s*$/.test(m[0])) continue // 纯图标按钮（自闭合）—— 行内编辑表的行删除按钮即此形态
    const after = body.slice(m.index + m[0].length)
    const end = after.indexOf('</el-button>')
    const text = (end < 0 ? after.slice(0, 60) : after.slice(0, end)).replace(/\s+/g, ' ').trim()
    if (text && !text.includes('{{')) return true
  }
  return false
}

function isActionCol(tag, body = '') {
  if (/ti-action-column/.test(tag)) return true
  if (ACTION_LABELS.test(tag)) return true
  if (!/<el-(button|dropdown)\b/.test(body)) return false
  if (INLINE_EDITOR.test(body)) return false
  return hasFixedTextButton(body)
}

/**
 * 在**操作列**内扫描按钮形态（S-15 查 link、S-19 查 text 共用）。
 *
 * <p>同一判据写两遍必漂移（§一），故「锚点 + 列体切片」只此一份，两条规则仅传入不同的形态正则。
 * 分开计量是为了让失败信息能直接指出是哪一种形态，而不是笼统的「按钮不合规」。</p>
 */
function scanActionButtons(formRe, formName) {
  const offenders = []
  let total = 0
  for (const t of vueTables()) {
    for (const { tag, body, line } of blockColumns(t)) {
      if (!isActionCol(tag, body)) continue
      for (const btn of body.matchAll(openTagRe('el-button'))) {
        total += 1
        if (formRe.test(btn[0])) {
          offenders.push(`${t.file}:${line} ${btn[0].replace(/\s+/g, ' ').slice(0, 90)}`)
        }
      }
    }
  }
  return {
    value: offenders.length,
    detail: `操作列内按钮 ${total} 个，其中 ${formName} ${offenders.length} 个`,
    offenders,
  }
}

/** 从 TS 真源解析档位（guard 侧不得再抄一份数字，见 S-16 上方说明） */
function actionWidthTiers() {
  const src = readFileSync(join(SRC, 'constants/table.ts'), 'utf8')
  const rec = src.match(/ACTION_COL_WIDTH[^=]*=\s*\{([\s\S]*?)\}/)
  const tiers = rec ? [...rec[1].matchAll(/\d+\s*:\s*(\d+)/g)].map((m) => Number(m[1])) : []
  const xl = src.match(/ACTION_COL_WIDTH_XL\s*=\s*(\d+)/)
  return { tiers, xl: xl ? Number(xl[1]) : NaN }
}

const RULES = {
  // ── 第一阶段：底盘 ──────────────────────────────────────────

  'D-01': {
    title: 'Element Plus 主题派生变量完整覆盖（10 个）',
    op: 'eq',
    run() {
      const theme = join(SRC, 'assets/styles/index.scss')
      if (!existsSync(theme)) return { value: 0, detail: 'index.scss 不存在', offenders: [] }
      const css = readFileSync(theme, 'utf8')
      const need = [
        '--el-color-primary',
        '--el-color-primary-light-3',
        '--el-color-primary-light-5',
        '--el-color-primary-light-7',
        '--el-color-primary-light-8',
        '--el-color-primary-light-9',
        '--el-color-primary-dark-2',
        '--el-color-primary-rgb',
        '--el-border-radius-base',
        '--el-font-size-base',
      ]
      const missing = need.filter((v) => !new RegExp(`${v}\\s*:`).test(css))
      return {
        value: need.length - missing.length,
        detail: `已声明 ${need.length - missing.length}/${need.length}`,
        offenders: missing.map((m) => `缺失 ${m}`),
      }
    },
  },

  'D-02': {
    title: '设计令牌数量 ≥ 55（间距/字重/色阶/断点补全）',
    op: 'gte',
    run() {
      const f = join(SRC, 'assets/styles/variables.scss')
      const hits = grep([f], /^\s*\$[a-z0-9-]+\s*:/gi)
      const names = new Set(hits.map((h) => h.match.replace(/[\s:$]/g, '')))
      return { value: names.size, detail: `当前 ${names.size} 个顶层令牌`, offenders: [] }
    },
  },

  'D-03': {
    title: '幻影令牌：var(--ti-*) 引用必须在某处有定义',
    op: 'lte',
    run() {
      const refs = grep(ALL_TS(), /var\(\s*(--ti-[a-z0-9-]+)/g).map((h) => h.groups[1])
      const defs = new Set(grep(ALL_TS(), /(--ti-[a-z0-9-]+)\s*:/g).map((h) => h.groups[1]))
      const ghosts = [...new Set(refs.filter((r) => !defs.has(r)))]
      const count = refs.filter((r) => !defs.has(r)).length
      return {
        value: count,
        detail: `${refs.length} 处引用 / ${defs.size} 个定义，幻影 ${count} 处`,
        offenders: ghosts.map((g) => `未定义: ${g}`),
      }
    },
  },

  'D-04': {
    title: '硬编码色值清零（9 个可令牌化色值）',
    op: 'lte',
    run() {
      const BLACK = ['#909399', '#303133', '#606266', '#c0c4cc', '#ebeef5', '#409eff', '#e6a23c', '#67c23a', '#f56c6c']
      // 🔴 排除令牌定义文件本身。`$success-color: #67c23a` 这类**定义**正是这些色值唯一应有的归宿，
      // 计入违规会让「目标 ≤ 0」永不可达，且会诱导后来者用 ui-guard-ignore 去糊——那是把假阳性
      // 藏起来，不是消除它。本规则要禁的是**组件里写死色值**（散落），不是令牌表里有值。
      const TOKEN_DEFS = new Set(['src/assets/styles/variables.scss'])
      // 🔴 排除注释行。注释里提到色值（如「边框由 #dcdfe6 变为近黑」）既不上线也不影响样式，
      // 不是违规；把它计成违规会让开发者不敢在注释里写具体色值，或者去加 ui-guard-ignore——
      // 前者让注释变含糊，后者把假阳性藏起来。与 D-08 的过滤器同口径：计数口径必须与
      // 规则标题说的是同一件事（本条标题是「硬编码色值」，不是「提到了色值」）。
      const hits = grep(VUE_SCSS(), new RegExp(`(${BLACK.join('|')})`, 'gi'))
        .filter((h) => !TOKEN_DEFS.has(h.file))
        .filter((h) => !/^(\/\/|\*|\/\*|<!--)/.test(h.text))
      const dist = distribution(hits, (h) => h.match.toLowerCase())
      return {
        value: hits.length,
        detail: `${hits.length} 处 / ${dist.size} 种色值`,
        offenders: [...dist.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} × ${n}`),
      }
    },
  },

  // 色值字面量不得出现在模板与脚本段（2026-09-18 第三轮新增，补 D-04 的枚举盲区）
  //
  // 🔴 为什么不并进 D-04：D-04 的判据是一份**9 个色值的清单**，于是清单外的色值它一律看不见。
  //    本轮实测正是如此——`#1a3a6b`(=$primary-color)、`#4a7cc9`(=$primary-lighter)、
  //    `#2d5aa0`、`#9b59b6`、`#0f1e3d`/`#c0ccda`/`#ffffff`(=侧边栏三色) 全部在清单之外，
  //    D-04 报 0、真机上这些色值却有 13 处。**判据若是枚举，可见域就等于那份清单**，
  //    与 G-03 v1 按 prop 后缀枚举是同一个根因（见 G-03 的 v2 说明）。
  //    本规则改用**形态**判定：只要是十六进制色值或首通道为数字的 rgb()/rgba()，一律命中，
  //    不看它具体是什么颜色——新色值无需登记即自动落入可见域。
  //
  // 🔴 为什么只查 template + script 两段：`<style>` 段本就运行在令牌体系里（且已由 D-04 看住），
  //    而模板与脚本段是**令牌的真空区**——SCSS 变量在那儿不可见，于是最容易被写成字面量。
  //    实测这 13 处全部落在 template/script（内联 style、组件属性、ECharts 配置）。
  //
  // 🔴 为什么不连 `var(--el-*)` 一起禁：那是**主题变量**，由浏览器/EP 解析，属合法通路
  //    （`--el-text-color-secondary` 已由 :root:root 统一到 $text-secondary）。
  //    禁它会一次命中 23 处合法写法，只能靠白名单豁免——那又退回枚举式判据。
  //    「语义色本体当文字色」那一类改由语义判据覆盖（见 ROUND3 §四 判据 6）。
  //
  // 用法：模板/脚本需要色值时，走 `var(--ti-*)`（已导出品牌色阶、侧边栏、语义文字变体）
  //       或 `cssVar('--ti-*')`（canvas / 组件属性等拿不到 CSS 级联的场景）。
  //
  // ⚠️ 编号取 D-14：本规则**两次**因编号撞车而失效/错位，两次都不是笔误而是没查占用：
  //    ① 最初误用 D-09，与既有规则「危险确认按钮使用 danger 色」在同一个对象字面量里
  //       形成**重复键**——JS 取后出现者，本规则被静默顶掉、一次都没执行过，
  //       而外部只看到既有 D-09 变红。同名键互相遮蔽不报错，只能靠编号不撞来防。
  //    ② 改叫 D-10 后仍错：守卫的 D-01~D-12 与 `docs/ui-audit/UI-REVIEW.md`
  //       §5.1 的契约项**是同一套编号**，D-10 已被契约项「弹窗取消不再产生未捕获
  //       rejection」占用（该项因属运行期行为、不建守卫，故守卫里没有 D-10 键，
  //       grep 守卫文件查不到占用——**查占用要连报告一起查**）。
  //    ⇒ 下一个空号是 D-14（D-13 已由「日期格式化重复实现」规则占用）。
  'D-14': {
    title: '色值字面量不得出现在模板与脚本段（须走 --ti-* 变量或 cssVar()）',
    op: 'lte',
    run() {
      const HEX = /#[0-9a-fA-F]{3,8}\b/
      // 首通道必须是数字才算字面量：`rgba(${cssVar('--el-color-primary-rgb')}, 0.3)` 是正当写法
      // （其首字符是 `$` 而非数字，天然落空）。一并吃到右括号，否则报告只显示 `rgb(1` 这种残片。
      const RGB = /\brgba?\(\s*\d[^)]*\)/
      const offenders = []
      let scanned = 0
      for (const f of VUE()) {
        const rel = relative(ROOT, f)
        const src = readFileSync(f, 'utf8')
        // 切掉 <style> 段，只留 template + script
        const styleAt = src.search(/<style[\s>]/)
        const head = styleAt === -1 ? src : src.slice(0, styleAt)
        head.split('\n').forEach((text, i) => {
          scanned++
          // 注释行不是违规（与 D-04 同口径：计数口径须与标题说的是同一件事）
          if (/^\s*(\/\/|\*|\/\*|<!--)/.test(text)) return
          const m = text.match(HEX) || text.match(RGB)
          if (!m) return
          offenders.push(`${rel}:${i + 1}　${m[0]}　${text.trim().slice(0, 90)}`)
        })
      }
      return {
        value: offenders.length,
        detail: `${offenders.length} 处色值字面量 / 共扫描 ${scanned} 行（template+script）`,
        offenders,
      }
    },
  },

  // 禁止在组件内重复实现日期格式化（2026-09-18 第三轮新增，F18）
  //
  // 🔴 为什么需要：全站 29 个文件从 `@/utils/date` 导入，唯独理赔域两个文件
  //    （claim/list、claim/detail）各自带一份 `split('T')[0]` / `replace('T',' ')` 的本地实现
  //    —— 这是**第三个真源**（同 F12 的 --el-text-color-secondary、F14 的色值手抄副本）。
  //    本地实现是纯字符串替换：不校验有效性、遇毫秒会保留 `.123`、遇 `Z` 后缀会原样带出，
  //    换后端序列化格式即静默出错。两处修掉后加此规则，防第三个出现。
  //
  // 判据是**形态**（函数名 + 定义语法），不看它怎么实现：只要组件里出现
  // `const/function formatDate|formatDateTime|formatTime` 即命中。
  // 真源 `src/utils/date.ts` 是 .ts，不在 VUE() 的扫描域内，天然不会误伤。
  'D-13': {
    title: '禁止组件内重复实现日期格式化（须用 @/utils/date）',
    op: 'lte',
    run() {
      const hits = grep(VUE(), /(?:const|function)\s+(?:formatDate|formatDateTime|formatTime)\s*[=(]/)
      return {
        value: hits.length,
        detail: `${hits.length} 处组件内本地实现（真源：src/utils/date.ts）`,
        offenders: hits.map((h) => `${h.file}:${h.line}　${h.text.slice(0, 80)}`),
      }
    },
  },

  'D-05': {
    title: '裸 <style scoped> 补 lang="scss"',
    op: 'lte',
    run() {
      const hits = grep(VUE(), /<style\s+scoped\s*>/)
      return { value: hits.length, detail: `${hits.length} 个文件`, offenders: hits.map((h) => `${h.file}:${h.line}`) }
    },
  },

  'D-06': {
    title: 'TiTable 能力增强：stripe 不再硬编码 + error/toolbar 插槽齐备',
    op: 'eq',
    run() {
      const f = join(SRC, 'components/TiTable/index.vue')
      if (!existsSync(f)) return { value: 0, detail: 'TiTable 不存在', offenders: [] }
      const src = readFileSync(f, 'utf8')
      const need = ['stripe', 'border', 'toolbar', 'error', 'empty', 'height', 'maxHeight', 'showRefresh']
      const missing = need.filter((k) => !src.includes(k))
      return {
        value: need.length - missing.length,
        detail: `${need.length - missing.length}/${need.length} 项就绪`,
        offenders: missing.map((m) => `缺失 ${m}`),
      }
    },
  },

  'D-07': {
    title: 'useTable 错误状态契约：tableError + catch + retry',
    op: 'eq',
    run() {
      const f = join(SRC, 'composables/useTable.ts')
      if (!existsSync(f)) return { value: 0, detail: 'useTable 不存在', offenders: [] }
      const src = readFileSync(f, 'utf8')
      const need = [
        ['tableError', /tableError/],
        ['catch', /\bcatch\b/],
        ['retry', /retry/],
        ['成功路径清错', /tableError\.value\s*=\s*null/],
      ]
      const missing = need.filter(([, re]) => !re.test(src))
      return {
        value: need.length - missing.length,
        detail: `${need.length - missing.length}/${need.length} 项就绪`,
        offenders: missing.map(([n]) => `缺失 ${n}`),
      }
    },
  },

  'D-08': {
    title: '全局 :focus-visible 焦点样式',
    op: 'gte',
    run() {
      // 🔴 只数**选择器行**。注释里提到 `:focus-visible` 不算数——否则一个只写了
      // 「为什么需要焦点样式」的说明注释、一条规则都没有的文件也能达标。
      // 与 D-04（令牌定义被误计为违规）、D-09（类名写错也算命中）同源：
      // 计数口径必须与规则标题说的是同一件事。
      const hits = grep(walk(join(SRC, 'assets/styles'), ['.scss']), /:focus-visible/)
        .filter((h) => !/^(\/\/|\*|\/\*)/.test(h.text))
      return { value: hits.length, detail: `${hits.length} 处选择器`, offenders: [] }
    },
  },

  'D-09': {
    title: '危险确认按钮使用 danger 色（confirmButtonClass 覆盖）',
    op: 'gte',
    run() {
      // 🔴 只数**真正带上 danger 类**的行。原实现数的是「含 confirmButtonClass 的行」，
      // 于是 `confirmButtonClass: 'foo'`、甚至类名拼错都算命中——门槛看着达标，
      // 实际可能一处都没标红。断言一个比标题更弱的条件，是假绿的标准形态，
      // 与 D-04 把令牌定义误计为违规同源：计数口径必须与规则标题说的是同一件事。
      //
      // 三处形式都要能被匹配到（故 `[^,;]*` 允许中间有 `isDestructive ?` 这类三元表达式）：
      //   confirmButtonClass: 'el-button--danger'
      //   confirmButtonClass: isDestructive ? 'el-button--danger' : ''
      //   confirmButtonClass: action.destructive ? 'el-button--danger' : ''
      const hits = grep(VUE(), /confirmButtonClass:[^,;]*el-button--danger/)
      return { value: hits.length, detail: `${hits.length} 处`, offenders: [] }
    },
  },

  'D-11': {
    title: 'CSS 断点取值收敛 ≤ 3 种',
    op: 'lte',
    run() {
      // 🔴 计数口径是「断点的**有效像素值**」，与它写成字面量还是令牌无关。
      // 原实现只认 `(\d+)px` 字面量。断点迁移到 $breakpoint-* 令牌后，它一条也匹配不到，
      // 实测从 4 掉到 0、规则「通过」——但此时它什么都没检查：既看不到已是 2 档，
      // 也拦不住有人再写一个 `@media (max-width: 1200px)`（那只算 1 种，照样 ≤2）。
      // 与 D-04（令牌定义被误计为违规）、D-08（注释被误计为选择器）、
      // D-09（类名写错也算命中）同源：计数口径必须与规则标题说的是同一件事。
      const tokenPx = new Map(
        grep([join(SRC, 'assets/styles/variables.scss')], /^\s*(\$breakpoint-[a-z0-9-]+)\s*:\s*(\d+)px/g).map((h) => [
          h.groups[1],
          h.groups[2],
        ]),
      )

      const hits = grep(VUE_SCSS(), /@media[^{]*?(?:max|min)-width\s*:\s*(\$[a-z0-9-]+|\d+px)/gi)
      const dist = new Map()
      const bad = []
      for (const h of hits) {
        const raw = h.groups[1]
        // 令牌拼错：解析不出像素值，但不许静默跳过——按它自己的名字占一档并报违规，
        // 否则「写成 $breakpoint-typo」等于把该断点从统计里抹掉。
        if (raw.startsWith('$') && !tokenPx.has(raw)) {
          bad.push(`${h.file}:${h.line} 未定义的断点令牌 ${raw}`)
          dist.set(raw, (dist.get(raw) ?? 0) + 1)
          continue
        }
        const v = raw.startsWith('$') ? `${tokenPx.get(raw)}px` : raw
        dist.set(v, (dist.get(v) ?? 0) + 1)
      }

      // 已声明但没人引用的断点令牌同样计入档位：设计系统的档位数不因「暂时没用到」而减少。
      // 否则可以先把 767/900/1100/1280 四档全声明好，只用两档，收敛目标就被绕过了。
      for (const px of tokenPx.values()) {
        const v = `${px}px`
        if (!dist.has(v)) dist.set(v, 0)
      }

      const vals = [...dist.entries()].sort((a, b) => b[1] - a[1])
      return {
        value: vals.length,
        detail: `${hits.length} 处断点 / ${vals.length} 种取值`,
        offenders: [...vals.map(([v, n]) => (n === 0 ? `${v}（已声明未使用）` : `${v} × ${n}`)), ...bad],
      }
    },
  },

  'D-12': {
    title: 'i18n 已从前端移除',
    op: 'lte',
    run() {
      // 🔴 排除注释行。注释里写「原先用的 vue-i18n 已移除」正是**这次移除本身留下的说明**，
      // 把它计成违规会逼着开发者删掉解释、或者去加 ui-guard-ignore 把假阳性藏起来。
      // 与 D-04/D-08 同过滤器：计数口径必须与标题说的「代码引用」是同一件事。
      const hits = grep(ALL_TS(), /vue-i18n|useI18n|\$t\(/).filter(
        (h) => !/^(\/\/|\*|\/\*)/.test(h.text),
      )
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
      const hasDep = !!(pkg.dependencies?.['vue-i18n'] || pkg.devDependencies?.['vue-i18n'])
      // 🔴 目录判据原先查的是 `src/locales`——本项目 i18n 资源从来就放在 `src/i18n`，
      // 该路径**恒不存在**，这个子句永远是 0：看着像安全网，实际一次也没响过。
      // 与 D-04（令牌定义被误计）、D-08（注释被误计）、D-09（类名写错也算命中）、
      // D-11（令牌化后正则量到 0）同源：判据必须指向真实存在的对象。
      // 两个名字都认：src/i18n 是本项目实际用过的，src/locales 是循环里的常见命名。
      const i18nDirs = ['i18n', 'locales'].map((d) => `src/${d}`).filter((d) => existsSync(join(ROOT, d)))
      return {
        value: hits.length + (hasDep ? 1 : 0) + i18nDirs.length,
        detail: `${hits.length} 处代码引用 / package.json ${hasDep ? '仍含' : '已移除'} / i18n 目录 ${i18nDirs.length ? `仍存在（${i18nDirs.join('、')}）` : '已移除'}`,
        offenders: hits.slice(0, 10).map((h) => `${h.file}:${h.line}`),
      }
    },
  },

  // ── 第二阶段：批量扫尾 ──────────────────────────────────────

  'S-01': {
    title: '列表页四段式骨架：.ti-page 使用 29/29',
    op: 'eq',
    run() {
      const missing = LIST_PAGES.filter((p) => {
        const f = join(SRC, p)
        return !existsSync(f) || !readFileSync(f, 'utf8').includes('ti-page')
      })
      return {
        value: LIST_PAGES.length - missing.length,
        detail: `${LIST_PAGES.length - missing.length}/${LIST_PAGES.length} 页使用 .ti-page`,
        offenders: missing.map((p) => `缺 .ti-page: ${p}`),
      }
    },
  },

  'S-01b': {
    title: '列表页统一用 TiTable（收掉裸 el-table）',
    op: 'eq',
    run() {
      const using = LIST_PAGES.filter((p) => {
        const f = join(SRC, p)
        return existsSync(f) && /<TiTable/.test(readFileSync(f, 'utf8'))
      })
      const missing = LIST_PAGES.filter((p) => !using.includes(p))
      return {
        value: using.length,
        detail: `${using.length}/${LIST_PAGES.length} 页用 TiTable`,
        offenders: missing.map((p) => `裸 el-table: ${p}`),
      }
    },
  },

  'S-02': {
    title: '检索动词统一：中文「查询」按钮清零',
    op: 'lte',
    run() {
      const hits = grep(VUE(), />\s*查询\s*</)
      return { value: hits.length, detail: `${hits.length} 处`, offenders: hits.map((h) => `${h.file}:${h.line}`) }
    },
  },

  'S-03': {
    title: '操作列宽度取值收敛 ≤ 5 档',
    op: 'lte',
    run() {
      // 🔴 锚点走 S-20 的 isActionCol，不再自带 `label="操作"` 正则：同一判断写两处必然漂移
      //    （D-15/D-17 曾各写一套正则，同一份代码报出 226 与 272 两个总数）。
      const dist = new Map()
      let n = 0
      for (const t of vueTables()) {
        for (const { tag, body } of blockColumns(t)) {
          if (!isActionCol(tag, body)) continue
          n += 1
          const m = tag.match(/(?:min-)?width="(\d+)"/)
          const k = m ? `${m[1]}px` : '(未设宽度)'
          dist.set(k, (dist.get(k) ?? 0) + 1)
        }
      }
      const vals = [...dist.entries()].sort((a, b) => b[1] - a[1])
      return {
        value: vals.length,
        detail: `共 ${n} 个操作列 / ${vals.length} 种宽度`,
        offenders: vals.map(([v, c]) => `${v} × ${c}`),
      }
    },
  },

  'S-01c': {
    title: '操作列统一使用 .ti-action-column（间距与换行保护）',
    op: 'lte',
    run() {
      const bad = []
      let total = 0
      for (const t of vueTables()) {
        for (const { tag, body, line } of blockColumns(t)) {
          if (!isActionCol(tag, body)) continue
          total += 1
          if (!/ti-action-column/.test(tag)) bad.push(`${t.file}:${line}`)
        }
      }
      // 🔴 量的是**违规数**而非「已采用数」，且目标定为 0：本规则要求 100% 覆盖。
      //    原实现（配 config 的 `eq 46`）把「全部合规」表达成一个**绝对数字**——那是 S-20 放宽
      //    口径前的操作列总数。放宽后总数变为 49，仍返回「已采用数 46」⇒ 恰好等于旧目标 ⇒
      //    **3 个真正缺类的列被静默放过**（假绿）。判据：凡「全部 X」的语义都写成 `lte 0` 的
      //    违规计数，不写成 `eq 总数`——后者把「覆盖率」偷换成「绝对数」，总量一变就失守。
      return { value: bad.length, detail: `${total - bad.length}/${total} 操作列已采用`, offenders: bad }
    },
  },

  'S-15': {
    title: '操作列内一律常规按钮（禁止 el-button link）',
    op: 'lte',
    run() {
      // 🔴 判据形状：**先按 S-20 口径配出操作列，再在列体内找 el-button**。
      //    全文件 grep `el-button … link` 会把**对话框/抽屉内联可编辑表**里的「删除」
      //    「+ 新增一行」也计进来 —— 那是另一类载体（无 `label="操作"` 列），本仓刻意保留 link。
      // 🔴 必须用 `openTagRe`（引号感知）：`[^>]*` 会在 `@click="() => …"` 的 `>` 处**提前截断标签**，
      //    其后的 `link` 属性一并消失 —— 实测该写法会让 48 个 dropdown 只认出 1 个（见 I-01 同名教训）。
      const FORM = /(?<![\w-])link(?![\w-])/
      return scanActionButtons(FORM, 'link')
    },
  },

  // ── 第五阶段：守卫盲区补漏（R7-15 / 2026-09-21）──────────────────────
  //
  // 🔴 本轮四条规则的共同来历：**四条既有守卫全部拦不住用户当轮点名的缺陷**。
  //    核保工单操作列「审核」写成文字按钮（S-15 只禁 link 不禁 text）、
  //    policy/detail 的 label="查看" 列不在任何规则射程内（S-01c/S-03/S-15 全部锚定 label="操作"）、
  //    支付运营状态列靠兜底表把字典文案说错（无「必须传 label」约束）、
  //    产品详情条款面板已就地兜底却仍弹全局红条（无「自行 catch 就必须 silentError」约束）。
  //    教训同 §一：**规则的射程由它的锚点决定，锚点窄一格，缺陷就从那一格漏过去**。

  'S-19': {
    title: '操作列内禁止 el-button text（与 link 同为零边框形态，S-15 只覆盖 link）',
    op: 'lte',
    run() {
      // 核保工单「审核」曾带 text ⇒ 同列「详情」带边框、「审核」为纯文字，是全站唯一
      // 「一列内混用两种形态」的反例。S-15 当时只禁 link，该形态从缺口漏过。
      // 与 S-15 同口径同锚点，仅判据词不同；两条各自计量，便于分别定位。
      const FORM = /(?<![\w-])text(?![\w-])/
      return scanActionButtons(FORM, 'text')
    },
  },

  'S-20': {
    title: '操作列识别口径覆盖度：新口径识别数 ≥ 旧窄口径，且总数不得塌陷（防口径写坏后静默空转）',
    op: 'eq',
    run() {
      const NARROW = (tag) => /label="(操作|动作)"/.test(tag) || /ti-action-column/.test(tag)
      let wide = 0
      let narrow = 0
      const widened = []
      for (const t of vueTables()) {
        for (const { tag, body, line } of blockColumns(t)) {
          if (NARROW(tag)) narrow += 1
          if (isActionCol(tag, body)) {
            wide += 1
            if (!NARROW(tag)) widened.push(`${t.file}:${line}`)
          }
        }
      }
      // 🔴 判据一：放宽只能「多认」，绝不能比窄口径少 —— 少了就是新口径的正则写坏，
      //    而写坏的表现是 offenders 变少、门禁更容易变绿，属**静默放宽**。
      // 🔴 两条判据的分工是**实测出来的**，不是设计时想当然（负向对照各跑一轮）：
      //    判据一「wide ≥ narrow」要同时写坏两处正则才可能触发（isActionCol 首行认 ti-action-column、
      //    ACTION_LABELS 认「操作/动作」）——它是「新口径必须 ⊇ 旧口径」的明文声明，属兜底而非主力；
      //    判据二的下限才是**唯一能发现「所有下游规则集体空转」的哨兵**：把 blockColumns 注入成
      //    `return []` 后实测 wide=0、narrow=0，判据一因 0 < 0 为假而放行，**只有判据二变红**，
      //    同时 S-01c/S-03/S-15/S-16/S-19 全部假绿（它们各自的违规数都成了 0）。
      //    另注：单点漏认（如把 ACTION_LABELS 里的「查看」删掉）**不会**触发任何判据——
      //    那两个列内是固定文案按钮，仍被第三条判据（hasFixedTextButton）兜住。故本规则管的是
      //    「底盘整体塌陷」，不声称能发现个别 label 关键字的缺失。
      // 🔴 总数下限 48（当前实测 49，余量 1）—— 操作列识别数是 S-01c/S-03/S-15/S-16/S-19
      //    共同的**统计底盘**：底盘少认几列，这几条规则会**一起**静默放宽。下限取「实测 − 1」
      //    而不是随手留宽：漏认 2 列即红，强制人工判一次「是解析器退化，还是真删了列」。
      const MIN_ACTION_COLS = 48
      const bad = []
      if (wide < narrow) bad.push(`新口径识别 ${wide} < 窄口径 ${narrow} —— 口径正则写坏，属静默放宽`)
      if (wide < MIN_ACTION_COLS) bad.push(`操作列识别数 ${wide} < 下限 ${MIN_ACTION_COLS} —— 解析器疑似失效或口径漏认，请核对 blockColumns/isActionCol/ACTION_LABELS`)
      return {
        value: bad.length,
        detail: `新口径 ${wide} 个 / 窄口径 ${narrow} 个 / 新纳入 ${widened.length} 个（${widened.join('、') || '无'}）`,
        offenders: bad,
      }
    },
  },

  'S-21': {
    title: 'TiStatusTag 必须显式传 label；且 COLOR_MAP 与 STATUS_TEXT 键集合须双向对账',
    op: 'lte',
    run() {
      // 🔴 两半合一的理由：它们描述的是**同一条缺陷的两个方向**——
      //    ① 调 用 点 不传 label ⇒ 组件回落到兜底表，而兜底表对同码不同义的码只能猜一个
      //       （实测支付运营「待缴费」被说成「待处理」）；
      //    ② 色板与文案表的键集合不齐 ⇒ 补了颜色没补文案的码**彩色标签配英文码**，
      //       或补了文案没补颜色的码**中文标签配灰底**（用户点名「状态没做颜色」）。
      //    只做 ① 挡不住 ②，只做 ② 挡不住 ①，故并作一条。
      //
      // 豁免：调用点用「文件:行」锚定（形态上与合规调用无法区分），并校验**豁免不得腐烂**
      // ——登记的位置若已不再缺失 label，即判为僵尸豁免并计入 offenders。
      // 🔴 行号会随同文件上下文增删行而漂移（实测：给 workbench 的「冲突处理」列补注释后 193→195，
      //    僵尸校验立刻把过期键顶成 offender）——**这是有意保留的耦合**：行号对不上时必须人工
      //    回读该处确认「仍是同一个无从取 label 的调用点」，而不是靠模糊匹配静默跟随。
      const NO_LABEL_EXEMPT = new Map([
        [
          'src/views/maintenance/workbench/index.vue:193',
          '保全**任务级**状态（MaintenanceWorkflowTaskStatus，10 值域）在 t_dict_type 中无对应字典，调用点无从取 label；文案由组件兜底表承载（其中 6 码 READY/IN_PROGRESS/SKIPPED/WAITING_CONDITION/WAITING_EXTERNAL/QUOTED 为本枚举专属，另 4 码 PENDING/COMPLETED/REJECTED/FAILED 是跨域通用码，同表覆盖 ⇒ 10/10 全有中文）'
            + '。R10-06 新增：流程任务时间轴的节点行（与下方表格同一份数据、同一码域）',
        ],
        [
          'src/views/maintenance/workbench/index.vue:213',
          '保全**任务级**状态（MaintenanceWorkflowTaskStatus，10 值域）在 t_dict_type 中无对应字典，调用点无从取 label；文案由组件兜底表承载（其中 6 码 READY/IN_PROGRESS/SKIPPED/WAITING_CONDITION/WAITING_EXTERNAL/QUOTED 为本枚举专属，另 4 码 PENDING/COMPLETED/REJECTED/FAILED 是跨域通用码，同表覆盖 ⇒ 10/10 全有中文）'
            + '。流程任务表的「状态」列',
        ],
      ])
      // 有颜色无文案的码：一码双义，必须由调用点传 label 指定域内语义，故**不收进**兜底表
      const COLOR_ONLY_EXEMPT = new Map([
        ['ISSUED', '账单域=「待缴费」、单证域=「已签发」，取任一个都会在另一域说错话'],
        ['APPLIED', 'MAINTENANCE_EFFECT_STATUS=「已生效」、PAYMENT_CALLBACK_STATUS=「已应用」'],
        ['SUB_STANDARD', '风险等级「次标准体」，与核保结论 STANDARD「标准承保」同码不同义'],
        ['HIGH_RISK', '风险等级「高风险体」，同上'],
        ['UNINSURABLE', '风险等级「不可保体」，同上'],
      ])

      const offenders = []
      // ── ① 调用点必须显式传 label ──
      let callSites = 0
      const stillMissing = new Set()
      for (const f of VUE()) {
        const src = readFileSync(f, 'utf8')
        const rel = relative(ROOT, f)
        for (const m of src.matchAll(openTagRe('TiStatusTag'))) {
          callSites += 1
          if (/[:@]label=/.test(m[0])) continue
          const key = `${rel}:${lineAt(src, m.index)}`
          stillMissing.add(key)
          if (!NO_LABEL_EXEMPT.has(key)) {
            offenders.push(`${key} TiStatusTag 未传 :label —— 兜底表按下标猜文案，域内语义须由调用方指定`)
          }
        }
      }
      for (const key of NO_LABEL_EXEMPT.keys()) {
        if (!stillMissing.has(key)) offenders.push(`${key} 僵尸豁免：该处已不再缺失 label，请从 NO_LABEL_EXEMPT 删除`)
      }

      // ── ② COLOR_MAP 与 STATUS_TEXT 键集合双向对账 ──
      const tagSrc = readFileSync(join(SRC, 'components/TiStatusTag/index.vue'), 'utf8')
      const keysOf = (name) => {
        const m = tagSrc.match(new RegExp(`const ${name}: Record<string, [^>]+> = \\{([\\s\\S]*?)\\n\\}`))
        // 🔴 解析失败必须抛错而非返回空集：空集与空集相比恒绿，规则会静默失去射程
        if (!m) throw new Error(`S-21 未能从 TiStatusTag/index.vue 解析出 ${name} —— 声明形态已变，请同步更新本正则`)
        return [...m[1].matchAll(/^ {2}([A-Za-z_]\w*)\s*:/gm)].map((x) => x[1])
      }
      // COLOR_MAP 里的 5 个「颜色关键字」（success/warning/danger/info/primary）是给调用方
      // 直接传颜色用的，不是业务码，不参与对账
      const KEYWORDS = new Set(['success', 'warning', 'danger', 'info', 'primary'])
      const colorCodes = keysOf('COLOR_MAP').filter((k) => !KEYWORDS.has(k))
      const textCodes = keysOf('STATUS_TEXT')
      for (const code of textCodes) {
        if (!colorCodes.includes(code)) {
          offenders.push(`STATUS_TEXT 有「${code}」但 COLOR_MAP 无 —— 该状态中文标签配灰底，等于没做颜色`)
        }
      }
      for (const code of colorCodes) {
        if (!textCodes.includes(code) && !COLOR_ONLY_EXEMPT.has(code)) {
          offenders.push(`COLOR_MAP 有「${code}」但 STATUS_TEXT 无且未登记豁免 —— 不传 label 即裸显英文码`)
        }
      }

      return {
        value: offenders.length,
        detail: `调用点 ${callSites} 个（缺 label ${stillMissing.size} 个，其中豁免 ${NO_LABEL_EXEMPT.size} 个）/ 色板 ${colorCodes.length} 码 · 文案 ${textCodes.length} 码`,
        offenders,
      }
    },
  },

  'S-22': {
    title: '作者已就地 catch 的 API 调用必须传 silentError:true（否则拦截器仍弹全局红条）',
    op: 'lte',
    run() {
      // 🔴 缺陷机理（R7-01 实测）：产品详情页的条款面板早已 `.catch(() => null)` 并就地显示
      //    「条款信息缺失」，但**拦截器在 reject 之前就已经把红条弹了** —— 用户读作「整页加载失败」，
      //    而局部那个小提示根本没人看见。`.catch()` 拦得住 Promise，拦不住 toast。
      //
      // 🔴 判据的识别方式：**从 `@/api/*` 导出的函数名取真源**，不靠命名约定猜（getXxx 之类）。
      //    按前缀猜会在下一个 `fetchXxx`/`loadXxx` 出现时失效（同 G-03 的 N 变体教训）。
      // 🔴 覆盖 `apiFn(...).then(...).catch(` 形态：作者一样是就地兜底，只是中间过了一手。
      const apiNames = new Set()
      for (const f of walk(join(SRC, 'api'), ['.ts'])) {
        for (const m of readFileSync(f, 'utf8').matchAll(/export (?:async )?(?:const|function) (\w+)/g)) {
          apiNames.add(m[1])
        }
      }
      // 🔴 解析不到任何 API 名 ⇒ 后续 offenders 必为空 ⇒ 恒绿。必须显式失败。
      if (apiNames.size === 0) throw new Error('S-22 未能从 src/api 解析出任何导出函数名 —— 解析器失效')

      const offenders = []
      let scanned = 0
      for (const f of VUE()) {
        const src = readFileSync(f, 'utf8')
        const rel = relative(ROOT, f)
        for (const m of src.matchAll(/(\w+)\s*\(((?:[^()]|\([^()]*\))*)\)\s*([^;\n]*?)\.catch\s*\(/g)) {
          const [, fn, args, chain] = m
          if (!apiNames.has(fn)) continue
          scanned += 1
          if (/silentError/.test(args) || /silentError/.test(chain)) continue
          offenders.push(
            `${rel}:${lineAt(src, m.index)} ${fn}() 链上已 .catch( 就地兜底，但未传 silentError:true —— 拦截器仍会弹全局红条`,
          )
        }
      }
      return { value: offenders.length, detail: `扫描 ${scanned} 处「API 调用 + .catch」，缺 silentError ${offenders.length} 处`, offenders }
    },
  },

  'S-23': {
    title: '每张裸 el-table 必须显式声明业务化空态（否则内置「暂无数据」直达用户）',
    op: 'lte',
    run() {
      // 🔴 缺陷机理（R9 O-04/O-07 实测）：el-table 空数据时回落 Element Plus 内置「暂无数据」。
      //    同一页里三张表写了业务文案、第四张没写（billing/detail 的「缴费计划」），
      //    读者看到的是「暂无数据」——既没说清是什么没有，也没告诉他下一步能做什么
      //    （编辑态表尤其：空表恰是需要「点新增」的那一刻）。
      //
      // 🔴 射程只覆盖**裸 el-table**：TiTable 的空态由组件统一兜底（内置 `#empty` 插槽 + 调用方可覆盖），
      //    列表页按 S-01b 已强制收编 TiTable，其空态是「这一个列表为空」的既定语义 ⇒ 不在此规则内。
      //    否则要把 29 个列表页一起改，且无证据说明那种空态不好（规则只应覆盖它建模的那一种形态）。
      //
      // 🔴 逃生舱：表本身有 v-if 保证「空时不渲染」的（如 customer/detail 的保单表、
      //    product/create 的 `v-if="coverages.length"` 预览表），补 empty-text 是**死代码**——
      //    在那行加 `ui-guard-ignore` 豁免，豁免因此是显式且可审计的。
      const bare = []
      let tiTables = 0
      for (const t of vueTables()) {
        if (/^<TiTable/.test(t.block)) {
          tiTables += 1
          continue
        }
        bare.push(t)
      }
      // 🔴 解析不到任何裸 el-table ⇒ offenders 必为空 ⇒ 恒绿。必须显式失败（同 S-21/S-22）。
      if (bare.length === 0) throw new Error('S-23 未扫到任何裸 el-table —— 表格解析口径已失效，请同步更新本规则')

      const offenders = []
      for (const t of bare) {
        // 开标签必须用引号感知的 openTagRe：`[^>]*` 会在 `@click="() => …"` 的 `>` 处提前截断标签
        const openTag = t.block.match(openTagRe('el-table'))?.[0] ?? ''
        if (/empty-text=/.test(openTag) || /#empty/.test(t.block)) continue
        offenders.push(`${t.file}:${t.line} 裸 el-table 未声明空态 ⇒ 空数据时直达用户的是内置「暂无数据」`)
      }
      return {
        value: offenders.length,
        detail: `裸 el-table ${bare.length} 张（须显式声明空态）/ TiTable ${tiTables} 张（组件统一兜底）`,
        offenders,
      }
    },
  },

  'S-09': {
    title: '内联 max-width 容器宽度取值收敛 ≤ 6 档',
    op: 'lte',
    run() {
      const hits = grep(VUE(), /style="[^"]*max-width\s*:\s*(\d+)px/)
      const dist = distribution(hits, (h) => `${h.groups[1]}px`)
      const vals = [...dist.entries()].sort((a, b) => b[1] - a[1])
      return { value: vals.length, detail: `${hits.length} 处 / ${vals.length} 种`, offenders: vals.map(([v, n]) => `${v} × ${n}`) }
    },
  },

  'S-04': {
    title: '金额列右对齐：align="right" 数量 ≥ 15',
    op: 'gte',
    run() {
      const hits = grep(walk(join(SRC, 'views'), ['.vue']), /align="right"/)
      return { value: hits.length, detail: `${hits.length} 列`, offenders: [] }
    },
  },

  'S-06': {
    title: '分页列表固定表头：设 height/max-height 的列表页 ≥ 20',
    op: 'gte',
    run() {
      const withHeight = LIST_PAGES.filter((p) => {
        const f = join(SRC, p)
        return existsSync(f) && /(?:height|max-height|maxHeight)\s*[=:]/.test(readFileSync(f, 'utf8'))
      })
      return {
        value: withHeight.length,
        detail: `${withHeight.length}/${LIST_PAGES.length} 页设了高度`,
        offenders: [],
      }
    },
  },

  'S-07': {
    title: '详情页头部统一：.detail-header 重复声明 ≤ 1',
    op: 'lte',
    run() {
      const hits = grep(walk(join(SRC, 'views'), ['.vue']), /\.detail-header\s*\{/)
      return { value: hits.length, detail: `${hits.length} 份重复声明`, offenders: hits.map((h) => `${h.file}:${h.line}`) }
    },
  },

  'S-08': {
    title: '表单 label-width 取值收敛 ≤ 3 档',
    op: 'lte',
    run() {
      const hits = grep(VUE(), /label-width="(\d+px)"/)
      const dist = distribution(hits, (h) => h.groups[1])
      const vals = [...dist.entries()].sort((a, b) => b[1] - a[1])
      return { value: vals.length, detail: `${vals.length} 种`, offenders: vals.map(([v, n]) => `${v} × ${n}`) }
    },
  },

  'S-12': {
    title: '上线前清理：登录页演示账号已移除',
    op: 'lte',
    run() {
      const hits = grep(VUE(), /admin123|演示账号/)
      return { value: hits.length, detail: `${hits.length} 处`, offenders: hits.map((h) => `${h.file}:${h.line}`) }
    },
  },

  // ── 表格列宽（2026-09-21 新增，源自 R7-11「全站操作列列宽收敛」）─────────
  //
  // 🔴 为什么必须机械化：46 个操作列此前用了 21 种宽度（70→380），其中 33 个只写 min-width。
  //    手工修一遍只能管到当下——**同一缺陷在 R7-10 修核保工单时就已暴露**（操作列 368px，
  //    列内按钮实需 128px），换一个页面又出现。故把判据固化成规则。
  //
  // 🔴 两条规则的「档位集合」必须**从 TS 真源读出**，guard 侧不得再抄一份数字：
  //    同一组值写两处必然漂移（D-15/D-17 当初各写一套正则，同一份代码报出 226 与 272 两个总数）。

  // ── S-16 / S-17 / S-18 的解析助手见文件上方「表格列解析」段 ──────────────

  'S-16': {
    title: '操作列必须写数字 width，且取值落在 src/constants/table.ts 的档位集合内',
    op: 'lte',
    run() {
      const { tiers, xl } = actionWidthTiers()
      const allowed = [...tiers, xl]
      const bad = []
      for (const t of vueTables()) {
        for (const { tag, line } of blockColumns(t)) {
          if (!isActionCol(tag)) continue
          const w = tag.match(NUM_W)
          if (!w) {
            const why = DYN_W.test(tag) ? '动态绑定 :width' : /min-width="/.test(tag) ? '只写 min-width（EP 判为 flex 列，会吸走表格剩余宽）' : '未声明宽度'
            bad.push(`${t.file}:${line} ${why}`)
          } else if (!allowed.includes(Number(w[1]))) {
            bad.push(`${t.file}:${line} width=${w[1]} 不在档位集合 [${allowed.join(', ')}]`)
          }
        }
      }
      return { value: bad.length, detail: `${bad.length} 个操作列越档`, offenders: bad }
    },
  },

  'S-17': {
    title: '每张表必须保留至少 1 个只写 min-width 的列承接剩余宽（选法见 src/constants/table.ts），否则表格宽=列宽和、右侧留白',
    op: 'lte',
    run() {
      const bad = []
      for (const t of vueTables()) {
        const cols = blockColumns(t)
        if (cols.length < 2) continue // 单列表格无「剩余宽」可言
        // flex 列 = 无数字 width 的列（EP table-layout 的 flexColumns 判定）；动态绑定同样算 flex
        const hasFlex = cols.some(({ tag }) => DYN_W.test(tag) || !NUM_W.test(tag))
        if (!hasFlex) {
          bad.push(`${t.file}:${t.line} 整表 ${cols.length} 列全为数字 width —— EP 走 else 分支把表格宽设为列宽和（table-layout.mjs:123-131），表格比容器窄、右侧留白`)
        }
      }
      return { value: bad.length, detail: `${bad.length} 张表无承接列`, offenders: bad }
    },
  },

  'S-18': {
    title: '操作列档位：SCSS 令牌 $table-action-width-* 必须与 TS 真源逐一相等',
    op: 'lte',
    run() {
      const { tiers, xl } = actionWidthTiers()
      const scss = readFileSync(join(SRC, 'assets/styles/variables.scss'), 'utf8')
      const read = (name) => {
        const m = scss.match(new RegExp(`\\$${name}\\s*:\\s*(\\d+)px`))
        return m ? Number(m[1]) : null
      }
      // 🔴 名字不带 `$`：read() 的正则里已含 `\$`，两处各写一个会变成「要求两个美元符」而永远 null
      const pairs = [
        ['table-action-width-1', tiers[0]],
        ['table-action-width-2', tiers[1]],
        ['table-action-width-3', tiers[2]],
        ['table-action-width-4', tiers[3]],
        ['table-action-width-xl', xl],
      ].map(([name, ts]) => ({ name, ts, scss: read(name) }))
      const bad = pairs.filter((p) => p.ts !== p.scss).map((p) => `$${p.name}: SCSS=${p.scss} ≠ TS=${p.ts}`)
      return { value: bad.length, detail: `${pairs.length} 条比对，${bad.length} 条不一致`, offenders: bad }
    },
  },

  // ── 全程守卫（不属某阶段，始终生效） ─────────────────────────

  'G-01': {
    title: '分页器单一来源：el-pagination 仅出现 1 处',
    op: 'lte',
    run() {
      const hits = grep(VUE(), /<el-pagination/)
      return { value: hits.length, detail: `${hits.length} 处`, offenders: hits.map((h) => `${h.file}:${h.line}`) }
    },
  },

  'G-02': {
    title: '构建零错误（vue-tsc + vite build）—— 由 harness 独立校验，此项仅占位',
    op: 'lte',
    run: () => ({ value: 0, detail: '由 validation.command 直接跑 npm run build', offenders: [] }),
  },

  // 时间列不直出后端 ISO 串（2026-09-18 第三轮新增，源自 ROUND2-CLOSURE §3.1 的机制建议）
  //
  // 🔴 为什么要一条守卫：同一缺陷在 D-501-42 修过一次（underwriting/list 的申请时间），
  //    但**同一张表的相邻列**被漏掉，直到第二轮真机扫描才被发现。手动修一处漏一处 ⇒ 必须机械化。
  //
  // 🔴 判据为什么是「静态形态」而不是「渲染结果」：ISO 是否出现在页面上取决于后端返回值，
  //    静态脚本看不到运行期数据。但反过来说——**裸 prop 列 = 原样直出后端字段**，
  //    只要后端给的是 ISO，页面必然显示 ISO。故把判据定在**前端可控的那一半**：
  //    日期语义的列必须自己格式化，不得把格式化责任推给后端。
  //
  // 🔴 为什么要白名单：部分域的日期字段**确实是纯日期**（实测 `2026-09-15`），
  //    此时接 formatDateTime 反而更糟——它按 Date 解析会补出 `08:00:00` 这种假时间。
  //    故对已实测证伪的字段显式豁免，豁免项必须带实测依据，不可凭印象添加。
  //
  // 🔴 v2 修正（2026-09-18，同轮）：v1 只按 **prop 后缀** `/(?:At|Time|Date)$/` 判定语义，
  //    于是 `label="生效时间"` + `prop="effectiveFrom"` 整个落在可见域之外——真机上
  //    /product/actuarial-workbench 残留 2 格 ISO，而 v1 在工作树上跑出 **0 命中**，
  //    即「空心绿」。根因与 ui-110 判据同源：**正则的枚举方式决定了可见域，看不见 ≠ 不存在**。
  //    修正办法是把语义判据从「字段名」换成**「列标签 / 表单项标签」**——用户读到的就是标签，
  //    `生效时间` 无论后端的字段叫 effectiveFrom 还是 startAt 都是时间语义。
  //    ⚠️ 试过同时放行 `From|To` 后缀，实测立刻产生假阳性（`ageFrom` 标签是「年龄起」，
  //    是区间下界不是时间），故**不加**——时间与否由标签说话，字段名只作补充。
  //
  // 🔴 为什么要覆盖 el-descriptions-item：详情抽屉与表头一样是「只读展示面」，
  //    同样会把 LocalDateTime 原样吐给用户（本轮实测 rate-tables / pricing-plans 各 1 处）。
  //    只扫 el-table-column 会漏掉这一整类载体。
  'G-03': {
    title: '时间列不得直出后端 ISO 串（日期语义列须自行格式化）',
    op: 'lte',
    run() {
      // 纯日期型字段白名单 —— 每项均由真机实测证伪，注释即证据
      const DATE_ONLY = new Set([
        'dueDate', // 到期日：/billing/list 20 行、/billing/detail 20 行实测 0 处 ISO
        'effectiveDate', // 生效日期：/clause/list 20 行实测 0 处 ISO
        'expireAt', // 到期时间：/system/tenant 2 行实测 0 处 ISO
        'paidDate', // 实缴日：与 dueDate 同表同源
      ])
      // 逐条豁免：文件|prop —— 已实测证伪但字段名与时间戳同形，需单独说明
      const EXEMPT = new Map([
        [
          'src/views/clause/list/index.vue|createdAt',
          '条款域实测回传 10 字符日期串（bare 列直出即原文），非 LocalDateTime 序列化形态，接 formatDateTime 会补出假时间',
        ],
        // 🔴 条款域的时间字段**整体**回纯日期串，列表与详情两处均已真机实测：
        //    /clause/list 20 行 → 创建时间 2026-09-15；/clause/detail/225519331448979456
        //    → 创建时间 2026-09-15、更新时间 2026-09-15，页面正文 0 处 ISO。
        //    两者 VO 都声明 LocalDateTime，故这是**后端序列化不一致**（后端问题，见 ROUND3 N7），
        //    前端不得用 formatDateTime 强转——会按 UTC 解析补出 08:00:00 的假时间。
        [
          'src/views/clause/detail/index.vue|createdAt',
          '同上：条款域整体回 10 字符日期串，真机 /clause/detail 实测 2026-09-15，强转会制造假时间',
        ],
        [
          'src/views/clause/detail/index.vue|updatedAt',
          '同上：条款域整体回 10 字符日期串，真机 /clause/detail 实测 2026-09-15，强转会制造假时间',
        ],
      ])
      const DATE_PROP = /(?:At|Time|Date)$/
      // 分支 B 只针对**时间戳**形态（At/Time）：Date 结尾的多为纯日期字段，
      // 页面常写 `row.dueDate || '-'`，不接 formatDateTime 是正当的。
      const STAMP_PROP = /(?:At|Time)$/
      // 语义判据：标签含「时间 / 日期」即认定该列/项在展示时间（v2 新增）
      const TIME_LABEL = /时间|日期/
      // 模板里是**录入控件**而非展示 —— 例如 pricing-plans 的「业务时间」列内嵌 el-date-picker，
      // 它显示的是用户自己选的值，不经 formatDateTime 是正当的
      const EDITOR = /<(el-date-picker|el-time-picker|el-input|el-select|el-input-number|el-switch)\b/
      const DATE_UTIL = /formatDate|formatDateTime/
      const sliceBlock = (src, start, tag) => {
        const openEnd = src.indexOf('>', start)
        if (openEnd === -1) return ''
        // 自闭合（`… />`）无子节点
        if (src.lastIndexOf('/>', openEnd) === openEnd - 1) return src.slice(start, openEnd + 1)
        const c = src.indexOf(`</${tag}>`, openEnd)
        return c === -1 ? src.slice(start, openEnd + 1) : src.slice(start, c + tag.length + 3)
      }
      const offenders = []
      let scanned = 0
      for (const f of VUE()) {
        const rel = relative(ROOT, f)
        const src = readFileSync(f, 'utf8')
        const lineOf = (idx) => src.slice(0, idx).split('\n').length

        // ── 表格列 ──
        for (const m of src.matchAll(/<el-table-column\b/g)) {
          const start = m.index
          const block = sliceBlock(src, start, 'el-table-column')
          const pm = block.match(/\bprop="([^"]+)"/)
          if (!pm) continue
          const prop = pm[1]
          const lm = block.match(/\blabel="([^"]*)"/)
          const label = lm ? lm[1] : ''
          if (!DATE_PROP.test(prop) && !TIME_LABEL.test(label)) continue
          scanned++
          if (DATE_ONLY.has(prop)) continue
          if (EXEMPT.has(`${rel}|${prop}`)) continue
          const line = lineOf(start)
          if (!/#default/.test(block)) {
            // 分支 A：裸列 —— 原样直出字段，后端给 ISO 就显示 ISO
            offenders.push(`${rel}:${line} prop="${prop}" label="${label}"（裸列直出）`)
          } else if (
            !EDITOR.test(block) &&
            !DATE_UTIL.test(block) &&
            (STAMP_PROP.test(prop) || TIME_LABEL.test(label))
          ) {
            // 分支 B：有模板却仍渲染原始时间戳 —— D-501-42 遗漏的正是这种形态
            // （在同一张表里，相邻列一个有模板一个没有，只按分支 A 判会漏掉前者）
            offenders.push(`${rel}:${line} prop="${prop}" label="${label}"（有模板但未经日期工具）`)
          }
        }

        // ── 描述列表项（详情抽屉）──
        // 🔴 判据是**表达式形态**（有无函数调用），不是枚举格式化函数名：
        //    最初写成 /formatDate|formatDateTime/，实测立刻误报 maintenance/workbench 的
        //    `formatCaseEffectiveTime()` —— 它有自己的具名格式化器。凡「按函数名枚举」的判据
        //    都会在下一个人写出第二个格式化器时失效（与 §一 的 N 变体同族）。
        //    形态判据：`{{ a.b }}` / `{{ a?.b || '-' }}` 是**裸字段直出**，无任何加工；
        //    只要出现函数调用，就说明该值经过了加工，交给人工复核即可。
        for (const m of src.matchAll(/<el-descriptions-item\b/g)) {
          const start = m.index
          const lm = src.slice(start, src.indexOf('>', start)).match(/\blabel="([^"]*)"/)
          if (!lm || !TIME_LABEL.test(lm[1])) continue
          const block = sliceBlock(src, start, 'el-descriptions-item')
          scanned++
          const body = block.slice(block.indexOf('>') + 1).replace(/<\/el-descriptions-item>$/, '')
          for (const im of body.matchAll(/\{\{([^}]*)\}\}/g)) {
            const expr = im[1].trim()
            if (/\(/.test(expr)) continue // 有函数调用 = 已加工
            const fm = expr.match(/^([\w$.?[\]]+?)(?:\s*\|\|.*)?$/)
            if (!fm) continue
            const field = fm[1].split(/[.?]/).filter(Boolean).pop()
            if (!field || DATE_ONLY.has(field)) continue
            if (EXEMPT.has(`${rel}|${field}`)) continue
            offenders.push(
              `${rel}:${lineOf(start)} label="${lm[1]}" 字段 ${field}（描述项裸字段直出，无格式化加工）`,
            )
          }
        }
      }
      return {
        value: offenders.length,
        detail: `${offenders.length} 处日期语义载体未自行格式化 / 共扫描 ${scanned} 处`,
        offenders,
      }
    },
  },

  // ── 第四阶段：焦点可见性 / 令牌消费（2026-09-20 第四轮新增） ──────────
  //
  // 🔴 本轮的方法论前提：**计数型判据必须问它数的是不是我交付的那个东西**。
  //    D-02 一直在通过（令牌声明数 88 ≥ 55），而病灶在**消费侧**——令牌表越补越全，
  //    组件里写死的字面量反而越多。故 D-15~D-17 三条全部量「消费」而非「声明」。
  //    同理，F-01~F-03 量的是「有没有绕开正确写法」，不是「正确写法在不在」。

  'F-01': {
    title: '焦点兜底不得用 :where() 降特异性（特异性恒为 0 ⇒ 被 EP 全面压制，等价于永不生效）',
    op: 'lte',
    run() {
      // 🔴 排除注释行：本规则的**说明文字本身**就含 `:where(…):focus-visible` 字样，
      //    不排除的话「解释规则」会被规则本身判违规（第二轮 G-01 两度栽在这里）。
      const hits = grep(VUE_SCSS(), /:where\([^)]*\)\s*:focus-visible/g)
        .filter((h) => !/^(\/\/|\*|\/\*|<!--)/.test(h.text))
      return {
        value: hits.length,
        detail: `${hits.length} 处 :where(...):focus-visible（注释行已排除）`,
        offenders: hits.map((h) => `${h.file}:${h.line} ${h.text.slice(0, 90)}`),
      }
    },
  },

  'F-02': {
    title: '焦点环不得取 --el-color-*-light-*（浅色阶在白底上系统性 <3:1）',
    op: 'lte',
    run() {
      // EP 把 `--el-button-outline-color` 默认派生自 `--el-color-{type}-light-5`，
      // 5 种按钮色在白底实测 1.42~2.75:1（success 最差 1.42）。项目侧不得复用这套浅色阶做焦点环。
      const hits = grep(VUE_SCSS(), /outline(?:-color)?\s*:[^;{}]*--el-color-[a-z]+-light-\d/g)
        .filter((h) => !/^(\/\/|\*|\/\*|<!--)/.test(h.text))
      return {
        value: hits.length,
        detail: `${hits.length} 处焦点环取 EP light 色阶`,
        offenders: hits.map((h) => `${h.file}:${h.line} ${h.text.slice(0, 90)}`),
      }
    },
  },

  'F-03': {
    title: '全量引入 EP 样式时 ElementPlusResolver 必须 importStyle:false（否则 EP CSS 打两份）',
    op: 'lte',
    run() {
      const main = join(SRC, 'main.ts')
      const full = existsSync(main) && readFileSync(main, 'utf8').includes('element-plus/dist/index.css')
      if (!full) return { value: 0, detail: 'main.ts 未全量引入 EP 样式，本规则不适用', offenders: [] }
      const cfgPath = join(ROOT, 'vite.config.ts')
      if (!existsSync(cfgPath)) return { value: 1, detail: 'vite.config.ts 不存在', offenders: ['vite.config.ts 缺失'] }
      const cfg = readFileSync(cfgPath, 'utf8')
      const calls = [...cfg.matchAll(/ElementPlusResolver\s*\(([^)]*)\)/g)].map((m) => m[1])
      // 剥离注释再判：importStyle:false 若只出现在注释里不算数（同 F-01 的口径）
      const bad = calls.filter((a) => !/importStyle\s*:\s*false/.test(a.replace(/\/\/[^\n]*/g, '')))
      return {
        value: bad.length,
        detail: `main.ts 已全量引入 EP 样式；ElementPlusResolver 共 ${calls.length} 处，缺 importStyle:false 的 ${bad.length} 处`,
        offenders: bad.map((a) => `ElementPlusResolver(${a.trim()})`),
      }
    },
  },

  'A-01': {
    title: 'Skip Link 与主内容落点成对存在（侧栏靠 tabindex 提供键盘可达的必备补偿）',
    op: 'lte',
    run() {
      const layout = join(SRC, 'layouts/AppLayout.vue')
      if (!existsSync(layout)) return { value: 1, detail: 'AppLayout.vue 不存在', offenders: ['缺失'] }
      const src = readFileSync(layout, 'utf8')
      const bad = []
      // ① 跳转链接本体：href 指向 #main-content
      if (!/class="skip-link"/.test(src) || !/href="#main-content"/.test(src)) {
        bad.push('AppLayout.vue 缺少 <a class="skip-link" href="#main-content">')
      }
      // ② 落点：id 与 tabindex="-1" 必须同时存在。只写 id 不写 tabindex，浏览器不会移动焦点
      if (!/id="main-content"/.test(src) || !/tabindex="-1"[^>]*id="main-content"|id="main-content"[^>]*tabindex="-1"/.test(src)) {
        bad.push('AppLayout.vue 的 #main-content 落点缺 id 或 tabindex="-1"（缺 tabindex 则焦点不移动）')
      }
      // ③ 前提判据：侧栏是否仍在给 <li> 补 tabindex。补了才需要跳转链接；一旦侧栏改用原生控件
      //    （不再需要 tabindex），这条规则的**理由**就消失了，届时应连同跳转链接一起重新评估。
      const side = join(SRC, 'layouts/components/Sidebar.vue')
      const sidebarNeedsIt = existsSync(side) && /tabindex="0"/.test(readFileSync(side, 'utf8'))
      if (!sidebarNeedsIt) {
        bad.push('Sidebar.vue 已不再用 tabindex 补键盘可达 ⇒ 跳转链接的存在理由需重新评估（不是缺陷，是需要重新决策）')
      }
      return {
        value: bad.length,
        detail: bad.length
          ? '跳转链接与落点契约不完整'
          : '跳转链接 + #main-content 落点齐备，侧栏仍以 tabindex 提供键盘可达 ⇒ 契约成立',
        offenders: bad,
      }
    },
  },
  'D-15': {
    title: '令牌消费率 ≥（引用令牌 ÷ (引用令牌+字面量)），字号/间距/圆角/字重四族合计',
    op: 'gte',
    run() {
      let tok = 0
      let lit = 0
      // 分族计数：报告与守卫引同一份数字，避免「文档一套、守卫一套」（本轮反复出现的坑）
      const per = new Map()
      eachTokenDecl((v, decl) => {
        const s = per.get(decl.family) ?? { tok: 0, lit: 0 }
        if (v.startsWith('$')) { tok++; s.tok++ } // 简写多值如 `padding: $space-2 $space-4` 也算引用
        else if (decl.num ? /^\d+$/.test(v) : LENGTH_LITERAL.test(v)) { lit++; s.lit++ }
        per.set(decl.family, s)
      })
      const total = tok + lit
      const rate = total ? Math.round((tok / total) * 1000) / 10 : 0
      const byFamily = [...per.entries()].map(([f, s]) => {
        const t = s.tok + s.lit
        return `${f} ${s.tok}/${t}（${t ? Math.round((s.tok / t) * 1000) / 10 : 0}%）`
      }).join('｜')
      return {
        value: rate,
        detail: `引用令牌 ${tok} / 写死字面量 ${lit}（合计 ${total}）⇒ 消费率 ${rate}%｜${byFamily}`,
        offenders: [],
      }
    },
  },

  'D-16': {
    title: '零引用令牌数（定义了却全站无人引用 ⇒ 要么删、要么补用例）',
    op: 'lte',
    run() {
      const defsFile = join(SRC, 'assets/styles/variables.scss')
      if (!existsSync(defsFile)) return { value: 0, detail: 'variables.scss 不存在', offenders: [] }
      const defs = [...readFileSync(defsFile, 'utf8').matchAll(/^\s*\$([\w-]+)\s*:/gm)].map((m) => m[1])
      const used = new Set()
      for (const p of VUE_SCSS()) {
        if (p === defsFile) continue
        for (const raw of lines(p)) {
          if (/^(\/\/|\*|\/\*|<!--)/.test(raw.trim())) continue // 注释里的提及不算引用
          for (const m of raw.matchAll(/\$([\w-]+)/g)) used.add(m[1])
        }
      }
      const zero = defs.filter((d) => !used.has(d))
      return {
        value: zero.length,
        detail: `${zero.length}/${defs.length} 个令牌零引用`,
        offenders: zero,
      }
    },
  },

  'D-17': {
    title: '字面量命中档位次数（值恰好等于**同族**已定义令牌，却被写死）',
    op: 'lte',
    run() {
      const defsFile = join(SRC, 'assets/styles/variables.scss')
      // 令牌按「名字前缀 → 该族可用取值集合」建索引，命中判定只在同族内进行
      const byPrefix = new Map()
      for (const d of TOKEN_DECL_RE) for (const pre of d.prefix) byPrefix.set(pre, new Set())
      for (const [, name, num, unit] of readFileSync(defsFile, 'utf8')
        .matchAll(/^\s*\$([\w-]+)\s*:\s*(\d+(?:\.\d+)?)(px)?\s*;/gm)) {
        for (const [pre, set] of byPrefix) if (name.startsWith(pre)) set.add(unit ? `${num}px` : num)
      }
      const valsFor = (decl) => {
        const merged = new Set()
        for (const pre of decl.prefix) for (const v of byPrefix.get(pre) ?? []) merged.add(v)
        return merged
      }
      let hit = 0
      let out = 0
      const samples = []
      const hitVals = new Map()
      const outVals = new Map()
      const fam = new Map()
      eachTokenDecl((v, decl, p, line) => {
        const m = decl.num ? v.match(/^(\d+)$/) : v.match(/^(-?\d+(?:\.\d+)?(?:px|rem|em))$/)
        if (!m) return // 简写多值、var()、calc() 等一律不计，保证分母＝D-15 的字面量数
        const s = fam.get(decl.family) ?? { hit: 0, out: 0 }
        const vals = valsFor(decl)
        if (vals.has(m[1])) {
          hit++
          s.hit++
          hitVals.set(`${decl.family} ${m[1]}`, (hitVals.get(`${decl.family} ${m[1]}`) ?? 0) + 1)
          if (samples.length < 8) samples.push(`${relative(ROOT, p)}:${line} ${m[1]}（应改用令牌）`)
        } else {
          out++
          s.out++
          outVals.set(`${decl.family} ${m[1]}`, (outVals.get(`${decl.family} ${m[1]}`) ?? 0) + 1)
        }
        fam.set(decl.family, s)
      })
      const total = hit + out
      const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([k, x]) => `${k}×${x}`).join('、')
      const byFamily = [...fam.entries()].map(([f, s]) => {
        const t = s.hit + s.out
        return `${f} ${s.hit}/${t}（${t ? Math.round((s.hit / t) * 1000) / 10 : 0}%）`
      }).join('｜')
      return {
        value: hit,
        detail: `命中同族档位 ${hit} 处 / 无档可依 ${out} 处（合计 ${total}）⇒ ${total ? Math.round((hit / total) * 1000) / 10 : 0}% 的字面量是「有档不用」`
          + `｜${byFamily}｜高频：${top(hitVals, 8)}｜缺档：${top(outVals, 8)}`,
        offenders: samples,
      }
    },
  },

  // ── 交互反馈类（第四轮 UI 走查新增，源自 ROUND4-FINDINGS §8.1）────────
  //
  // 缺陷形态：**点击后界面毫无变化**。写接口在途的那几秒里，按钮不转圈、表格不刷新、
  // 没有任何提示，用户自然会以为没点中而重复点击——而这类动作多是**状态推进**
  // （审批/发布/退役/启用禁用/提交审批），重复提交的代价是同一版本被反复推状态。
  //
  // 🔴 为什么必须是守卫而不是「记得加」：本轮同一缺陷在 12 个文件里各出现一次，
  //    合计 40+ 个按钮。它不是某个人的疏忽，而是**一个从未被写下来的默认**——
  //    加 pending 是本轮才确立的范式，此前 25 个页面各写各的。
  //    凡是「新确立的默认」，都必须机械化为构建期约束，否则下一轮同样会漂移回去。
  //
  // 🔴 判据覆盖的载体（三种，都是「点下去会写后端」的地方）：
  //    ① `<el-button @click="fn(...)">`  —— 最常见的平铺按钮
  //    ② `<el-dropdown @command="fn">` 的**触发器**按钮 —— 下拉项无法各自绑 loading，
  //       只能绑在触发器上表示「本行有动作在途」（clause / product / workbench 等 5 处）
  //    ③ `<el-switch @change="fn(...)">` —— 开关式状态推进
  //
  // 🔴 已知盲区（**显式写出，避免把「没扫到」误当成「不存在」**，与 ui-110 同源教训）：
  //    · 内联箭头 `@click="() => foo()"` 与多语句表达式不解析，不在判据内；
  //    · 仅当处理函数**能追到**写接口才判定（闭包深度 ≤3）。动态查表（如
  //      `actions.find(a => a.value === x)` 取到的 perm/label）不追；
  //    · 「有 loading」不等于「loading 归属正确」——一行多个动作按钮必须用
  //      `actionKey(主键, 动作名)` 区分，否则两个按钮一起转圈（本轮在 system/user
  //      上真实发生过）。归属正确性只能靠 `actionKey` 的使用来保证，静态不可判。
  'I-01': {
    title: '写操作按钮必须有在途反馈（:loading 绑定，避免「点了没反应」导致重复提交）',
    op: 'lte',
    run() {
      const writes = apiWriteFns()
      const offenders = []
      let checked = 0
      let dropdowns = 0

      for (const p of VUE()) {
        const src = readFileSync(p, 'utf8')
        const range = templateRange(src)
        if (!range) continue
        const [ts, te] = range
        const tpl = src.slice(ts, te)

        // 局部函数 → 是否（传递地）调用写接口。memo 先置 false 兼作环检测。
        //
        // 🔴 判定用「**引用**」而非「调用」：本仓的下拉分派统一写成**分派表**
        //    （`const handlers = { submit: handleSubmit, … }` 然后 `handlers[cmd]?.(row)`），
        //    表里的 `handleSubmit` 是**裸函数引用、没有括号**。只认 `name(` 会让整个
        //    分派链路断在表上——product/list、pricing-plans、workbench 三个页面的下拉
        //    因此整体落在视野外，而它们恰好都是「提交/通过/驳回/下架」这类状态推进。
        //    为控制误报，引用只在**本文件已定义的局部函数名**集合内匹配（不是任意标识符），
        //    且先剥掉注释——注释里提到的函数名不算引用。
        const localFns = new Set(
          [...src.matchAll(/(?:\bconst|\blet|\bfunction)\s+([A-Za-z_$][\w$]*)\s*[:=(]/g)].map((m) => m[1]),
        )
        const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        const refsName = (body, n) => new RegExp(`(?<![.\\w$])${n}(?![\\w$])`).test(body)

        const memo = new Map()
        const isWrite = (name, depth = 0) => {
          if (depth > 3) return false
          if (memo.has(name)) return memo.get(name)
          memo.set(name, false)
          const body = bodyOf(src, name)
          let hit = body !== null && callsAny(body, writes)
          if (!hit && body) {
            const code = stripComments(body)
            for (const local of localFns) {
              if (local === name || writes.has(local) || !refsName(code, local)) continue
              if (isWrite(local, depth + 1)) { hit = true; break }
            }
          }
          memo.set(name, hit)
          return hit
        }

        /**
         * 取标签上 @click / @command / @change 的处理函数名；无法归到单一函数时返回 null。
         *
         * 🔴 必须同时认两种写法，缺一会造成**空心绿**：
         *   ① `@command="operate"` / `@click="handleSubmit(row)"` —— 直接命名
         *   ② `@command="(action: string) => operate(row, action)"` —— 内联箭头包一层
         * 第一版只认 ①，结果全站 6 个下拉只认出 1 个，另外 5 个（clause / product /
         * regulatory / workbench / configuration / pricing-plans，全都是 ②）连**扫都没扫到**，
         * 规则却报「全部达标」。判据的**可见域**必须覆盖实际写法，否则绿是假的。
         *
         * 🔴 箭头只取**紧跟 `=>` 的**首个调用，故 `(e) => e.stopPropagation()` 返回 null
         * （前缀锚定使 `stopPropagation` 不可能被当作函数名）——这类事件处理不是业务动作。
         */
        const handlerOf = (tag, attr) => {
          const m = tag.match(new RegExp(`@${attr}(?:\\.\\w+)*\\s*=\\s*"([^"]*)"`))
          if (!m) return null
          const expr = m[1]
          const direct = expr.match(/^\s*([A-Za-z_$][\w$]*)\s*\(/) ?? expr.match(/^\s*([A-Za-z_$][\w$]*)\s*$/)
          if (direct) return direct[1]
          const arrow = expr.match(/=>\s*(?:\{\s*)?([A-Za-z_$][\w$]*)\s*\(/)
          return arrow?.[1] ?? null
        }

        // ① 平铺按钮 / ② 开关
        for (const m of tpl.matchAll(openTagRe('el-button|el-switch'))) {
          const tag = m[0]
          const fn = handlerOf(tag, 'click') ?? handlerOf(tag, 'change')
          if (!fn || !isWrite(fn)) continue
          checked++
          if (!/:loading\s*=/.test(tag)) {
            offenders.push(`${relative(ROOT, p)}:${lineAt(src, ts + m.index)} <${m[1]}> ${fn}() 无 :loading`)
          }
        }

        // ③ 下拉触发器：loading 只能绑在触发它的按钮上，故查下拉之后的首个 el-button
        for (const m of tpl.matchAll(openTagRe('el-dropdown'))) {
          const fn = handlerOf(m[0], 'command')
          if (!fn || !isWrite(fn)) continue
          dropdowns++
          const after = tpl.slice(m.index + m[0].length)
          // 触发器按钮同样用引号感知口径：`@click="() => …"` 里的 `>` 会截断 `[^>]*`，
          // 截断点之后的 `:loading` 就看不见了（把有反馈误判成无反馈）
          const btn = after.match(openTagRe('el-button'))
          if (!btn) continue
          if (!/:loading\s*=/.test(btn[0])) {
            offenders.push(`${relative(ROOT, p)}:${lineAt(src, ts + m.index)} <el-dropdown> 触发器按钮无 :loading（${fn}）`)
          }
        }
      }

      return {
        value: offenders.length,
        detail: `写操作载体 ${checked} 个按钮/开关 + ${dropdowns} 个下拉触发器，其中无在途反馈 ${offenders.length} 个`,
        offenders,
      }
    },
  },

  'I-02': {
    title: '可达写接口的视图必须有权限门（不得靠后端 403 兜底）',
    op: 'lte',
    run() {
      const writes = apiWriteFns()
      const offenders = []
      let scanned = 0

      // 🔴 判据的**看得见什么**（与 I-01 同一套闭包机器，故意的：两条规则对「什么是写动作」
      //    必须同口径，否则会出现「I-01 认为在写、I-02 认不出来」的缝）。
      //
      // 🔴 为什么判**文件级**而非**元素级**：本轮实测 8 个零门页（理赔配置中心整页、
      //    理赔详情 8 个动作、核保决策、条款编辑、产品创建/修订/模板配置）**共同特征就是
      //    「整个文件一处权限门都没有」**；而「五个按钮里漏了一个」这类缺陷，由
      //    tests/permission-gate-contracts.test.mjs 按端点逐个钉死（那里有后端 @PreAuthorize
      //    作权威可比对，能分清 claim:survey 与 claim:settle，本文件级的正则分不清）。
      //    元素级门禁判据在本仓有**三种合法形状**——`v-permission`、带 `hasPermission()` 的
      //    `v-if`、以及动作清单按权限过滤（claim/policy 详情页用 `filter(a => hasPermission(...))`）
      //    ——第三种在正则里无法与「恰好遍历一个列表」区分，硬判会大量误报。
      //    一条被假阳性淹没的守卫会立刻失去信任（I-01 的教训），故此处刻意取窄而准。
      for (const p of VUE()) {
        const src = readFileSync(p, 'utf8')
        const range = templateRange(src)
        if (!range) continue
        const tpl = src.slice(range[0], range[1])

        // 局部函数 → 是否（传递地）调用写接口；与 I-01 同款引用式闭包（下拉分派表里
        // 的函数是裸引用、没有括号，只认 `name(` 会让整条分派链断在表上）
        const localFns = new Set(
          [...src.matchAll(/(?:\bconst|\blet|\bfunction)\s+([A-Za-z_$][\w$]*)\s*[:=(]/g)].map((m) => m[1]),
        )
        const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        const refsName = (body, n) => new RegExp(`(?<![.\\w$])${n}(?![\\w$])`).test(body)

        const memo = new Map()
        const isWrite = (name, depth = 0) => {
          if (depth > 3) return false
          if (memo.has(name)) return memo.get(name)
          memo.set(name, false)
          const body = bodyOf(src, name)
          let hit = body !== null && callsAny(body, writes)
          if (!hit && body) {
            const code = stripComments(body)
            for (const local of localFns) {
              if (local === name || writes.has(local) || !refsName(code, local)) continue
              if (isWrite(local, depth + 1)) {
                hit = true
                break
              }
            }
          }
          memo.set(name, hit)
          return hit
        }

        const handlerOf = (tag, attr) => {
          const m = tag.match(new RegExp(`@${attr}(?:\\.\\w+)*\\s*=\\s*"([^"]*)"`))
          if (!m) return null
          const expr = m[1]
          const direct = expr.match(/^\s*([A-Za-z_$][\w$]*)\s*\(/) ?? expr.match(/^\s*([A-Za-z_$][\w$]*)\s*$/)
          if (direct) return direct[1]
          const arrow = expr.match(/=>\s*(?:\{\s*)?([A-Za-z_$][\w$]*)\s*\(/)
          return arrow?.[1] ?? null
        }

        let reachesWrite = false
        for (const m of tpl.matchAll(openTagRe('el-button|el-switch|el-dropdown|el-menu-item|el-upload'))) {
          const fn =
            handlerOf(m[0], 'click') ?? handlerOf(m[0], 'change') ?? handlerOf(m[0], 'command')
          if (fn && isWrite(fn)) {
            reachesWrite = true
            break
          }
        }
        if (!reachesWrite) continue

        scanned++
        if (!/\bv-permission\b|hasPermission\(/.test(src)) {
          offenders.push(`${relative(ROOT, p)} 可达写接口但整文件无权限门`)
        }
      }

      return {
        value: offenders.length,
        detail: `可达写接口的视图 ${scanned} 个，其中无任何权限门 ${offenders.length} 个`,
        offenders,
      }
    },
  },
}

// ─────────────────────────── 主流程 ───────────────────────────

const CONFIG = existsSync(join(ROOT, 'scripts/ui-guard.config.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'scripts/ui-guard.config.json'), 'utf8'))
  : { targets: {} }

const argv = process.argv.slice(2)
const ruleArg = argv.find((a) => a.startsWith('--rule='))?.split('=')[1]
const asJson = argv.includes('--json')
const listOnly = argv.includes('--list')

const CMP = {
  lte: (v, t) => v <= t,
  gte: (v, t) => v >= t,
  eq: (v, t) => v === t,
}

function evaluate(id) {
  const rule = RULES[id]
  const t = CONFIG.targets?.[id] ?? { op: rule.op, value: 0 }
  const op = t.op ?? rule.op
  let res
  try {
    res = rule.run()
  } catch (e) {
    res = { value: NaN, detail: `规则执行异常: ${e.message}`, offenders: [] }
  }
  const pass = CMP[op] ? CMP[op](res.value, t.value) : false
  return { id, title: rule.title, op, target: t.value, ...res, pass }
}

const ids = ruleArg ? [ruleArg] : Object.keys(RULES)
const results = ids.map(evaluate)

if (asJson) {
  console.log(JSON.stringify(results, null, 2))
} else if (listOnly) {
  console.log('\n规则清单（当前实测值 vs 目标）\n' + '─'.repeat(78))
  for (const r of results) {
    const sym = r.pass ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m'
    console.log(`${sym} ${r.id.padEnd(6)} ${r.title}`)
    console.log(`        实测 ${r.value} ${r.op === 'lte' ? '≤' : r.op === 'gte' ? '≥' : '='} 目标 ${r.target}   ${r.detail}`)
    if (!r.pass && r.offenders.length) {
      for (const o of r.offenders.slice(0, 8)) console.log(`        · ${o}`)
      if (r.offenders.length > 8) console.log(`        · …另有 ${r.offenders.length - 8} 项`)
    }
  }
  console.log('─'.repeat(78))
} else {
  for (const r of results) {
    if (r.pass) continue
    console.log(`FAIL ${r.id}: ${r.title}`)
    console.log(`     实测 ${r.value}, 目标 ${r.op === 'lte' ? '≤' : r.op === 'gte' ? '≥' : '='} ${r.target} —— ${r.detail}`)
    for (const o of r.offenders.slice(0, 12)) console.log(`     · ${o}`)
  }
  const failed = results.filter((r) => !r.pass)
  console.log(
    failed.length
      ? `\n${failed.length}/${results.length} 条规则未达标`
      : `\n全部 ${results.length} 条规则达标`,
  )
}

process.exit(results.every((r) => r.pass) ? 0 : 1)
