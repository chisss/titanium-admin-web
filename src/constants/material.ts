/**
 * 投保/核保/理赔材料候选清单（前端受控词表）。
 *
 * 用途：产品「新建/编辑」与「产品配置」页里凡是要求操作员填写材料的字段，一律从这里取值，
 * 不给自由文本输入框 —— 材料是**受控词表**，自由录入会让同一个材料在库里出现
 * 「身份证 / 身份证复印件 / 身份证明」等多种写法，后续按材料统计与校验全部失效。
 *
 * 🔴 为什么是前端常量，而不是后端字典（TiDictSelect）：
 *   1) 后端**没有**材料权威枚举。已核实：领域值对象 `DocumentConfig.RequiredMaterial.materialCode`
 *      的注释即为「材料编码（产品内唯一标识）」，是**产品内自由编码**，未约束值域；
 *      titanium-product 全模块无材料枚举，全仓 SQL 里也没有「投保材料」字典。
 *   2) 全仓唯一的材料字典是 `CLAIM_DOCUMENT`（理赔材料），只有 5 个理赔专属取值
 *      （身份证/诊断证明/医疗发票/出院小结/银行账户），既覆盖不了寿险与车险的投保材料，
 *      语义也不同（理赔 ≠ 投保）。
 *   3) 本会话对共享数据库的写入被权限系统拦截，**新增字典 + Liquibase DML 在本环境跑不通**：
 *      字典在运行库里根本不存在，下拉会是空的 —— 那比输入框更糟（操作员连能选什么都看不到）。
 *      故取舍为：先把受控词表落在前端常量，值域受限、可评审、可随时改成字典取数。
 *
 * 🔴 将来若改为字典驱动：只需把 `MATERIAL_OPTIONS` 的取数换成字典（或产品域接口），
 *    调用方无需改动（都只依赖 `MATERIAL_OPTIONS` / `materialLabel` 两个出口）。
 *
 * 取值约定：
 *   - `value` 为语言无关稳定编码（与 `CLAIM_DOCUMENT` 字典**同语义者沿用其同码**，
 *     见下方逐条标注，避免将来两套编码分叉）；
 *   - `label` 为中文名。产品域「核保必需材料」(`List<String>`) 存的是**可直接展示的文本**，
 *     故该字段取 `label` 入库；`DocumentConfig.RequiredMaterial` 则 code/label 成对入库。
 */

/** 材料选项：{ 编码, 中文名 } */
export interface MaterialOption {
  /** 材料编码（语言无关稳定标识） */
  value: string
  /** 材料中文名（面向操作员展示，核保必需材料直接以此入库） */
  label: string
}

/**
 * 常见投保 / 核保 / 理赔材料（寿险、健康险、车险、宠物险）。
 * 有序：先通用身份与健康类，再车险类，再宠物险类。
 */
export const MATERIAL_OPTIONS: MaterialOption[] = [
  // ── 通用身份与收款类 ─────────────────────────────────────────
  /** 身份证：投/被保人、受益人的法定身份证明（与 CLAIM_DOCUMENT.ID_CARD 同码） */
  { value: 'ID_CARD', label: '身份证' },
  /** 户口簿：未成年人等无身份证被保人的身份证明，兼作亲属关系佐证 */
  { value: 'HOUSEHOLD_REGISTER', label: '户口簿' },
  /** 出生医学证明：未成年被保人的年龄与亲子关系证明 */
  { value: 'BIRTH_CERTIFICATE', label: '出生医学证明' },
  /** 结婚证：配偶关系证明，常见于夫妻互保、配偶作为受益人 */
  { value: 'MARRIAGE_CERTIFICATE', label: '结婚证' },
  /** 银行账户：保费代扣与理赔/退保金收款账户凭证（与 CLAIM_DOCUMENT.BANK_ACCOUNT 同码） */
  { value: 'BANK_ACCOUNT', label: '银行账户' },
  /** 证件影印件：上述证件以外的其他影像件（如监护人证件复印件） */
  { value: 'PHOTOCOPY', label: '证件影印件' },

  // ── 寿险 / 健康险类 ─────────────────────────────────────────
  /** 体检报告：核保体检结论，健康告知异常或高保额投保时的补充材料 */
  { value: 'MEDICAL_REPORT', label: '体检报告' },
  /** 健康告知书：投被保人健康告知的签署件，核保风险筛选的原始依据 */
  { value: 'HEALTH_NOTICE', label: '健康告知书' },
  /** 诊断证明：医院出具的疾病诊断结论（既往病史核实与疾病理赔共用，与 CLAIM_DOCUMENT.DIAGNOSIS 同码） */
  { value: 'DIAGNOSIS', label: '诊断证明' },
  /** 住院病历：住院期间的诊疗过程记录，理赔与核保复核的责任判定依据 */
  { value: 'HOSPITAL_RECORD', label: '住院病历' },
  /** 出院小结：住院治疗结果与出院医嘱（与 CLAIM_DOCUMENT.DISCHARGE_SUMMARY 同码） */
  { value: 'DISCHARGE_SUMMARY', label: '出院小结' },
  /** 医疗发票：医院收费票据，理赔费用报销的金额凭证（与 CLAIM_DOCUMENT.INVOICE 同码） */
  { value: 'INVOICE', label: '医疗发票' },
  /** 收入证明：高保额投保的收入核验材料，用于防范逆选择与超收入投保 */
  { value: 'INCOME_PROOF', label: '收入证明' },
  /** 死亡证明：身故理赔的法定出险证明（含户籍注销证明） */
  { value: 'DEATH_CERTIFICATE', label: '死亡证明' },
  /** 已有保单：在保保单的合同页/保单号，续保、加保时核实既有保障 */
  { value: 'EXISTING_POLICY', label: '已有保单' },

  // ── 车险类 ──────────────────────────────────────────────────
  /** 行驶证：机动车的法定行驶凭证，车险标的合法性与车辆信息核对（车险必备） */
  { value: 'VEHICLE_LICENSE', label: '行驶证' },
  /** 驾驶证：驾驶人准驾资格证明，用于投保人/驾驶人信息核验 */
  { value: 'DRIVING_LICENSE', label: '驾驶证' },
  /** 机动车登记证书：车辆所有权凭证，过户、抵押、批改场景使用 */
  { value: 'VEHICLE_REGISTRATION', label: '机动车登记证书' },
  /** 车辆照片：投保验车照片，记录承保时车辆现状（避免承保前损失争议） */
  { value: 'VEHICLE_PHOTO', label: '车辆照片' },
  /** 交通事故认定书：交警出具的事故责任认定，车险理赔的责任比例依据 */
  { value: 'ACCIDENT_REPORT', label: '交通事故认定书' },

  // ── 宠物险类 ────────────────────────────────────────────────
  /** 宠物免疫证明：宠物疫苗接种记录，宠物险承保与传染病责任的核保依据 */
  { value: 'PET_VACCINATION_RECORD', label: '宠物免疫证明' },
  /** 宠物健康证明：宠物健康状况与体检结论，防范带病投保 */
  { value: 'PET_HEALTH_CERTIFICATE', label: '宠物健康证明' },
  /** 宠物芯片/登记证明：宠物身份识别（芯片号或登记号），确认保险标的同一性 */
  { value: 'PET_ID_CHIP', label: '宠物芯片/登记证明' },
  /** 宠物所有权证明：购买或领养凭证，确认投保人对保险标的的保险利益 */
  { value: 'PET_OWNERSHIP_PROOF', label: '宠物所有权证明' },
]

/** 材料编码 → 中文名（用于按编码回填材料名称；未命中原样返回，便于暴露未登记编码） */
const MATERIAL_LABELS: Record<string, string> = MATERIAL_OPTIONS.reduce<Record<string, string>>(
  (acc, opt) => {
    acc[opt.value] = opt.label
    return acc
  },
  {},
)

/**
 * 取材料中文名。
 * @param code 材料编码
 * @returns 命中的中文名；未命中返回编码原文（不返回「-」，以免掩盖未登记编码）
 */
export function materialLabel(code?: string): string {
  if (!code) return ''
  return MATERIAL_LABELS[code] ?? code
}
