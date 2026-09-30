/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import trackerRoutes from './routes/tracker.js'

// load env
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api', trackerRoutes)

/**
 * health
 */
app.use('/api/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'ok',
  })
})

/**
 * 生产环境：托管前端 dist 静态文件
 */
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))

// SPA fallback：非 /api 且非静态文件的请求返回 index.html
app.get(/^\/(?!api).*/, (_req: Request, res: Response) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

/**
 * error handler middleware
 */
app.use((_error: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
