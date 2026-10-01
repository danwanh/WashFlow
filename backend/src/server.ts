import 'dotenv/config'
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express'
import cors from 'cors'
import { ApiError } from './services/api.js'
import orders from './routes/orders.js'
import batches from './routes/batches.js'
import machines from './routes/machines.js'
import alerts from './routes/alerts.js'
import queue from './routes/queue.js'
import overview from './routes/overview.js'
import { startTicker } from './services/ticker.js'
import { events, notifyChange } from './services/events.js'

const app = express()
app.use(cors())
app.use(express.json())
app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.get('/api/events', events)
// Tell live clients to refetch after every successful change (trial plans, previews and scans
// change nothing by themselves; a scan that changes alerts notifies on its own).
app.use((req, res, next) => {
  if (
    req.method !== 'GET' &&
    !/\/(plan|scan)\/?$/.test(req.path) &&
    req.body?.preview !== true
  )
    res.on('finish', () => {
      if (res.statusCode < 400) notifyChange(['queue', 'alerts'])
    })
  next()
})
app.use('/api/orders', orders)
app.use('/api/batches', batches)
app.use('/api/machines', machines)
app.use('/api/alerts', alerts)
app.use('/api/queue', queue)
app.use('/api/overview', overview)
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError)
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    })
  console.error(err)
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error',
      details: {},
    },
  })
})

const port = Number(process.env.PORT ?? 3000)
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`WashFlow API listening on ${port}`))
  startTicker()
}
export { app }
