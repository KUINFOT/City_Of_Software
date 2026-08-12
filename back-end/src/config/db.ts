import mongoose from 'mongoose';
import { env } from './env';

/**
 * Connects to MongoDB Atlas using Mongoose. Throws on failure so the caller
 * can decide how to handle a missing/invalid connection string.
 */
export async function connectDB(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongodbUri);
  console.log('✅ Connected to MongoDB');
}
