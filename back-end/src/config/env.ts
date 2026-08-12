import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

/**
 * Typed, validated view of the environment. Importing this module throws
 * immediately if a required variable (e.g. MONGODB_URI) is missing.
 */
export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: optional('NODE_ENV', 'development'),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:3000'),
  mongodbUri: required('MONGODB_URI'),
  gcp: {
    projectId: optional('GCP_PROJECT_ID'),
    location: optional('GCP_LOCATION', 'us'),
    docAiProcessorId: optional('DOC_AI_PROCESSOR_ID'),
    vertexLocation: optional('VERTEX_AI_LOCATION', 'us-central1'),
    vertexModel: optional('VERTEX_AI_MODEL', 'gemini-2.0-flash'),
  },
} as const;
