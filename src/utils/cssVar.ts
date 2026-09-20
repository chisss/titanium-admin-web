/**
 * 读取 `:root` 上的 CSS 自定义属性值（如 `--el-color-success`）。
 *
 * 为什么需要：ECharts 渲染到 **canvas**，canvas 不参与 CSS 级联，配置里写 `var(--x)`
 * 不会被解析——必须拿到字面值。若因此在图表配置里写死色值，就会与主题各存一份、
 * 必然漂移（主题换品牌色时图表纹丝不动）。故运行时从 CSS 变量取值，使图表与全站同源。
 *
 * DOM 场景**不要**用这个：内联 `style="color: var(--el-color-success)"` 由浏览器解析即可，
 * 不必绕到 JS 里再取值。
 *
 * @param name CSS 变量名，含前导 `--`
 * @param fallback 取不到时的兜底值
 */
export function cssVar(name: string, fallback = ''): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}
