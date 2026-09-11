export type Task = {
  id: string
  rank: number
  action: string
  customer: string
  group: string
  detail: string
  due: string
  tone: 'blue' | 'amber' | 'slate'
  badge?: string
  companion?: string
  button?: string
}
