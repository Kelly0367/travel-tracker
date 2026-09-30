/**
 * 地图配置
 * ------------------------------------------------
 * 合规底图：高德海外地图（新加坡节点，覆盖东南亚 / 泰国）
 *
 * 【需要你填两行】
 *   1. 去 https://console.amap.com/dev/key/app 注册并创建应用
 *   2. 添加 Key 时「服务平台」选择「Web端(JSAPI)」
 *   3. 在控制台提交工单，申请开通【海外地图】权限（必做）
 *   4. 把下面的 AMAP_KEY / AMAP_SECURITY 换成申请到的值
 *   5. 域名白名单里加上你部署的域名
 *
 * 未配置时地图自动降级为「自绘轨迹示意图」，不会白屏。
 * 海外坐标一律使用 WGS84（原始 GPS），无需 GCJ-02 转换。
 */

// 占位符：请在高德开放平台申请 Key 后替换此占位符
export const AMAP_KEY = '请在高德开放平台申请Key后替换此占位符'

// 占位符：请在高德开放平台申请安全密钥 jscode 后替换此占位符
export const AMAP_SECURITY = '请在高德开放平台申请安全密钥jscode后替换此占位符'

/** 海外服务区：oversea_sg = 新加坡节点（覆盖泰国）；oversea_de = 德国节点 */
export const AMAP_SERVICE_TYPE = 'oversea_sg'

/** 海外地图入口脚本 */
export const AMAP_ENTRY = 'https://sg-webapi.opnavi.com/maps?v=2.0'

/** 占位符是否已被替换为真实值 */
export function isAmapConfigured(): boolean {
  return (
    !!AMAP_KEY &&
    !AMAP_KEY.includes('请在高德') &&
    !!AMAP_SECURITY &&
    !AMAP_SECURITY.includes('请在高德')
  )
}
