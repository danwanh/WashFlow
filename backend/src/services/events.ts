import type { Request, Response } from 'express'

export type ChangeTopic = 'queue' | 'alerts'

const clients = new Set<Response>()

// Server-Sent Events stream: clients refetch the topics named in each `change` event.
export function events(req: Request, res: Response) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.flushHeaders()
  res.write('retry: 3000\n\n')
  clients.add(res)
  // Comment lines keep proxies from closing an idle connection.
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000)
  req.on('close', () => {
    clearInterval(keepAlive)
    clients.delete(res)
  })
}

export function notifyChange(topics: ChangeTopic[]) {
  if (!topics.length) return
  const message = `event: change\ndata: ${JSON.stringify({ topics })}\n\n`
  for (const client of clients) client.write(message)
}
