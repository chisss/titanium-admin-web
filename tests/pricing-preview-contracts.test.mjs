import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

// 费率单位语义与保费试算契约（round6 批次 2）
//
// 缺陷背景：`views/product/rate-tables` 的「维护费率行」对话框里，「费率」是一列 8 位小数的
// 裸数字输入框——**没有单位、没有币种、没有结果预览**。而「费率」恰恰是量纲不固定的字段：
// 同一个 3.5，在「每千元保额」下是每千元收 3.5 元，在「保额比例」下却是保额的 350%。
// 录错量纲不会有任何提示，错误要到出单算费时才以「保费离谱」的形式暴露。
//
// 形态说明：**后端源码比对 + 纯函数行为断言**为主。试算逻辑是纯函数（constants/pricing.ts 零依赖），
// 可直接 import 后穷举计算；而公式本身的权威在后端，故第一组用例直接读 Java 源文件，
// 确认「翻译」没有走样——后端若改口径，本测试立即失败，逼前端同步。
const { RATE_UNIT_META, previewPremium, rateUnitMeta, roundHalfUp } = await import(
  '../src/constants/pricing.ts'
)

const rateTablesSource = await readFile(
  new URL('../src/views/product/rate-tables/index.vue', import.meta.url),
  'utf8',
)

/**
 * 剥掉注释，只留可执行代码。
 *
 * <p>🔴 不可省：本轮修复的说明性注释里刻意引用了历史缺陷（如「此前该对话框既不显示单位
 * 也不显示币种」），全文匹配会把「记录缺陷」误判成「缺陷仍在」。断言的对象是代码，不是文档。</p>
 */
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '') // 模板注释（跨行）
    .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释与 JSDoc（跨行）
    .replace(/^[ \t]*\/\/.*$/gm, '') // 整行行注释

const rateTablesCode = stripComments(rateTablesSource)

// 🔴 跨仓库读取：试算公式的权威在后端领域服务，单位的业务含义在 common 枚举
const premiumServiceSource = await readFile(
  new URL(
    '../../titanium-product/titanium-product-domain/src/main/java/com/titanium/product/service/PremiumCompositionService.java',
    import.meta.url,
  ),
  'utf8',
)
const rateUnitEnumSource = await readFile(
  new URL(
    '../../titanium-product/titanium-product-common/src/main/java/com/titanium/product/common/enums/RateUnit.java',
    import.meta.url,
  ),
  'utf8',
)
/** 字典 DML：单位中文名的展示真源（前端不得自造中文名） */
const rateUnitDictSource = await readFile(
  new URL(
    '../../titanium-admin/titanium-admin-bootstrap/src/main/resources/liquibase/dml/admin_business_dictionary_202608281445_dml.sql',
    import.meta.url,
  ),
  'utf8',
)

/** 从 Java 枚举源码抽取 `NAME(1, "CODE", "中文名", "…")` 的 code 与 name */
const extractRateUnitEnum = (source) =>
  [...source.matchAll(/^\s{4}([A-Z_]+)\((\d+),\s*"([A-Z_]+)",\s*"([^"]+)"/gm)].map((m) => ({
    code: m[3],
    name: m[4],
  }))

/** 从字典 DML 抽取 RATE_UNIT 的 code → label */
const extractRateUnitDict = (source) =>
  Object.fromEntries(
    [...source.matchAll(/SELECT '\d+', 'RATE_UNIT', '([A-Z_]+)', '([^']+)'/g)].map((m) => [m[1], m[2]]),
  )

test('① 后端公式前置条件：三种单位的分支与钳制顺序仍在（本组用例的地基）', () => {
  // 三支公式逐行比对，任一改写都会让前端「翻译」失效
  assert.match(premiumServiceSource, /SUM_INSURED_RATIO -> sumInsured\.multiply\(row\.rate\(\)\)/)
  assert.match(premiumServiceSource, /PER_THOUSAND_SUM_INSURED -> sumInsured\.multiply\(row\.rate\(\)\)\.divide\(THOUSAND, 8,/)
  assert.match(premiumServiceSource, /FIXED_AMOUNT -> row\.rate\(\)/)

  // 🔴 钳制顺序：先最低、后最高。两者配反（min > max）时以最高收尾——顺序不可调换
  const minIdx = premiumServiceSource.indexOf('row.minimumPremium() != null')
  const maxIdx = premiumServiceSource.indexOf('row.maximumPremium() != null')
  assert.ok(minIdx > 0 && maxIdx > 0, '最低/最高保费钳制必须存在')
  assert.ok(minIdx < maxIdx, '钳制顺序必须是先最低后最高（与后端一致）')

  // 末了统一 2 位 HALF_UP 舍入
  assert.match(premiumServiceSource, /return premium\.setScale\(2, RoundingMode\.HALF_UP\)/)

  // 🔴 保额校验在 switch **之前**：三种单位都必须保额 > 0
  const guardIdx = premiumServiceSource.indexOf('保额必须大于 0')
  assert.ok(guardIdx > 0 && guardIdx < premiumServiceSource.indexOf('BigDecimal premium = switch'),
    '保额 > 0 的校验必须早于公式分支')

  // 每千元保额的折算是「除 1000」而非「乘 1000」
  assert.match(premiumServiceSource, /THOUSAND = new BigDecimal\("1000"\)/)
})

test('② 费率单位枚举与前端语义表逐一对应（码值 + 中文名双对齐）', () => {
  const backend = extractRateUnitEnum(rateUnitEnumSource)
  assert.equal(backend.length, 3, '后端 RateUnit 应为 3 项')
  assert.deepEqual(
    backend.map((item) => item.code).sort(),
    Object.keys(RATE_UNIT_META).sort(),
    '前端 RATE_UNIT_META 的键必须与后端 RateUnit.code 完全一致',
  )
  for (const { code, name } of backend) {
    assert.equal(RATE_UNIT_META[code].name, name, `${code} 的中文名须与后端枚举一致`)
  }

  // 中文名的展示真源是 admin 字典（枚举 name 与字典 label 必须同值，否则列表页与对话框会不一致）
  const dict = extractRateUnitDict(rateUnitDictSource)
  assert.equal(Object.keys(dict).length, 3, 'RATE_UNIT 字典应有 3 项')
  for (const { code, name } of backend) {
    assert.equal(dict[code], name, `${code} 的字典 label 与枚举 name 必须同值`)
  }
})

test('③ 保费试算三种单位的结果与后端公式一致', () => {
  const sumInsured = 100000
  // 三个费率在 10 万保额下换算出的保费刻意相等（350），只有量纲不同
  const cases = [
    { unit: 'SUM_INSURED_RATIO', rate: 0.0035 },
    { unit: 'PER_THOUSAND_SUM_INSURED', rate: 3.5 },
    { unit: 'FIXED_AMOUNT', rate: 350 },
  ]
  for (const { unit, rate } of cases) {
    const preview = previewPremium({ rate }, unit, sumInsured)
    assert.ok(preview, `${unit} 应能算出结果`)
    // computed 允许浮点尾差（0.0035 的二进制表示不精确），最终保费必须精确
    assert.ok(
      Math.abs(preview.computed - 350) < 1e-9,
      `${unit} 费率 ${rate} × 保额 ${sumInsured} 应得 350，实得 ${preview.computed}`,
    )
    assert.equal(preview.premium, 350, `${unit} 最终保费应为 350`)
    assert.equal(preview.bound, undefined, `${unit} 未配上下限时不应有钳制`)
  }
})

test('④ 最低/最高保费按后端顺序钳制，且标出命中的界限', () => {
  // 算出 100000，被最高保费 5000 收窄
  const capped = previewPremium(
    { rate: 1, maximumPremium: 5000 },
    'SUM_INSURED_RATIO',
    100000,
  )
  assert.equal(capped?.premium, 5000)
  assert.equal(capped?.bound, 'maximum')
  assert.equal(capped?.clampedTo, 5000)

  // 算出 100，被最低保费 500 抬起
  const floored = previewPremium(
    { rate: 0.001, minimumPremium: 500 },
    'SUM_INSURED_RATIO',
    100000,
  )
  assert.equal(floored?.premium, 500)
  assert.equal(floored?.bound, 'minimum')

  // 🔴 上下限配反（min 600 > max 500）：先后顺序决定结果归最高值——与后端 switch 后的两次 if 同序
  const inverted = previewPremium(
    { rate: 0.001, minimumPremium: 600, maximumPremium: 500 },
    'SUM_INSURED_RATIO',
    100000,
  )
  assert.equal(inverted?.premium, 500, 'min > max 时以后者（最高保费）收尾')
  assert.equal(inverted?.bound, 'maximum')

  // 界限内不钳制（后端用严格大于/小于，等于界限值时不算命中）
  const atBound = previewPremium(
    { rate: 0.0035, minimumPremium: 350, maximumPremium: 350 },
    'SUM_INSURED_RATIO',
    100000,
  )
  assert.equal(atBound?.bound, undefined, '等于界限值时不算钳制')
})

test('⑤ 保费口径的舍入必须是 HALF_UP，且极小量级不产生 NaN', () => {
  // 🔴 用 `Math.round(v * 10 ** n)` 的朴素实现会在这两个经典值上舍错方向：
  //    `1.005 * 100 === 100.49999999999999`、`2.675 * 100 === 267.49999999999997`。
  //    后端的 BigDecimal 由十进制串构造（`BigDecimal.valueOf` / DB NUMERIC），口径是十进制 HALF_UP。
  assert.equal(roundHalfUp(1.005, 2), 1.01, '1.005 应进位为 1.01，而非被浮点误差舍成 1.00')
  assert.equal(roundHalfUp(2.675, 2), 2.68, '2.675 应进位为 2.68')
  assert.equal(roundHalfUp(350, 2), 350)
  assert.equal(roundHalfUp(0.124, 2), 0.12)
  // 费率精度 8 位，「最小非零费率」是真实取值；`String(1e-8)` 为科学计数法，
  // 直接拼指数会得到 "1e-8e2" ⇒ NaN，必须转定点串后再移位
  assert.equal(roundHalfUp(1e-8, 2), 0, '1e-8（费率 8 位精度）不得算出 NaN')
  // 🔴 8 位是**保留位数**，第 9 位决定进位：1.23e-7 的第 9 位是 3 ⇒ 舍为 1.2e-7（不是原值）
  assert.equal(roundHalfUp(1.23e-7, 8), 1.2e-7, '8 位舍入按第 9 位决定，不可原样返回')
  assert.equal(roundHalfUp(1.5e-8, 8), 2e-8, '第 9 位为 5 时须进位')
})

test('⑥ 试算前提不成立时返回 null，不用 0 冒充结果', () => {
  // 后端在公式之前先校验保额 > 0（三种单位都受约束，FIXED_AMOUNT 也不例外）
  for (const unit of Object.keys(RATE_UNIT_META)) {
    assert.equal(previewPremium({ rate: 1 }, unit, 0), null, `${unit}：保额 0 应无法试算`)
    assert.equal(previewPremium({ rate: 1 }, unit, -1), null, `${unit}：负保额应无法试算`)
    assert.equal(previewPremium({ rate: 1 }, unit, undefined), null, `${unit}：保额缺失应无法试算`)
  }
  // 费率缺失/为空串必须判「算不出」，**不可**走 Number() 的隐式 0
  // （`Number(null) === 0`、`Number('') === 0` —— 空值被当成费率 0，试算会给出一个貌似成功的 0 元）
  assert.equal(previewPremium({ rate: null }, 'SUM_INSURED_RATIO', 100000), null, 'null 费率不可当作 0')
  assert.equal(previewPremium({ rate: undefined }, 'SUM_INSURED_RATIO', 100000), null)
  assert.equal(previewPremium({ rate: '' }, 'SUM_INSURED_RATIO', 100000), null, '空串费率不可当作 0')
  assert.equal(previewPremium({ rate: -1 }, 'SUM_INSURED_RATIO', 100000), null)
  assert.equal(previewPremium({}, 'SUM_INSURED_RATIO', 100000), null)
  // 保额同理：空串不可当作 0 通过「保额 > 0」的判定
  assert.equal(previewPremium({ rate: 1 }, 'SUM_INSURED_RATIO', ''), null)
  assert.equal(previewPremium({ rate: 1 }, 'SUM_INSURED_RATIO', null), null)
  // 🔴 未知单位**不猜**：宁可显示占位符，也不按近似口径给出错误保费
  assert.equal(previewPremium({ rate: 1 }, 'SOME_FUTURE_UNIT', 100000), null)
  assert.equal(previewPremium({ rate: 1 }, '', 100000), null)
  assert.equal(rateUnitMeta('SOME_FUTURE_UNIT'), null)
  // 但它**不影响**已知单位的解析
  assert.equal(rateUnitMeta('FIXED_AMOUNT')?.name, '固定金额')
})

test('⑦ 是否随保额变化由单位语义决定（固定金额不受保额影响）', () => {
  assert.equal(RATE_UNIT_META.FIXED_AMOUNT.scalesWithSumInsured, false)
  assert.equal(RATE_UNIT_META.SUM_INSURED_RATIO.scalesWithSumInsured, true)
  assert.equal(RATE_UNIT_META.PER_THOUSAND_SUM_INSURED.scalesWithSumInsured, true)

  // 固定金额：保额翻倍，保费纹丝不动
  assert.equal(previewPremium({ rate: 350 }, 'FIXED_AMOUNT', 100000)?.premium, 350)
  assert.equal(previewPremium({ rate: 350 }, 'FIXED_AMOUNT', 200000)?.premium, 350)
  // 另两种：保额翻倍，保费翻倍（量纲随保额走）
  assert.equal(previewPremium({ rate: 0.0035 }, 'SUM_INSURED_RATIO', 200000)?.premium, 700)
  assert.equal(previewPremium({ rate: 3.5 }, 'PER_THOUSAND_SUM_INSURED', 200000)?.premium, 700)
  // 每千元保额口径的费率必然比保额比例口径大 1000 倍（量纲不同，数值不可比）
  assert.equal(
    previewPremium({ rate: 3.5 }, 'PER_THOUSAND_SUM_INSURED', 100000)?.premium,
    previewPremium({ rate: 0.0035 }, 'SUM_INSURED_RATIO', 100000)?.premium,
  )
})

test('⑧ 费率行对话框必须标出单位、币种与试算结果', () => {
  // 单位语义与试算函数来自唯一翻译点，不得在页面内另写一套公式
  assert.match(rateTablesCode, /import \{[^}]*previewPremium[^}]*\} from '@\/constants\/pricing'/)
  assert.match(rateTablesCode, /rateUnitMeta\(current\.value\?\.rateUnit\)/)

  // 「费率」列带量纲：仅靠数值无法判断 3.5 的含义
  assert.match(rateTablesCode, /const rateColumnLabel = computed\(\(\) => `费率（\$\{unitMeta\.value\?\.rateUnit \|\| '单位未知'\}）`\)/)
  assert.match(rateTablesCode, /:label="rateColumnLabel"/)
  // 币种写在金额表头，并真的传给 formatAmount（缺省会按人民币渲染外币表）
  assert.match(rateTablesCode, /const minPremiumLabel = computed\(\(\) => `最低保费（\$\{currencyCode\.value\}）`\)/)
  assert.match(rateTablesCode, /const maxPremiumLabel = computed\(\(\) => `最高保费（\$\{currencyCode\.value\}）`\)/)
  assert.match(rateTablesCode, /formatAmount\(row\.minimumPremium, detailCurrency\)/)

  // 试算基准保额：可调，且每次打开对话框复位（避免上一张表的保额量级被无声带进来）
  assert.match(rateTablesCode, /const previewSumInsured = ref\(DEFAULT_PREVIEW_SUM_INSURED\)/)
  assert.match(rateTablesCode, /previewSumInsured\.value = DEFAULT_PREVIEW_SUM_INSURED/)
  assert.match(rateTablesCode, /v-model="previewSumInsured"/)

  // 逐行试算列 + 钳制标记（静默钳制会让用户以为费率在起作用）
  assert.match(rateTablesCode, /label="试算保费"/)
  assert.match(rateTablesCode, /previewPremium\(row, current\.value\?\.rateUnit, previewSumInsured\.value\)/)
  assert.match(rateTablesCode, /previewCells\[\$index\]\?\.text/)
  assert.match(rateTablesCode, /previewCells\[\$index\]\?\.tag/)
  assert.match(rateTablesCode, /'按下限' : '按上限'/)

  // 讲解句复用同一个试算函数，避免「说明里算得对、列里算错」两套口径
  assert.match(rateTablesCode, /const basisExample = computed/)
  assert.match(rateTablesCode, /previewPremium\(\{ rate: sample \}, current\.value\?\.rateUnit/)
  // 示例费率刻意让三种单位指向同一个保费（350），量纲差异才看得出来
  assert.match(rateTablesCode, /SUM_INSURED_RATIO: 0\.0035/)
  assert.match(rateTablesCode, /PER_THOUSAND_SUM_INSURED: 3\.5/)
  assert.match(rateTablesCode, /FIXED_AMOUNT: 350/)

  // 年限类字段同样带单位（与本轮「金融/计量字段补单位」一致）
  assert.match(rateTablesCode, /label="缴费年限（年）"/)
  assert.match(rateTablesCode, /label="保障年限（年）"/)
})
