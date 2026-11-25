import { parentPort, workerData } from 'node:worker_threads';
import convertHeic from 'heic-convert';

const image = await convertHeic({ buffer: Buffer.from(workerData), format: 'JPEG', quality: 0.9 });
parentPort.postMessage(image);
