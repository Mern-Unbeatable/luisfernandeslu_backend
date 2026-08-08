import express from 'express'

/**
 * Express application shell (class-based).
 * Mount feature routers here as they are added.
 */
class App {
  constructor() {
    this.app = express()
    this.registerMiddleware()
    this.registerRoutes()
    this.registerErrorHandlers()
  }

  registerMiddleware() {
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))
  }

  registerRoutes() {
    this.app.get('/', (req, res) => {
      res.status(200).json({
        status: 'OK',
        message: 'Welcome to the CONSTRUPRECO API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      })
    })

    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'OK',
        message: 'Server is running',
        timestamp: new Date().toISOString(),
      })
    })
  }

  registerErrorHandlers() {
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource does not exist',
      })
    })

    this.app.use((err, req, res, next) => {
      console.error('Error:', err)

      res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      })
    })
  }

  get instance() {
    return this.app
  }
}

export default App
