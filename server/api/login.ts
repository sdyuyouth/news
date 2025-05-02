import { defineEventHandler, setResponseStatus } from "h3"

export default defineEventHandler(async (event) => {
  setResponseStatus(event, 403)
  return {
    status: 'error',
    message: '登录功能已禁用'
  }
})