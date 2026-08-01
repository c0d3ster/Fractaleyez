import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { requireEnv } from '../env'

// Particles served from R2 are content-addressed / never overwritten in place, so
// they're safe to cache forever on both R2's edge and the client.
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

let client: S3Client | null = null

const getClient = (): S3Client => {
  if (client) return client
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${requireEnv.R2_ACCOUNT_ID()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv.R2_ACCESS_KEY_ID(),
      secretAccessKey: requireEnv.R2_SECRET_ACCESS_KEY(),
    },
  })
  return client
}

export class StorageService {
  async objectExists(key: string): Promise<boolean> {
    try {
      await getClient().send(new HeadObjectCommand({ Bucket: requireEnv.R2_BUCKET_NAME(), Key: key }))
      return true
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name
      if (name === 'NotFound' || name === 'NoSuchKey') return false
      throw err
    }
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<string> {
    await getClient().send(new PutObjectCommand({
      Bucket: requireEnv.R2_BUCKET_NAME(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    }))
    return this.buildPublicUrl(key)
  }

  buildPublicUrl(key: string): string {
    return `${requireEnv.R2_PUBLIC_URL().replace(/\/+$/, '')}/${key}`
  }
}

export const storageService = new StorageService()
