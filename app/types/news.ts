export interface NewsItem {
  id: number
  date: string
  title: string
  content?: string | null
  url?: string | null
  tag?: string | null
  createdAt: string
}

export interface NewsData {
  date: string
  title: string | null
  content: string | null
  items: NewsItem[]
}

export interface NewsData {
  date: string
  title: string | null
  content: string | null // 原始报告
  aiAnalysis: string | null // [新增] AI 热点分析
  items: NewsItem[] // AI 精选列表
}
