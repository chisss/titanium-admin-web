import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

import './ts-resolve-hook.mjs'

// 🔴 断点「CSS 侧 / JS 侧」一致性 —— 本文件测的是一类**静默失效**的缺陷。
//
// 现场：CSS 侧有 4 种断点取值（767/600/900/680），JS 侧 6 个组件一律
// `useMediaQuery('(max-width: 767px)')`。两边不一致时不报错、不崩溃，
// 只在 601–767px 之间呈现「JS 认为已是窄屏（侧边栏收成图标栏）、CSS 却没切布局」的错位。
//
// ⚠️ 为什么不能共用一份定义：`@media` 查询中**不允许**用 `var(--x)`，
// 而 SCSS 变量编译期内联、JS 运行时读不到——两者物理上无法共享一份值。
// 故此处用测试锁住「镜像必须相等」，而不是声称已消除双写。

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const VARS = join(SRC, 'assets/styles/variables.scss')

/** 从 variables.scss 取断点令牌的像素值 */
function scssBreakpoints() {
  const src = readFileSync(VARS, 'utf8')
  const m = new Map()
  for (const hit of src.matchAll(/^\s*(\$breakpoint-[a-z0-9-]+)\s*:\s*(\d+)px/gm)) {
    m.set(hit[1], Number(hit[2]))
  }
  return m
}

/** 递归收集源码文件 */
function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, exts, out)
    else if (exts.includes(extname(name))) out.push(full)
  }
  return out
}

/** 源码行（剔除注释行——注释里举的反例不是真实的断点） */
function codeLines(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
}

const { BREAKPOINT_MOBILE, MEDIA_MAX_MOBILE } = await import('../src/constants/layout.ts')

test('① JS 常量与 SCSS 令牌同值（任一侧改了没跟上即失败）', () => {
  const bp = scssBreakpoints()
  assert.ok(bp.has('$breakpoint-mobile'), 'variables.scss 缺少 $breakpoint-mobile')
  assert.equal(
    BREAKPOINT_MOBILE,
    bp.get('$breakpoint-mobile'),
    'src/constants/layout.ts 的 BREAKPOINT_MOBILE 与 SCSS $breakpoint-mobile 不一致——' +
      'CSS 与 JS 会各自认为窄屏是另一个宽度，页面在中间区间错位',
  )
})

test('② 查询串由常量拼出，不得出现第二份字面量', () => {
  assert.equal(
    MEDIA_MAX_MOBILE,
    `(max-width: ${BREAKPOINT_MOBILE}px)`,
    'MEDIA_MAX_MOBILE 必须由 BREAKPOINT_MOBILE 派生，否则改数字要改两处',
  )
})

test('③ 断点阶梯有序且不重复（重复档位＝假档位）', () => {
  const bp = scssBreakpoints()
  const vals = [...bp.values()]
  assert.ok(vals.length >= 2, `断点令牌仅 ${vals.length} 个，阶梯不完整`)
  assert.equal(new Set(vals).size, vals.length, `断点取值有重复：${vals.join(', ')}`)
  assert.ok(
    bp.get('$breakpoint-mobile') < bp.get('$breakpoint-narrow'),
    'mobile 必须小于 narrow，否则媒体查询的层叠顺序失去意义',
  )
})

test('④ JS 侧不得再写字面量断点', () => {
  const offenders = []
  for (const f of walk(SRC, ['.vue', '.ts'])) {
    codeLines(f).forEach((line, i) => {
      // 🔴 必须要求**括号包裹**：媒体查询串的形态是 `(max-width: 767px)`，
      // 而模板内联样式 `style="max-width: 640px"` 没有括号——后者是 S-09 的收敛对象，
      // 不是断点。不加这层区分会误报所有内联宽度。
      if (/\(\s*(?:max|min)-width:\s*\d+px\s*\)/.test(line)) {
        offenders.push(`${relative(ROOT, f)}:${i + 1}  ${line.trim().slice(0, 80)}`)
      }
    })
  }
  assert.deepEqual(offenders, [], 'JS 里写死了断点像素值——应改用 @/constants/layout 的常量')
})

test('⑤ CSS 侧断点全部走令牌（防漏网字面量）', () => {
  const offenders = []
  let tokenized = 0
  for (const f of walk(SRC, ['.vue', '.scss'])) {
    codeLines(f).forEach((line, i) => {
      if (!/@media[^{]*?(max|min)-width/.test(line)) return
      if (/(max|min)-width\s*:\s*\$breakpoint-[a-z0-9-]+/.test(line)) tokenized++
      else offenders.push(`${relative(ROOT, f)}:${i + 1}  ${line.trim().slice(0, 80)}`)
    })
  }
  assert.deepEqual(offenders, [], '媒体查询用了字面量断点——应改用 $breakpoint-* 令牌')
  // 🔴 非空转证明：扫描本身必须扫到东西。正则写坏时上面为空是真、下面这条会先失败。
  // 阈值取 2026-09-17 实测值 16（收敛后不再新增，留 2 的余量）。
  assert.ok(tokenized >= 14, `仅扫到 ${tokenized} 处令牌化断点，疑扫描失效`)
})
