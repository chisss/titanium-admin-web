// 列表响应归一化：把后管代理层的各种列表返回形态统一为前端 PageResult
import type { PageResult } from '@/types/api.d'

/**
 * 归一化后端列表响应为 {@link PageResult}。
 *
 * <p>后管代理层的列表返回有三种形态：裸数组（无分页信封）、`{list,total}` 分页对象、
 * 以及 `total` 为 `null` 的分页对象。</p>
 *
 * <p>🔴 D-501-57 —— `total` 的口径是本函数存在的意义，三点不可改：</p>
 * <ol>
 *   <li>裸数组的 `length` 是**全集**条数（该形态由本层一次取回、不分页），属精确值，可直接采信；</li>
 *   <li>分页对象的 `total` 为 `null` 表示**总数未知**（下游只返回裸数组且本页已满，代理层无从推断），
 *       必须原样保留为 `null`，**不得**回退成 `list.length` —— 那是在向用户断言一个未经证实的事实，
 *       表现为「共 20 条」而实际 34 条，且第 2 页起在 UI 永久不可达；</li>
 *   <li>`null`（未知）与 `0`（确知没有数据）语义不同，消费方须区分对待。</li>
 * </ol>
 *
 * @param payload 后端原始列表响应
 * @param pageNum 当前页码（从 1 开始）
 * @param pageSize 每页条数
 */
export function toPageResult<T>(
  payload: T[] | PageResult<T> | null | undefined,
  pageNum: number,
  pageSize: number,
): PageResult<T> {
  const list = Array.isArray(payload) ? payload : payload?.list
  return {
    list: Array.isArray(list) ? list : [],
    total: Array.isArray(payload) ? payload.length : payload?.total ?? null,
    pageNum,
    pageSize,
  }
}
