import fs from 'node:fs';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

export function createR2Client(options = {}) {
  const endpoint = options.endpoint || process.env.R2_ENDPOINT;
  const accessKeyId = options.accessKeyId || process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = options.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2 S3 credentials (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true
  });
}

export async function r2ObjectExists(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false;
    throw error;
  }
}

export async function r2PutObject(client, bucket, key, localPath, contentType) {
  const body = fs.readFileSync(localPath);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType
  }));
}
