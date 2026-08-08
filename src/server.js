import App from './app.js'

/**
 * HTTP server bootstrap (class-based).
 */
class Server {
  constructor({ port = process.env.PORT || 3000 } = {}) {
    this.port = port
    this.app = new App().instance
    this.server = null
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log(`Server is running on port ${this.port}`)
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
      console.log(
        `Health check available at: http://localhost:${this.port}/health`,
      )
    })

    this.registerProcessHandlers()
    return this.server
  }

  stop(exitCode = 0) {
    if (!this.server) {
      process.exit(exitCode)
      return
    }

    this.server.close(() => {
      console.log('HTTP server closed')
      process.exit(exitCode)
    })
  }

  registerProcessHandlers() {
    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received: closing HTTP server')
      this.stop(0)
    })

    process.on('SIGINT', () => {
      console.log('SIGINT signal received: closing HTTP server')
      this.stop(0)
    })

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason)
      this.stop(1)
    })
  }
}

const server = new Server()
server.start()

export default server
