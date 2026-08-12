// 部门相关接口
import http from './http'

/** 部门简化项(供选择器) */
export interface DeptSimpleItem {
  id: string
  deptName: string
  parentId: string
}

/** 获取部门简化列表 */
export function getDeptSimpleList(): Promise<DeptSimpleItem[]> {
  return http.get('/web/v1/depts/simple-list')
}
