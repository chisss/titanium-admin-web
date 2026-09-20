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
      // 🔴 真实标记顺序是 label 在前、class-name="ti-action-column" 在后，
      // 故不能假设 class 先出现；先取整行 <el-table-column> 再从中提宽度。
      const cols = grep(VUE(), /<el-table-column[^>]*label="操作"[^>]*>/)
      const dist = new Map()
      for (const c of cols) {
        const m = c.match.match(/(?:min-)?width="(\d+)"/)
        const k = m ? `${m[1]}px` : '(未设宽度)'
        dist.set(k, (dist.get(k) ?? 0) + 1)
      }
      const vals = [...dist.entries()].sort((a, b) => b[1] - a[1])
      return {
        value: vals.length,
        detail: `共 ${cols.length} 个操作列 / ${vals.length} 种宽度`,
        offenders: vals.map(([v, n]) => `${v} × ${n}`),
      }
    },
  },

  'S-01c': {
    title: '操作列统一使用 .ti-action-column（间距与换行保护）',
    op: 'eq',
    run() {
      const cols = grep(VUE(), /<el-table-column[^>]*label="操作"[^>]*>/)
      const ok = cols.filter((c) => c.match.includes('ti-action-column'))
      return {
        value: ok.length,
        detail: `${ok.length}/${cols.length} 操作列已采用`,
        offenders: cols
          .filter((c) => !c.match.includes('ti-action-column'))
          .map((c) => `${c.file}:${c.line}`),
      }
    },
  },

  'S-15': {
    title: '操作列内一律常规按钮（禁止 el-button link）',
    op: 'lte',
    run() {
      // 🔴 判据形状：**先配对「操作列」区间，再在区间内找 el-button**。
      //    全文件 grep `el-button … link` 会把**对话框/抽屉内联可编辑表**里的「删除」
      //    「+ 新增一行」也计进来 —— 那是另一类载体（无 `label="操作"` 列），本仓刻意保留 link。
      // 🔴 必须用 `openTagRe`（引号感知）：`[^>]*` 会在 `@click="() => …"` 的 `>` 处**提前截断标签**，
      //    其后的 `link` 属性一并消失 —— 实测该写法会让 48 个 dropdown 只认出 1 个（见 I-01 同名教训）。
      const offenders = []
      let total = 0
      for (const f of VUE()) {
        const src = lines(f).join('\n')
        for (const col of src.matchAll(openTagRe('el-table-column'))) {
          if (!/label="操作"/.test(col[0])) continue
          const inner = src.slice(col.index + col[0].length)
          const end = inner.indexOf('</el-table-column>')
          if (end < 0) continue
          const line0 = lineAt(src, col.index)
          for (const btn of inner.slice(0, end).matchAll(openTagRe('el-button'))) {
            total += 1
            if (/(?<![\w-])link(?![\w-])/.test(btn[0])) {
              offenders.push(`${relative(ROOT, f)}:${line0} ${btn[0].replace(/\s+/g, ' ').slice(0, 90)}`)
            }
          }
        }
      }
      return {
        value: offenders.length,
        detail: `操作列内按钮 ${total} 个，其中 link ${offenders.length} 个`,
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
