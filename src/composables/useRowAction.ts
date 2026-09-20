import { ref } from 'vue'
import { ElMessageBox, type ElMessageBoxOptions } from 'element-plus'
import { showErrorIfUnhandled } from '@/api/http'

/**
 * 行内写操作的统一执行器。
 *
 * <p>解决的问题（第四轮 UI 走查 §八）：列表页的「行内状态推进」动作
 * （激活/停用、审批/发布/退役、启用/禁用）普遍是「确认框 → 发请求 → 提示 → 刷新」
 * 四步裸写，缺两样东西：</p>
 *
 * <p>① **pending 反馈**：请求期间按钮毫无变化，慢接口下用户以为没点中而重复点击。
 * 这些恰恰是低频高危的状态推进动作，重复提交的代价远大于一次多余的转圈。</p>
 *
 * <p>② **取消的处理**：`ElMessageBox.confirm` 以 **reject** 表达「用户点了取消」，
 * 裸 `await` 会把取消变成未处理的 promise rejection。取消不是错误，必须吞掉。</p>
 *
 * <p>关于 `:loading` 的绑定粒度：pending 状态**按行记录**（key 一般是行主键），
 * 不是一个布尔量。表格同时可见多行，若用布尔量，点击 A 行会让 B 行的按钮一起转圈，
 * 用户会以为自己误触了别的行。</p>
 *
 * <p>🔴 一行内有**多个不同动作**时（如 system/user 的「重置密码」与「启用/禁用」并排），
 * 只带行主键还不够——两个按钮会共用同一个 key 而**同时转圈**，等于把刚修掉的
 * 「转错对象」缺陷换了个尺度重现。这类页面必须用 {@link actionKey} 把动作名也编进 key。</p>
 *
 * 用法：
 * ```ts
 * const { rowPending, run } = useRowAction(refresh)
 *
 * const handleActivate = async (row: ChannelVO) => {
 *   if (!(await confirmAction(`确认激活渠道"${row.channelName}"？`, '提示'))) return
 *   await run(row.channelId, async () => {
 *     await activateChannel(row.channelId)
 *     ElMessage.success('激活成功')
 *   })
 * }
 * ```
 * 模板：`<el-button :loading="rowPending === row.channelId" @click="handleActivate(row)">`
 *
 * @param refresh 动作成功后调用的刷新函数（通常是列表页的 `fetchData`）。失败时不刷新——
 *                列表保持原状，用户才能看清刚才那一步没有成功。
 *
 * <p>🔴 **适用范围：只用于「表格行内」的动作**（key 是行主键，pending 归属到那一行）。</p>
 * <p>**对话框 / 抽屉内的保存按钮不用它**，仍用本仓既有的 `saving` + `try/finally` 范式
 * （见 `system/user`、`system/dict`、`channel/commission-schemes`）。理由：对话框是模态的，
 * 同一时刻只可能有一个保存在途，按行键区分没有意义；硬套会让 `rowPending` 里混进
 * `'create'` 这种非行主键的哨兵值，读者再也说不清这个 ref 到底存的是什么。
 * 两层作用域各自一个范式，好过一层抽象硬扛两种语义。</p>
 */
export function useRowAction(refresh?: () => unknown) {
  /** 正在执行的行主键；`null` 表示无进行中的行内动作 */
  const rowPending = ref<string | number | null>(null)

  /**
   * 执行一次行内动作：置 pending → 执行 → 刷新 → 复位。
   *
   * @param key 行主键，用于把 pending 绑定到具体那一行
   * @param fn  实际动作（发请求 + 成功提示）
   */
  async function run(key: string | number, fn: () => Promise<void>): Promise<void> {
    rowPending.value = key
    try {
      await fn()
      await refresh?.()
    } catch (e: unknown) {
      // 拦截器已弹过业务消息的不重复弹；未弹过的按兜底文案提示。
      showErrorIfUnhandled(e)
    } finally {
      rowPending.value = null
    }
  }

  return { rowPending, run }
}

/**
 * 组装行内动作的 pending 键：**行主键 + 动作名**。
 *
 * <p>同一行只有一个动作按钮时，直接用行主键即可；一旦一行内并排多个动作
 * （重置密码 / 启用禁用、提交审批 / 更多下拉），必须带上动作名，
 * 否则两个按钮共用一个 key，点其中一个会让另一个一起转圈。</p>
 *
 * 用法：`await run(actionKey(row.id, 'toggle'), fn)`
 * 模板：`:loading="rowPending === actionKey(row.id, 'toggle')"`
 */
export const actionKey = (key: string | number, action: string): string => `${key}:${action}`

/**
 * 二次确认；**用户取消时返回 `false` 而不是抛异常**。
 *
 * <p>`ElMessageBox.confirm` 用 reject 表达取消，裸 `await` 会让每次「取消」
 * 都产生一个未处理的 rejection。这里把两种结果都收敛成布尔值，
 * 调用方写 `if (!(await confirmAction(...))) return` 即可，不必每处都套 try/catch。</p>
 *
 * @returns 用户点了确认返回 `true`，取消或关闭返回 `false`
 */
export async function confirmAction(
  message: string,
  title: string,
  options?: ElMessageBoxOptions,
): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, options)
    return true
  } catch {
    return false
  }
}
