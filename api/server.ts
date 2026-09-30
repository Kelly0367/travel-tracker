import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import app from './app.js'
import { initDb, getSession } from './db.js'

const PORT = process.env.PORT || 3001

const httpServer = createServer(app)

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
  },
})

// 将 io 实例挂载到 app.locals，供路由使用
app.locals.io = io

io.on('connection', (socket) => {
  // 家人端加入某个分享码的房间
  socket.on('watch:join', ({ code }: { code: string }) => {
    const upperCode = code?.toUpperCase()
    if (!upperCode) return
    socket.join(`room:${upperCode}`)
  })

  // 家人端离开房间
  socket.on('watch:leave', ({ code }: { code: string }) => {
    const upperCode = code?.toUpperCase()
    if (!upperCode) return
    socket.leave(`room:${upperCode}`)
  })

  // 旅行者端通过 socket 直接上报位置（备选通道）
  socket.on(
    'location:update',
    async (data: {
      code: string
      latitude: number
      longitude: number
      accuracy?: number
      timestamp?: number
    }) => {
      const upperCode = data.code?.toUpperCase()
      if (!upperCode || typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return

      // getSession 已改为异步（SQLite），这里需要 await
      const session = await getSession(upperCode)
      if (!session) return

      const ts = data.timestamp || Date.now()
      io.to(`room:${upperCode}`).emit('location:update', {
        code: upperCode,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy ?? null,
        timestamp: ts,
      })
    },
  )

  socket.on('disconnect', () => {
    // 可选：旅行者端断开时标记离线（需配合旅行者端 join 一个标识房间）
  })
})

// 必须先初始化数据库（建表），再开始监听，否则所有 DB 操作都会失败
await initDb()

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server ready on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received')
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received')
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app
