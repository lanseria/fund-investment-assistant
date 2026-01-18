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
