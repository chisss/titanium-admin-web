<template>
  <!-- TiDetailHeader：详情页头部（返回 + 标题 + 状态 + 操作），全站统一形态 -->
  <div class="ti-detail-header">
    <el-button class="ti-detail-header__back" :icon="ArrowLeft" text @click="handleBack">
      {{ backText }}
    </el-button>
    <h3 class="ti-detail-header__title">{{ title }}</h3>
    <div v-if="$slots.meta" class="ti-detail-header__meta">
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="ti-detail-header__actions">
      <slot name="actions" />
    </div>
    <!-- 头部的其它内容（提示语、面包屑等）。放在最后，不参与「标题撑开、操作靠右」的排布 -->
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useRouter, type RouteLocationRaw } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'

// 🔴 为什么需要这个组件（ui-011 底盘补位）：此前 8 个详情页各写一份头部——
// 7 份叫 .detail-header（product:444 / clause:142 / clause/edit:453 / customer:275 /
// underwriting:189 / billing:160 / policy:477），claim 另立 .ti-detail-header，
// maintenance/workbench 又用 .workbench-heading。四套结构、四套类名、移动端只有
// billing 一家做了换行保护。**根因不是「大家写得不一样」，而是没有共享组件**——
// 于是每新增一个详情页都要再抄一份，漂移只会继续累积。
//
// 本组件刻意**不感知业务**：详情页的主操作（编辑/修订/终止…）由 {@link #actions} 插槽注入，
// 状态标签由 {@link #meta} 插槽注入。组件只负责「返回 + 标题」这段所有详情页都一样的骨架，
// 因此它不需要知道保单、条款、理赔各自的规则，也就不会随业务变化而膨胀。

/** TiDetailHeader 属性 */
interface Props {
  /** 页面标题（如「保单详情 - P2026001」）。列表页名 + 业务标识，由调用方拼好 */
  title?: string
  /** 返回按钮文案。默认「返回」= 回到来处；有明确目标（如「返回列表」）时改这里并配 backTo */
  backText?: string
  /**
   * 返回目标。给出即**总是**跳到该路由，与浏览器历史无关；
   * 不给出则走 `router.back()` 回到来处。详见 {@link handleBack}。
   */
  backTo?: RouteLocationRaw
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  backText: '返回',
})

const emit = defineEmits<{
  /** 点击返回按钮时触发，先于实际跳转 —— 调用方可在此做埋点或自行接管导航 */
  back: []
}>()

const router = useRouter()

/**
 * 是否真有上一条历史可退。
 *
 * <p>`router.back()` 最终落到 `history.go(-1)`，而**没有上一条时它既不报错也不跳转**。</p>
 *
 * <p>判据是 vue-router 4 写在 `history.state.back` 里的来源路径，实测（Chrome + 本项目 dev
 * server）：站内跳转过来时它是来源路径（进保单详情时读到 `/policy/list`）；
 * 直接打开链接 / 新标签页进入时 vue-router 会把 state 重置为 `back: null`。
 * ⚠️ 注意 `null` 的含义是「vue-router 不知道有前一个**路由**」而非「浏览器没有上一条历史」——
 * 这正是我们要区分的：前者下 `back()` 要么无反应、要么把用户带去站外，都不是「返回」该有的行为。</p>
 *
 * <p>🔴 取不到该字段时**按「有历史」处理**（返回 true）。这是一次探测，不是一次判断：
 * 将来 vue-router 若改了内部结构，我们应当退回本组件出现之前的行为，而**不能**因为
 * 探测失灵就把 11 个页面的返回按钮变成坏的——探测失败的代价，不能大于不探测。</p>
 */
function hasHistory(): boolean {
  const state = router.options.history.state as { back?: unknown } | undefined
  const back = state?.back
  if (back === undefined) return true
  return typeof back === 'string' && back !== ''
}

/**
 * 返回按钮的行为。
 *
 * <p>给了 `backTo` 就**总是**去 `backTo`：此时按钮文案说的是一个明确目标（「返回列表」），
 * 用户点了却回到来源页（可能是另一个详情页）就是文案与行为不符。没给才是「回到来处」，
 * 与现存 11 个页面手写的 `$router.back()` 行为一致。</p>
 */
function handleBack() {
  emit('back')
  if (props.backTo !== undefined) {
    router.push(props.backTo)
    return
  }
  if (hasHistory()) {
    router.back()
    return
  }
  // 🔴 直接打开链接 / 刷新详情页时没有历史可退。此处**不能保持静默**：按钮点了没反应、
  // 控制台无任何痕迹，用户只会以为界面卡住了，排查时也无从下手。调用方可用 @back 接管
  // （事件已在上方 emit），否则至少在此留下一条可检索的痕迹。
  console.warn('[TiDetailHeader] 无历史可退且未提供 backTo，返回按钮不会产生跳转')
}
</script>

<style scoped lang="scss">
.ti-detail-header {
  display: flex;
  align-items: center;
  gap: $space-3;
  margin-bottom: $space-5;

  // 标题吃掉剩余宽度，把状态与操作自然推到最右——不必再给它们加 margin-left: auto，
  // 这也正是此前 8 份实现里「flex: 1」与「margin-left: auto」两种写法的统一答案
  &__title {
    flex: 1;
    // 允许收缩到比内容更窄，否则长标题会把后面的状态标签挤出容器
    min-width: 0;
    margin: 0;
    font-size: $font-size-xl;
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }

  &__meta,
  &__actions {
    display: flex;
    align-items: center;
    gap: $space-2;
  }
}

// 移动端换行保护：此前只有 billing/detail 一家做了这件事，其余 7 页的头部在窄屏下
// 会把标题挤成一条线或溢出容器。作为共享组件，这里是它唯一应有的位置。
@media (max-width: $breakpoint-mobile) {
  .ti-detail-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .ti-detail-header__title {
    overflow-wrap: anywhere;
  }
}
</style>
