import type { App } from 'vue'

/**
 * 全局错误兜底（🔴 D-10）。
 *
 * <p>**现场**：全站 40 处 `ElMessageBox.confirm` 中多数只 `await` 不 `catch`。用户在删除确认框
 * 点「取消」，confirm 返回的 promise 以字符串 `'cancel'` reject；因为调用发生在 `@click`
 * 事件处理器里，Vue 会把该 rejection 转给 `app.config.errorHandler`——未注册时退回默认处理，
 * 而 Vue 的默认处理在开发模式会把它**再抛一次**，最终变成浏览器控制台的
 * `Uncaught (in promise) cancel`。点一次取消报一条红字，成了全站噪声源。</p>
 *
 * <p>**为什么要治**：不只是「日志难看」。控制台常驻红色错误会让开发者对红色脱敏，
 * 真正的事故被淹在噪声里——与 D-08（为了消掉蓝框把 outline 整个关掉，连带毁掉键盘焦点）、
 * D-09（红色按钮用滥，用户不再怕红）是同一类病：**把正常信号混进危险信号里**。</p>
 *
 * <p>**处置原则**：只吞「用户主动关闭确认框」这一种，其余一律保持可见。
 * 宁可有噪声，不可静默吞错——把真错误也吞掉比原来的噪声危险得多。</p>
 */

/**
 * ElMessageBox 被关闭时的 reject 原因值（EP 契约）：
 * 点「取消」为 `'cancel'`，点右上角 ✕ 或按 ESC 为 `'close'`。
 */
const MESSAGE_BOX_DISMISS = new Set(['cancel', 'close'])

/**
 * 该 rejection 是否只是「用户关掉了确认框」——预期行为，不是错误。
 *
 * <p>用 `typeof === 'string'` 双重限定：只有裸字符串才可能是 MessageBox 的 action，
 * 携带堆栈的 Error 一律走正常上报路径。</p>
 */
export const isMessageBoxDismiss = (reason: unknown): boolean =>
  typeof reason === 'string' && MESSAGE_BOX_DISMISS.has(reason)

/**
 * 注册全局错误兜底。须在 `app.mount()` 之前调用。
 *
 * <p>两处兜底缺一不可：</p>
 * <ul>
 *   <li>`app.config.errorHandler` —— 管事件处理器/watch/render 里抛出的错误（Vue 统一转交到这里）</li>
 *   <li>`unhandledrejection` —— 管不经 Vue 的悬空 promise（如工具函数内部未 await 的链）</li>
 * </ul>
 */
export function setupGlobalErrorHandling(app: App): void {
  app.config.errorHandler = (err, _instance, info) => {
    if (isMessageBoxDismiss(err)) return
    // 🔴 非「关闭确认框」的错误必须自己打出来：注册 errorHandler 会**替换** Vue 的默认实现
    // （默认实现含 warn + console.error），这里若不接管打印，等于把真实错误静默吞掉——
    // 那比修复前的噪声危险得多。
    console.error(`[ti] 未捕获的组件错误（${info}）`, err)
  }

  window.addEventListener('unhandledrejection', (event) => {
    // 其余保持浏览器默认打印（控制台可见、可断点、可被错误监控采集），不做 preventDefault
    if (!isMessageBoxDismiss(event.reason)) return
    // 关闭确认框：阻止浏览器打印 "Uncaught (in promise) cancel"
    event.preventDefault()
  })
}
