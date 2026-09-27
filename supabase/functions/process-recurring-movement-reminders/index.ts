import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webPush from 'npm:web-push';

type Reminder = {
  amount_text: string;
  currency: string;
  due_on: string;
  endpoint: string;
  kind: string;
  label: string;
  p256dh: string;
  recurring_movement_id: string;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  getDefaultSecretKey(Deno.env.get('SUPABASE_SECRET_KEYS'));
const cronSecret = Deno.env.get('ACCOUNT_DELETION_CRON_SECRET') ?? '';
const vapidPublicKey = Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY');
const vapidPrivateKey = Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY');
const vapidSubject = Deno.env.get('WEB_PUSH_VAPID_SUBJECT');

if (
  !supabaseUrl ||
  !serviceRoleKey ||
  !cronSecret ||
  !vapidPublicKey ||
  !vapidPrivateKey ||
  !vapidSubject
) {
  Deno.serve(() =>
    Response.json({ error: 'Reminder service configuration unavailable.' }, { status: 500 }),
  );
} else {
  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  Deno.serve(async (request) => {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed.' }, { status: 405 });
    }
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data, error } = await adminClient.rpc('claim_due_recurring_movement_reminders');
    if (error) {
      return Response.json({ error: 'Could not claim recurring reminders.' }, { status: 500 });
    }

    const results = await Promise.all((data ?? []).map((reminder) => sendReminder(reminder)));
    return Response.json({ sent: results.filter(Boolean).length, total: results.length });
  });

  async function sendReminder(reminder: Reminder): Promise<boolean> {
    const topic = `${reminder.recurring_movement_id.replaceAll('-', '').slice(0, 24)}${reminder.due_on.replaceAll('-', '').slice(0, 8)}`;

    try {
      await webPush.sendNotification(
        {
          endpoint: reminder.endpoint,
          keys: { auth: reminder.auth_secret, p256dh: reminder.p256dh },
        },
        JSON.stringify({
          amount: reminder.amount_text,
          currency: reminder.currency,
          dueOn: reminder.due_on,
          kind: reminder.kind,
          label: reminder.label,
          recurringMovementId: reminder.recurring_movement_id,
          type: 'recurring-movement-reminder',
        }),
        { TTL: 60 * 60 * 24, topic, urgency: 'normal' },
      );
      return true;
    } catch (error) {
      if ([404, 410].includes(getPushStatusCode(error) ?? 0)) {
        await adminClient
          .from('web_login_push_subscriptions')
          .delete()
          .eq('endpoint', reminder.endpoint);
      }
      return false;
    }
  }
}

function getPushStatusCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return null;
  }
  return typeof error.statusCode === 'number' ? error.statusCode : null;
}

function getDefaultSecretKey(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const secretKeys = JSON.parse(value) as Record<string, unknown>;
    return typeof secretKeys.default === 'string' ? secretKeys.default : undefined;
  } catch {
    return undefined;
  }
}
