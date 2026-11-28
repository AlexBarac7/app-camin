import { randomUUID } from 'node:crypto';
import { json, Router } from 'express';
import multer from 'multer';
import { transaction } from '../../db.js';
import { operatorAccountsSql, roleQueryValues } from '../auth/account-roles.js';
import { photoByteLimit, resizeReportPhoto } from '../laundry/report-photos.js';

export const announcementTitle = 'Notificare de la Administrator';
const photoLimit = 4;
const body = json({ limit: '16kb' });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: photoByteLimit, fields: 2, fieldSize: 8192, parts: photoLimit + 3 },
}).array('photos', photoLimit);

export function validNoticeId(id) {
  return /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n;
}

const administrator = (_req, res, next) =>
  res.locals.account.role === 'administrator' ? next() : res.sendStatus(403);

async function findPublication(database, userId, requestId) {
  const { rows: [row] } = await database.query(
    'SELECT id FROM admin_announcements WHERE author_id = $1 AND request_id = $2', [userId, requestId]);
  return row;
}

async function publish(database, { userId, requestId, message, photoKeys, testAccounts }) {
  return transaction(database, async client => {
    const { rows: [announcement] } = await client.query(`
      INSERT INTO admin_announcements (author_id, request_id, message)
      VALUES ($1, $2, $3) ON CONFLICT (author_id, request_id) DO NOTHING
      RETURNING id, created_at`, [userId, requestId, message]);
    if (announcement) {
      const { id, created_at: createdAt } = announcement;
      if (photoKeys.length) await client.query(`
        INSERT INTO admin_announcement_photos (announcement_id, photo_key)
        SELECT $1::bigint, photo_key FROM unnest($2::text[]) AS photo_key`, [id, photoKeys]);

      await client.query(`
        WITH notices AS (
          INSERT INTO laundry_notifications (announcement_id, user_id, kind, message, created_at)
          SELECT $5::bigint, id, 'announcement', $6::text, $7::timestamptz FROM users
          WHERE id <> $4 AND (email NOT IN ($2, $3) OR $1::boolean) AND NOT ${operatorAccountsSql}
          RETURNING id, user_id
        )
        INSERT INTO push_deliveries (notification_id, subscription_id)
        SELECT notices.id, subscription.id FROM notices
        JOIN push_subscriptions subscription USING (user_id)`,
      [...roleQueryValues(testAccounts), userId, id, announcementTitle, createdAt]);
    }
    return announcement;
  });
}

async function removePhotos(photos, keys) {
  await Promise.all(keys.map(key => photos.remove(key).catch(() => {})));
}

export function announcementRoutes(database, photos) {
  const router = Router();

  router.get('/', administrator, async (_req, res) => {
    const { rows } = await database.query(`
      SELECT announcement.id, announcement.message, announcement.created_at AS "createdAt",
        ARRAY(SELECT photo.id FROM admin_announcement_photos photo
          WHERE photo.announcement_id = announcement.id ORDER BY photo.id) AS "photoIds"
      FROM admin_announcements announcement WHERE announcement.author_id = $1 ORDER BY announcement.id DESC`,
    [res.locals.account.id]);
    res.json(rows);
  });

  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const { role, id: userId } = res.locals.account;
    if (!validNoticeId(id) || role !== 'administrator') return res.sendStatus(404);
    const { rows: [announcement] } = await database.query(`
      SELECT id FROM admin_announcements WHERE id = $1 AND author_id = $2`, [id, userId]);
    if (!announcement) return res.sendStatus(404);
    const { rows } = await database.query(`
      SELECT users.email, notice.announcement_confirmed_at AS "confirmedAt"
      FROM laundry_notifications notice JOIN users ON users.id = notice.user_id
      WHERE notice.announcement_id = $1 ORDER BY users.email`, [id]);
    res.json({ recipients: rows });
  });

  router.get('/:id/photos/:photoId', async (req, res) => {
    const { id, photoId } = req.params;
    const { id: userId, role } = res.locals.account;
    if (!validNoticeId(id) || !validNoticeId(photoId)) return res.sendStatus(404);
    const { rows: [photo] } = await database.query(`
      SELECT photo.photo_key FROM admin_announcement_photos photo
      JOIN admin_announcements announcement ON announcement.id = photo.announcement_id
      WHERE announcement.id = $1 AND photo.id = $2 AND (
        (announcement.author_id = $3 AND $4::boolean) OR EXISTS (
          SELECT 1 FROM laundry_notifications notice WHERE notice.announcement_id = $1 AND notice.user_id = $3
        )
      )`, [id, photoId, userId, role === 'administrator']);
    if (!photo) return res.sendStatus(404);
    if (!photos) return res.sendStatus(503);
    const image = await photos.get(photo.photo_key).catch(() => null);
    if (!image) return res.sendStatus(503);
    res.set('X-Content-Type-Options', 'nosniff').type('image/jpeg').send(image);
  });

  router.post('/', administrator, (req, res, next) =>
    (req.is('multipart/form-data') ? upload : body)(req, res, next), async (req, res) => {
    const { requestId, message: rawMessage } = req.body ?? {};
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    if (!message || message.length > 2000 || message.includes('\0') || typeof requestId !== 'string' ||
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId)) return res.sendStatus(400);

    const { id: userId } = res.locals.account;
    const existing = await findPublication(database, userId, requestId);
    if (existing) return res.json(existing);

    const files = req.files ?? [];
    if (files.length && !photos) return res.sendStatus(503);
    const photoKeys = [];
    for (const file of files) {
      const image = await resizeReportPhoto(file.buffer).catch(() => null);
      if (!image) {
        await removePhotos(photos, photoKeys);
        return res.sendStatus(422);
      }
      const key = 'announcements/' + randomUUID() + '.jpg';
      photoKeys.push(key);
      try {
        await photos.put(key, image);
      } catch {
        await removePhotos(photos, photoKeys);
        return res.sendStatus(503);
      }
    }

    let announcement;
    try {
      announcement = await publish(database, { userId, requestId, message, photoKeys, testAccounts: req.app.locals.testAccounts });
    } catch (error) {
      if (photoKeys.length) {
        // A failed response to COMMIT can still leave a published announcement.
        await database.query('SELECT photo_key FROM admin_announcement_photos WHERE photo_key = ANY($1)', [photoKeys])
          .then(({ rows }) => removePhotos(photos, photoKeys.filter(key => !rows.some(row => row.photo_key === key))))
          .catch(() => {});
      }
      throw error;
    }
    if (!announcement) {
      await removePhotos(photos, photoKeys);
      return res.json(await findPublication(database, userId, requestId));
    }
    res.status(201).json({ id: announcement.id });
  });

  router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) return res.sendStatus(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
    if (req.is('multipart/form-data') && /^(Multipart:|Unexpected end of form|Malformed part header)/.test(error.message)) {
      return res.sendStatus(400);
    }
    next(error);
  });
  return router;
}
