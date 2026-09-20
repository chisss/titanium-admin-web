import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

// 🔴 CSS 变量引用必须是**可解析的** —— 本文件是 D-03「幻影令牌」的同类防线。
//
// D-03 的现场：`var(--ti-text-secondary, #86909c)` 引用的变量全仓 0 处定义，
// 因为有 fallback 所以视觉无异常，10 处代码在断言一个不存在的东西。
// 本条测试把同一类缺陷推广到**全部** CSS 变量引用：
//  ・样式块里的 `var(--x)`  → 写错时静默走 fallback 或继承
//  ・内联 style 里的 `var(--x)` → 写错时整条声明无效（颜色直接丢）
//  ・JS 里的 `cssVar('--x')`  → 写错时返回**空串**，图表拿到空色值，连告警都没有
// 三者共同点：错了不报错。故用测试锁住。

const ROOT = new URL('..', import.meta.url).pathname

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, exts, out)
    else if (exts.includes(extname(name))) out.push(full)
  }
  return out
}

/**
 * 收集「某处定义了 --x」的变量名集合。
 * 来源有二：① 本项目 scss 中的声明；② EP 自带的 theme-chalk（--el-* 全在这里）。
 * 二者合起来才是运行时可解析的全集。
 */
function definedVars() {
  const sources = [
    ...walk(join(ROOT, 'src'), ['.scss', '.vue']).map((f) => readFileSync(f, 'utf8')),
    readFileSync(join(ROOT, 'node_modules/element-plus/theme-chalk/index.css'), 'utf8'),
  ]
  const names = new Set()
  for (const src of sources) {
    for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:/gi)) names.add(m[1])
  }
  return names
}

/** 收集源码中所有 CSS 变量**引用**，区分三种形态以便定位 */
function referencedVars() {
  const refs = []
  for (const f of walk(join(ROOT, 'src'), ['.scss', '.vue', '.ts'])) {
    const rel = relative(ROOT, f)
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const t = line.trim()
      // 跳过注释行：文档里举例的 `var(--x)` 不是引用（cssVar.ts 的 JSDoc 即如此）
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
      // 跳过定义行（`--x: value`）——那是声明不是引用
      const stripped = line.replace(/(--[a-z0-9-]+)\s*:/gi, '')
      for (const m of stripped.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        refs.push({ file: rel, line: i + 1, name: m[1], via: 'var()' })
      }
      for (const m of line.matchAll(/cssVar\(\s*['"](--[a-z0-9-]+)['"]/gi)) {
        refs.push({ file: rel, line: i + 1, name: m[1], via: 'cssVar()' })
      }
    })
  }
  return refs
}

test('① 无幻影变量：每个被引用的 CSS 变量都有定义', () => {
  const defined = definedVars()
  const ghosts = referencedVars().filter((r) => !defined.has(r.name))
  assert.deepEqual(
    ghosts.map((g) => `${g.file}:${g.line}  ${g.name} (${g.via})`),
    [],
    '引用了未定义的 CSS 变量——错了不会报错，只会静默失效',
  )
})

test('② 引用确实被扫到了（防止正则失效导致本文件假绿）', () => {
  const refs = referencedVars()
  // 阈值取自 2026-09-17 实测（本项目以 SCSS 令牌为主，var() 用量本就少：
  // 44 处 var(--*) 引用，扣掉 2 处注释后为 42，外加 5 处 cssVar()）。
  // 取 30 是留出正常增删空间、又不至于让正则写坏时仍能蒙混过关。
  // 若扫描失效导致 ① 在「零引用」上空转通过，这条会先失败。
  assert.ok(refs.length > 30, `引用数 ${refs.length} 偏少，疑扫描失效`)
  assert.ok(
    refs.some((r) => r.via === 'cssVar()'),
    '未扫到任何 cssVar() 调用——canvas 配色路径的防线已失效',
  )
  assert.ok(
    refs.some((r) => r.name.startsWith('--el-')),
    '未扫到任何 --el-* 引用，与项目实际不符',
  )
})

test('③ cssVar 的调用点不得位于模块作用域（样式表未就绪时取值为空串）', () => {
  const offenders = []
  for (const f of walk(join(ROOT, 'src'), ['.vue', '.ts'])) {
    const src = readFileSync(f, 'utf8')
    const lines = src.split('\n')
    const topLevel = lines.filter((l) => l.startsWith('const ') && l.includes('cssVar('))
    if (topLevel.length) offenders.push(`${relative(ROOT, f)}: ${topLevel[0].trim()}`)
  }
  // 模块顶层求值早于样式表注入，那时 getComputedStyle 取不到主题变量，
  // 结果是一串空串（图表静默变成默认色）。必须在挂载后的函数里调用。
  assert.deepEqual(offenders, [], 'cssVar 在模块顶层被调用，取值必为空')
})
