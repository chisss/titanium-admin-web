// 字典相关接口
import http from './http'
import type { DictType, DictData } from '@/types/business.d'
import type { PageParams, PageResult } from '@/types/api.d'

/** 获取字典类型列表 */
export function getDictTypeList(params?: Partial<PageParams>): Promise<PageResult<DictType>> {
  return http.get('/web/v1/dicts/types', { params })
}

/** 新增字典类型 */
export function createDictType(data: Partial<DictType>): Promise<void> {
  return http.post('/web/v1/dicts/types', data)
}

/** 更新字典类型 */
export function updateDictType(id: string, data: Partial<DictType>): Promise<void> {
  return http.put(`/web/v1/dicts/types/${id}`, data)
}

/** 删除字典类型 */
export function deleteDictType(id: string): Promise<void> {
  return http.delete(`/web/v1/dicts/types/${id}`)
}

/** 后端字典数据原始结构（DictController 返回 DictDataVO） */
interface DictDataRaw {
  id: string
  dictType: string
  dictValue: string
  dictLabel: string
  dictSort?: number
  status?: string
}

/**
 * 根据类型编码获取字典数据
 * 后端入口为 GET /web/v1/dicts/{dictType}/data，返回 {dictValue,dictLabel,dictSort,status}，
 * 此处映射为前端 DictData 结构（value/label/sort）供 useDict 使用
 */
export async function getDictDataByType(typeCode: string): Promise<DictData[]> {
  const raw = (await http.get(`/web/v1/dicts/${typeCode}/data`)) as unknown as DictDataRaw[]
  return (raw || []).map((it) => ({
    id: it.id,
    dictTypeId: '',
    dictTypeCode: it.dictType ?? typeCode,
    value: it.dictValue,
    label: it.dictLabel,
    sort: it.dictSort ?? 0,
    status: (it.status === '0' ? 'ACTIVE' : 'INACTIVE') as DictData['status'],
  }))
}

/** 新增字典数据 */
export function createDictData(data: Partial<DictData>): Promise<void> {
  return http.post('/web/v1/dicts/items', data)
}

/** 更新字典数据（含 i18n 标签） */
export function updateDictData(id: string, data: Partial<DictData>): Promise<void> {
  return http.put(`/web/v1/dicts/items/${id}`, data)
}

/** 删除字典数据 */
export function deleteDictData(id: string): Promise<void> {
  return http.delete(`/web/v1/dicts/items/${id}`)
}
