import { computed, type ComputedRef } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { MEDIA_MAX_MOBILE } from '@/constants/layout'

/**
 * 详情页描述区（`el-descriptions`）的列数
 *
 * <p>收敛前全站详情页的 `:column` 有 **1 / 2 / 3 / 4** 四种固定值，写法还有
 * `detailColumnCount` / `detailColumns` / `reconciliationColumnCount` /
 * 内联 `isNarrowScreen ? 1 : 3` 四种，且**多数不响应窄屏**——手机上 3 列
 * 标签-值对被压成一团，长标签换行错位、值被挤成竖排。</p>
 *
 * <p>本函数给出唯一形态：**宽屏取 2 / 3 / 4 档，窄屏一律降为 1 列**。</p>
 *
 * <p>🔴 通用档位只有 **2 与 3**：「成排的标签-值对」在 1600px 下的可读宽度上限就在这里——
 * 4 列时每列约 330px，而标签列本身固定吃掉 ~110px，值只剩 ~200px，地址、条款名这类
 * 中长文本就开始折行，反而不如 3 列整齐。</p>
 *
 * <p>**4 档仅限「4 个同类短值并排」的语义面板**（如分红配置的 4 档演示利率、账单勾稽的
 * 4 项税额摘要、计算摘要的 8 个短字段）——这些面板的 4 格内容长度相近且都很短，
 * 排成一行是信息密度的最优解，拆成 3+1 只会多出一格空位。**混排长文本的面板不得用 4。**</p>
 *
 * <p>⚠️ 窄屏降为 1 列时，模板里原有的 `:span="2"` / `:span="detailColumns"` 会自然退化为
 * 整行（span 不小于列数时 EP 独占一行），无需在调用方另做分支。</p>
 *
 * @param wideColumns 宽屏列数，2 / 3 / 4；默认 3（信息密度优先，适用于字段较短的概览面板）
 * @returns 随视口响应的列数
 */
export function useDetailColumns(wideColumns: 2 | 3 | 4 = 3): ComputedRef<number> {
  const isNarrowScreen = useMediaQuery(MEDIA_MAX_MOBILE)
  return computed(() => (isNarrowScreen.value ? 1 : wideColumns))
}
