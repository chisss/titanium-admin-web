// 无扩展名相对导入的解析钩子 —— **导入本模块即自注册**，消费方只需 `import './ts-resolve-hook.mjs'`。
//
// 为什么需要：源码用 Vite 风格的 `./usePagination`（省略扩展名），而 Node ESM 要求显式扩展名。
// 只在测试侧补全，不改动业务源码（改了反而偏离项目既有风格）。
//
// 为什么自注册而非导出后由调用方 registerHooks：注册必须发生在**目标模块被 import 之前**，
// 交给调用方就容易写成「先 import 后注册」，届时解析已经失败。自注册把顺序固化在 import 语句上。
import { registerHooks } from 'node:module'

export function resolve(specifier, context, nextResolve) {
  try {
    return nextResolve(specifier, context)
  } catch (err) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context)
    }
    throw err
  }
}

registerHooks({ resolve })
