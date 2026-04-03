import mongoose from 'mongoose'
import { requireEnv } from './env'

// Cache the connection across serverless function invocations
const globalForMongoose = globalThis as unknown as {
  mongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
}

if (!globalForMongoose.mongoose) {
  globalForMongoose.mongoose = { conn: null, promise: null }
}

export const connectDB = async (): Promise<typeof mongoose> => {
  if (globalForMongoose.mongoose.conn) return globalForMongoose.mongoose.conn

  if (!globalForMongoose.mongoose.promise) {
    globalForMongoose.mongoose.promise = mongoose.connect(requireEnv.MONGO_URI())
  }

  globalForMongoose.mongoose.conn = await globalForMongoose.mongoose.promise
  console.info('MongoDB connected')
  return globalForMongoose.mongoose.conn
}
