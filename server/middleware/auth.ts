import process from "node:process"
import { jwtVerify } from "jose"

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (!url.pathname.startsWith("/api")) return
  
  // 设置登录功能禁用标志
    event.context.disabledLogin = true
  
  // 不再阻止任何API端点的访问
  
  // 仍然处理需要认证的请求但不抛出错误
    if (["/api/s", "/api/me"].find(p => url.pathname.startsWith(p))) {
      const token = getHeader(event, "Authorization")?.replace(/Bearer\s*/, "")?.trim()
      if (token) {
        try {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET || 'dummy_secret')) as { payload?: { id: string, type: string } }
          if (payload?.id) {
            event.context.user = {
              id: payload.id,
              type: payload.type,
            }
          }
        } catch {
        // 不抛出错误，只记录日志
        logger.warn("JWT verification failed")
      }
    }
  }
})