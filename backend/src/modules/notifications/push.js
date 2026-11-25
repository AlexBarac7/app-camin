import { sendNotification } from 'web-push';

export function pushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash &&
      (url.hostname === 'fcm.googleapis.com' || url.hostname.endsWith('.push.apple.com'));
  } catch {
    return false;
  }
}

export function subscriptionKeys(keys) {
  return typeof keys?.p256dh === 'string' && /^[A-Za-z0-9_-]{87}$/.test(keys.p256dh) &&
    Buffer.from(keys.p256dh, 'base64url')[0] === 4 &&
    typeof keys.auth === 'string' && /^[A-Za-z0-9_-]{22}$/.test(keys.auth);
}

export async function deliverPush(delivery, send) {
  if (!pushEndpoint(delivery.endpoint)) return 'unsubscribe';
  const offerTtl = delivery.expires_at
    ? Math.floor((delivery.expires_at - delivery.now) / 1000) : null;
  if (offerTtl !== null && (offerTtl < 1 || delivery.offer_status !== 'pending')) return 'done';
  try {
    await send({
      endpoint: delivery.endpoint,
      keys: { p256dh: delivery.p256dh, auth: delivery.auth },
    }, JSON.stringify({ id: delivery.notification_id }), {
      TTL: offerTtl ?? 3600, urgency: offerTtl === null ? 'normal' : 'high', timeout: 4000,
    });
    return 'done';
  } catch (error) {
    if ([404, 410].includes(error.statusCode)) return 'unsubscribe';
    const transient = !error.statusCode || error.statusCode === 429 || error.statusCode >= 500;
    return transient && delivery.attempts < 5 ? 'retry' : 'done';
  }
}

export async function dispatchPushDeliveries(database, send) {
  const { rows } = await database.query(`
    WITH due AS (
      SELECT notification_id, subscription_id FROM push_deliveries
      WHERE next_attempt_at <= statement_timestamp()
      ORDER BY next_attempt_at, notification_id, subscription_id LIMIT 8 FOR UPDATE SKIP LOCKED
    ), leased AS (
      UPDATE push_deliveries delivery SET attempts = delivery.attempts + 1,
        next_attempt_at = statement_timestamp() + interval '1 minute'
      FROM due WHERE delivery.notification_id = due.notification_id AND delivery.subscription_id = due.subscription_id
      RETURNING delivery.*
    )
    SELECT leased.*, subscription.endpoint, subscription.p256dh, subscription.auth,
      offer.expires_at, offer.status AS offer_status, statement_timestamp() AS now
    FROM leased JOIN push_subscriptions subscription ON subscription.id = leased.subscription_id
    LEFT JOIN laundry_restoration_offers offer ON offer.notification_id = leased.notification_id`);

  await Promise.all(rows.map(async delivery => {
    const result = await deliverPush(delivery, send);
    if (result === 'unsubscribe') {
      await database.query('DELETE FROM push_subscriptions WHERE id = $1 AND p256dh = $2 AND auth = $3',
        [delivery.subscription_id, delivery.p256dh, delivery.auth]);
    }
    if (result === 'retry') {
      await database.query(`
        UPDATE push_deliveries SET next_attempt_at = clock_timestamp() + ($4::integer * interval '1 second')
        WHERE notification_id = $1 AND subscription_id = $2 AND attempts = $3`,
      [delivery.notification_id, delivery.subscription_id, delivery.attempts, 5 * 2 ** (delivery.attempts - 1)]);
    } else {
      await database.query(`
        DELETE FROM push_deliveries WHERE notification_id = $1 AND subscription_id = $2 AND attempts = $3`,
      [delivery.notification_id, delivery.subscription_id, delivery.attempts]);
    }
  }));
}

export function startPushDelivery(database, vapidDetails) {
  if (!vapidDetails) return async () => {};
  const send = (subscription, payload, options) =>
    sendNotification(subscription, payload, { ...options, vapidDetails });
  let current;
  const timer = setInterval(() => {
    if (current) return;
    current = dispatchPushDeliveries(database, send).catch(() => {
      console.error('Could not process pending Web Push deliveries.');
    }).finally(() => { current = null; });
  }, 2000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await current;
  };
}
