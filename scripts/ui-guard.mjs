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
      const hits = grep(VUE_SCSS(), new RegExp(`(${BLACK.join('|')})`, 'gi'))
      const dist = distribution(hits, (h) => h.match.toLowerCase())
      return {
        value: hits.length,
        detail: `${hits.length} 处 / ${dist.size} 种色值`,
        offenders: [...dist.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} × ${n}`),
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
      const hits = grep(walk(join(SRC, 'assets/styles'), ['.scss']), /:focus-visible/)
      return { value: hits.length, detail: `${hits.length} 处声明`, offenders: [] }
    },
  },

  'D-09': {
    title: '危险确认按钮使用 danger 色（confirmButtonClass 覆盖）',
    op: 'gte',
    run() {
      const hits = grep(VUE(), /confirmButtonClass/)
      return { value: hits.length, detail: `${hits.length} 处`, offenders: [] }
    },
  },

  'D-11': {
    title: 'CSS 断点取值收敛 ≤ 3 种',
    op: 'lte',
    run() {
      const hits = grep(VUE_SCSS(), /@media[^{]*?(?:max|min)-width\s*:\s*(\d+)px/g)
      const dist = distribution(hits, (h) => `${h.groups[1]}px`)
      const vals = [...dist.entries()].sort((a, b) => b[1] - a[1])
      return {
        value: vals.length,
        detail: `${vals.length} 种断点`,
        offenders: vals.map(([v, n]) => `${v} × ${n}`),
      }
    },
  },

  'D-12': {
    title: 'i18n 已从前端移除',
    op: 'lte',
    run() {
      const hits = grep(ALL_TS(), /vue-i18n|useI18n|\$t\(/)
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
      const hasDep = !!(pkg.dependencies?.['vue-i18n'] || pkg.devDependencies?.['vue-i18n'])
      const localesDir = existsSync(join(SRC, 'locales'))
      return {
        value: hits.length + (hasDep ? 1 : 0) + (localesDir ? 1 : 0),
        detail: `${hits.length} 处代码引用 / package.json ${hasDep ? '仍含' : '已移除'} / locales 目录 ${localesDir ? '仍存在' : '已移除'}`,
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
