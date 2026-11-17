import path from 'path'
import express from 'express'
import { connectDB } from './db.js'
import { createApp } from './app.js'

const BUILD_DIR = path.join(import.meta.dirname, '../public/')

// The same app api/index.ts deploys, plus the static build (served by Vercel's CDN in production).
const app = express()
app.use(express.static(BUILD_DIR))
app.use(createApp())

connectDB()
  .then(() => app.listen(8080, () => console.info('Listening on port 8080!')))
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err)
    process.exit(1)
  })
