import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import convertHeic from 'heic-convert';
import sharp from 'sharp';

export const photoByteLimit = 10 * 1024 * 1024;
const imageOptions = { limitInputPixels: 32_000_000, failOn: 'warning' };
const formats = new Set(['jpeg', 'png', 'webp', 'heif']);

export async function resizeReportPhoto(bytes) {
  const metadata = await sharp(bytes, imageOptions).metadata();
  if (!formats.has(metadata.format) || (metadata.pages ?? 1) !== 1 ||
      !metadata.width || !metadata.height || metadata.width * metadata.height > imageOptions.limitInputPixels) {
    throw new Error('Unsupported report photo.');
  }
  const input = metadata.format === 'heif' && metadata.compression === 'hevc'
    ? Buffer.from(await convertHeic({ buffer: bytes, format: 'JPEG', quality: 0.9 }))
    : bytes;
  return sharp(input, imageOptions).rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer();
}

export function createReportPhotoStore({ endpoint, bucket, region, accessKeyId, secretAccessKey }) {
  const client = new S3Client({
    endpoint, region, credentials: { accessKeyId, secretAccessKey }, forcePathStyle: true, maxAttempts: 1,
  });
  const options = () => ({ abortSignal: AbortSignal.timeout(5000) });
  return {
    async put(key, bytes) {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: bytes, ContentType: 'image/jpeg',
      }), options());
    },
    async get(key) {
      const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), options());
      return Buffer.from(await Body.transformToByteArray());
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), options());
    },
  };
}
