import type { H3Event } from 'h3'
import { getRequestHeader } from 'h3'

/**
 * 获取请求的客户端IP地址
 * 
 * @param event H3事件对象
 * @returns 客户端IP地址
 */
export function getClientIP(event: H3Event): string {
  const forwardedFor = getRequestHeader(event, 'x-forwarded-for')
  const realIP = getRequestHeader(event, 'x-real-ip')
  
  // 如果有X-Forwarded-For头，取第一个IP（最靠近用户的代理IP）
  if (forwardedFor) {
    const ips = forwardedFor.split(',')
    return ips[0].trim()
  }
  
  // 如果有X-Real-IP头，使用它
  if (realIP) {
    return realIP.trim()
  }
  
  // 从请求socket中获取
  const socketIP = event.node.req.socket.remoteAddress
  
  return socketIP || ''
} 