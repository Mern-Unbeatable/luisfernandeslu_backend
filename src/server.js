import { env, assertEnv } from './config/env.js'
import app from './app.js'
import { setupSocket } from './socket/index.js'
import { startDeliveryScheduler, stopDeliveryScheduler } from './modules/deliveries/delivery-scheduler.js'

assertEnv()

const PORT = env.port

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
  console.log(`Environment: ${env.nodeEnv}`)
  console.log(`Health check available at: http://localhost:${PORT}/health`)
  console.log(
    `Live chat tester: http://localhost:${PORT}/live-chat-tester.html`,
  )
})

setupSocket(server)
startDeliveryScheduler()
server.on('close', stopDeliveryScheduler)

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  server.close(() => {
    process.exit(1)
  })
})

export default server
