import type { NewsItem } from '@shared/types'
import { getClientIP } from '../utils/ip'
import { defineEventHandler, getQuery, setResponseStatus } from 'h3'
import { Version } from '@shared/consts'
import type { SourceID } from '@shared/types'
import { typeSafeObjectEntries } from '@shared/type.util'
import { myFetch } from '../utils/fetch'
import { defineSource } from '../utils/source'
import * as cheerio from 'cheerio'
import { Buffer } from 'node:buffer'
import iconv from 'iconv-lite'
import md5 from 'md5'

// 生成一个随机的API密钥 (32位)
const API_KEY = 'kRE9qP5fT8sW2uY7xN3bL6cJ4vX1zG0a'

// 指定的新闻源
const NEWS_SOURCES = [
  'zaobao',     // 联合早报
  'wallstreetcn', // 华尔街见闻
  'cls',        // 财联社
  'jin10',      // 金十数据
  'fastbull',   // 法布财经
  'zhihu',      // 知乎
  'toutiao',    // 今日头条
  'thepaper',   // 澎湃新闻
  'juejin'      // 稀土掘金
]

// 财联社参数获取
async function getSearchParams(moreParams?: any) {
  const params = {
    appName: "CailianpressWeb",
    os: "web",
    sv: "7.7.5",
  }
  
  const searchParams = new URLSearchParams({ ...params, ...moreParams })
  searchParams.sort()
  
  // 简化的签名计算
  searchParams.append("sign", md5(searchParams.toString()))
  return searchParams
}

// 知乎热榜
async function fetchZhihu(): Promise<NewsItem[]> {
  try {
    const url = "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=20&desktop=true"
    const res = await myFetch(url)
    return res.data
      .map((k: any) => {
        const urlId = k.target.url?.match(/(\d+)$/)?.[1]
        return {
          id: k.target.id,
          title: k.target.title,
          url: `https://www.zhihu.com/question/${urlId || k.target.id}`,
          pubDate: new Date().toISOString(),
          extra: {
            info: '知乎',
            hover: k.target.excerpt || ''
          }
        }
      })
  } catch (error) {
    console.error('获取知乎热榜失败:', error)
    return []
  }
}

// 今日头条
async function fetchToutiao(): Promise<NewsItem[]> {
  try {
    const url = "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc"
    const res = await myFetch(url)
    return res.data
      .slice(0, 20)
      .map((k: any) => {
        return {
          id: k.ClusterIdStr || k.ClusterId,
          title: k.Title,
          url: `https://www.toutiao.com/trending/${k.ClusterIdStr || k.ClusterId}/`,
          pubDate: new Date().toISOString(),
          extra: {
            info: '今日头条',
            hover: k.Abstract || ''
          }
        }
      })
  } catch (error) {
    console.error('获取今日头条失败:', error)
    return []
  }
}

// 澎湃新闻
async function fetchThepaper(): Promise<NewsItem[]> {
  try {
    // 使用与源码相同的URL
    const url = "https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar"
    const res = await myFetch(url)
    return res.data.hotNews.map((k: any) => {
      return {
        id: k.contId,
        title: k.name,
        url: `https://www.thepaper.cn/newsDetail_forward_${k.contId}`,
        mobileUrl: `https://m.thepaper.cn/newsDetail_forward_${k.contId}`,
        pubDate: k.pubTimeLong ? new Date(parseInt(k.pubTimeLong)).toISOString() : new Date().toISOString(),
        extra: {
          info: '澎湃新闻'
        }
      }
    })
  } catch (error) {
    console.error('获取澎湃新闻失败:', error)
    return []
  }
}

// 稀土掘金
async function fetchJuejin(): Promise<NewsItem[]> {
  try {
    // 使用与源码相同的URL
    const url = "https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot&spider=0"
    const res = await myFetch(url)
    return res.data.map((k: any) => {
      return {
        id: k.content.content_id,
        title: k.content.title,
        url: `https://juejin.cn/post/${k.content.content_id}`,
        pubDate: new Date().toISOString(),
        extra: {
          info: '稀土掘金'
        }
      }
    })
  } catch (error) {
    console.error('获取稀土掘金失败:', error)
    return []
  }
}

// 联合早报
async function fetchZaobao(): Promise<NewsItem[]> {
  try {
    // 使用与源码相同的URL和解码逻辑
    const response: ArrayBuffer = await myFetch("https://www.zaochenbao.com/realtime/", {
      responseType: "arrayBuffer",
    })
    const base = "https://www.zaochenbao.com"
    const utf8String = iconv.decode(Buffer.from(response), "gb2312")
    const $ = cheerio.load(utf8String)
    const $main = $("div.list-block>a.item")
    const news: NewsItem[] = []
    
    $main.each((_: number, el: any) => {
      const a = $(el)
      const url = a.attr("href")
      const title = a.find(".eps")?.text()
      const date = a.find(".pdt10")?.text().replace(/-\s/g, " ")
      
      if (url && title && date) {
        news.push({
          url: base + url,
          title,
          id: url,
          pubDate: new Date().toISOString(),
          extra: {
            info: '联合早报'
          }
        })
      }
    })
    
    return news
  } catch (error) {
    console.error('获取联合早报失败:', error)
    // 备用方式
    try {
      const html = await myFetch.raw("https://www.zaobao.com/realtime").then(r => r.text())
      const $ = cheerio.load(html)
      const items: NewsItem[] = []
      
      $(".article-list article h5 a").each((i: number, el: any) => {
        const $this = $(el)
        const url = $this.attr("href") || ""
        const title = $this.text().trim()
        
        if (title && url) {
          items.push({
            id: `zaobao-${i}`,
            title: title,
            url: `https://www.zaobao.com${url}`,
            pubDate: new Date().toISOString(),
            extra: {
              info: '联合早报'
            }
          })
        }
      })
      
      return items
    } catch (fallbackError) {
      console.error('获取联合早报备用方式也失败:', fallbackError)
      return []
    }
  }
}

// 华尔街见闻
async function fetchWallstreetcn(): Promise<NewsItem[]> {
  try {
    // 使用与源码相同的URL
    const url = "https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=30"
    const res = await myFetch(url)
    return res.data.items.map((k: any) => {
      return {
        id: k.id,
        title: k.title || k.content_text,
        url: k.uri || `https://wallstreetcn.com/live/${k.id}`,
        pubDate: k.display_time ? new Date(k.display_time * 1000).toISOString() : new Date().toISOString(),
        extra: {
          date: k.display_time * 1000,
          info: '华尔街见闻'
        }
      }
    })
  } catch (error) {
    console.error('获取华尔街见闻失败:', error)
    return []
  }
}

// 财联社
async function fetchCls(): Promise<NewsItem[]> {
  try {
    // 使用与源码相同的URL和参数
    const apiUrl = "https://www.cls.cn/nodeapi/updateTelegraphList"
    const params = await getSearchParams()
    const res = await myFetch(apiUrl, {
      query: Object.fromEntries(params)
    })
    
    return res.data.roll_data.filter((k: any) => !k.is_ad).map((k: any) => {
      return {
        id: k.id,
        title: k.title || k.brief,
        url: `https://www.cls.cn/detail/${k.id}`,
        mobileUrl: k.shareurl,
        pubDate: new Date(k.ctime * 1000).toISOString(),
        extra: {
          info: '财联社'
        }
      }
    })
  } catch (error) {
    console.error('获取财联社失败:', error)
    return []
  }
}

// 金十数据
async function fetchJin10(): Promise<NewsItem[]> {
  try {
    // 使用与源码相同的URL和解析逻辑
    const timestamp = Date.now()
    const apiUrl = `https://www.jin10.com/flash_newest.js?t=${timestamp}`
    
    const rawData: string = await myFetch(apiUrl)
    
    const jsonStr = (rawData as string)
      .replace(/^var\s+newest\s*=\s*/, "") // 移除开头的变量声明
      .replace(/;*$/, "") // 移除末尾可能存在的分号
      .trim() // 移除首尾空白字符
      
    const data = JSON.parse(jsonStr)
    
    return data.filter((k: any) => (k.data.title || k.data.content) && !k.channel?.includes(5))
      .map((k: any) => {
        const text = (k.data.title || k.data.content).replace(/<\/?b>/g, "")
        const match = text.match(/^【([^】]*)】(.*)$/)
        const title = match ? match[1] : text
        const desc = match ? match[2] : ""
        
        return {
          id: k.id,
          title: title,
          url: `https://flash.jin10.com/detail/${k.id}`,
          pubDate: new Date(parseInt(k.time) * 1000).toISOString(),
          extra: {
            hover: desc,
            info: k.important ? "✰ 金十数据" : "金十数据"
          }
        }
      })
  } catch (error) {
    console.error('获取金十数据失败:', error)
    return []
  }
}

// 法布财经
async function fetchFastbull(): Promise<NewsItem[]> {
  try {
    // 使用与源码相同的URL
    const baseURL = "https://www.fastbull.cn"
    const apiUrl = `${baseURL}/cn/express-news`
    const html = await myFetch.raw(apiUrl).then(r => r.text())
    const $ = cheerio.load(html)
    const items: NewsItem[] = []
    
    $(".express-content > .item").each((i: number, el: any) => {
      const $item = $(el)
      const title = $item.find(".title").text().trim()
      const url = $item.find("a").attr("href") || ""
      
      if (title && url) {
        items.push({
          id: `fastbull-${i}`,
          title: title,
          url: url.startsWith("http") ? url : `${baseURL}${url}`,
          pubDate: new Date().toISOString(),
          extra: {
            info: '法布财经'
          }
        })
      }
    })
    
    return items
  } catch (error) {
    console.error('获取法布财经失败:', error)
    return []
  }
}

export default defineEventHandler(async (event) => {
  try {
    // 检查API密钥
    const apiKey = getQuery(event).key || ''
    if (apiKey !== API_KEY) {
      setResponseStatus(event, 401)
      return {
        status: 'error',
        message: '无效的API密钥'
      }
    }
    
    // 设置较长的超时时间（30秒）
    const TIMEOUT = 30000
    
    // 获取新闻数据
    let newsMap: Record<string, NewsItem[]> = {
      'zhihu': [],      // 知乎
      'toutiao': [],    // 今日头条
      'thepaper': [],   // 澎湃新闻
      'juejin': [],     // 稀土掘金
      'zaobao': [],     // 联合早报
      'wallstreetcn': [], // 华尔街见闻
      'cls': [],        // 财联社
      'jin10': [],      // 金十数据
      'fastbull': []    // 法布财经
    }
    
    // 定义获取任务，并添加超时处理
    const fetchWithTimeout = async (sourceId: string, fetchFn: () => Promise<NewsItem[]>) => {
      try {
        // 使用Promise.race添加超时处理
        const result = await Promise.race([
          fetchFn(),
          new Promise<NewsItem[]>((_, reject) => {
            setTimeout(() => reject(new Error(`获取${sourceId}超时`)), TIMEOUT)
          })
        ])
        
        // 成功获取数据，最多取10条
        return result.slice(0, 10)
      } catch (error) {
        console.error(`获取${sourceId}失败:`, error)
        // 返回错误提示
        return [{
          id: `error-${sourceId}`,
          title: `${sourceId}信息获取失败`,
          url: 'fail',
          pubDate: new Date().toISOString(),
          extra: {
            info: sourceId
          }
        }]
      }
    }
    
    // 定义所有任务
    const tasks = [
      fetchWithTimeout('zhihu', fetchZhihu),
      fetchWithTimeout('toutiao', fetchToutiao),
      fetchWithTimeout('thepaper', fetchThepaper),
      fetchWithTimeout('juejin', fetchJuejin),
      fetchWithTimeout('zaobao', fetchZaobao),
      fetchWithTimeout('wallstreetcn', fetchWallstreetcn),
      fetchWithTimeout('cls', fetchCls),
      fetchWithTimeout('jin10', fetchJin10),
      fetchWithTimeout('fastbull', fetchFastbull)
    ]
    
    // 等待所有任务完成
    const results = await Promise.all(tasks)
    
    // 将结果映射到对应的信息源
    const sourceIds = Object.keys(newsMap)
    results.forEach((items, index) => {
      const sourceId = sourceIds[index]
      newsMap[sourceId] = items
    })
    
    // 格式化响应数据
    const formattedNews: Record<string, any[]> = {}
    
    // 处理每个来源的新闻
    for (const [sourceId, items] of Object.entries(newsMap)) {
      formattedNews[sourceId] = items.map(item => ({
        title: item.title,
        url: item.url
      }))
    }

    return {
      status: 'success',
      timestamp: new Date().toISOString(),
      sources: Object.keys(newsMap).length,
      news: formattedNews
    }
  } catch (error) {
    console.error('获取新闻源失败:', error)
    setResponseStatus(event, 500)
    return {
      status: 'error',
      message: '服务器内部错误'
    }
  }
}) 