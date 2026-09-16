// 文档档案相关接口
import http from './http'
import type { PageParams, PageResult } from '@/types/api.d'

/**
 * 文档信息（对齐下游 `DocumentVO` / BFF `DocumentMirror` 的真实字段）
 * <p>🔴 D-501-68：本接口此前声明 `documentNo` / `policyNo` / `customerId` / `customerName` / `createdAt`
 * 五个下游并不存在的字段（读模型 `t_document_view` 无对应列），列表据此渲染出恒为「-」的空列。
 * 现按下游契约逐字对齐：单证以 `businessType` + `businessId` 关联业务单据，无「文档编号」概念（主键即 documentId）。</p>
 */
export interface DocumentVO {
  /** 文档ID（主键） */
  documentId: string
  /** 文档类型（枚举名，如 POLICY_DOC） */
  documentType: string
  /** 模板代码 */
  templateCode?: string
  /** 关联业务单据ID（保单/赔案/保全案件号） */
  businessId?: string
  /** 业务类型（枚举名，如 POLICY / CLAIM / MAINTENANCE） */
  businessType?: string
  /** 文件名（含扩展名） */
  fileName?: string
  /** 文件存储相对路径 */
  filePath?: string
  /** 文件格式（枚举名，如 PDF） */
  fileFormat?: string
  /** 文件大小（字节） */
  fileSize?: number
  /** 文档状态（枚举名：GENERATING / GENERATED / SIGNED / ARCHIVED） */
  status: string
  /** 租户ID */
  tenantId?: string
  /** 创建时间 */
  createTime?: string
  /** 更新时间 */
  updateTime?: string
  /** 签署人ID（未签署为 null） */
  signerId?: string
  /** 签署人姓名（未签署为 null） */
  signerName?: string
  /** 签署凭证引用（未签署为 null） */
  signatureRef?: string
  /** 签署时间（未签署为 null） */
  signedAt?: string
}

/** 文档列表查询条件（BFF 负责把 businessId 转成下游的 policyId 过滤键） */
export interface DocumentQuery {
  /** 关联业务单据ID（保单号/赔案号/保全案件号） */
  businessId?: string
  /** 文档类型（枚举名） */
  documentType?: string
  /** 文档状态（枚举名） */
  status?: string
}

/** 查询文档列表 */
export function getDocumentList(
  params?: DocumentQuery & PageParams,
): Promise<PageResult<DocumentVO>> {
  return http.get('/web/v1/proxy/documents', { params }) as Promise<PageResult<DocumentVO>>
}

/** 获取文档详情 */
export function getDocumentDetail(documentId: string): Promise<DocumentVO> {
  return http.get(`/web/v1/proxy/documents/${documentId}`) as Promise<DocumentVO>
}

/**
 * 下载文档（返回文件字节流）
 * <p>🔴 D-501-71：BFF 与下游均已改为下发文件内容（此前下游只回存储路径字符串，前端无从取件）。
 * `responseType: 'blob'` 使响应拦截器直接返回 Blob 本体；单证或其文件不存在时下游以 HTTP 404 +
 * 错误信封响应，由拦截器 `resolveErrorMessage` 解析 Blob 错误体还原业务语义并提示。</p>
 */
export function downloadDocument(documentId: string): Promise<Blob> {
  return http.get(`/web/v1/proxy/documents/${documentId}/download`, { responseType: 'blob' })
}
