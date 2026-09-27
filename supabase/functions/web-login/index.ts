import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webPush from 'web-push';
import { createWebLoginHandler } from '../_shared/webLogin.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const publishableKey =
  Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
const serviceRoleKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  getDefaultSecretKey(Deno.env.get('SUPABASE_SECRET_KEYS'));
const loginCodePepper = Deno.env.get('WEB_LOGIN_CODE_PEPPER');
const vapidPublicKey = Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY');
const vapidPrivateKey = Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY');
const vapidSubject = Deno.env.get('WEB_PUSH_VAPID_SUBJECT');
const isPushConfigured = Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject);

if (isPushConfigured) {
  webPush.setVapidDetails(vapidSubject!, vapidPublicKey!, vapidPrivateKey!);
}

if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
  Deno.serve(() => Response.json({ error: 'Web login service unavailable.' }, { status: 500 }));
} else {
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const handler = createWebLoginHandler({
    async authenticateUser(request) {
      const authorization = request.headers.get('authorization');
      if (!authorization) {
        return null;
      }

      const userClient = createClient(supabaseUrl, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authorization } },
      });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data.user) {
        return null;
      }

      return { email: data.user.email ?? null, id: data.user.id };
    },
    async resolveUserIdByEmail(email) {
      const { data, error } = await adminClient.rpc('find_web_login_user_id', {
        p_email: email,
      });
      if (error) {
        throw new Error('Could not resolve the login account.');
      }
      return typeof data === 'string' ? data : null;
    },
    async hashLoginCode(requestId, code) {
      if (!loginCodePepper || loginCodePepper.length < 32) {
        throw new Error('The login code pepper is not configured.');
      }
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(loginCodePepper),
        { hash: 'SHA-256', name: 'HMAC' },
        false,
        ['sign'],
      );
      const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(`${requestId}:${code}`),
      );
      return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    },
    async generateMagicLinkTokenHash(email) {
      const { data, error } = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });
      if (error || !data.properties.hashed_token) {
        throw new Error('Could not create a one-time login token.');
      }

      return data.properties.hashed_token;
    },
    async sendLoginPush(userId, notification) {
      if (!isPushConfigured) {
        return;
      }

      const { data, error } = await adminClient
        .from('web_login_push_subscriptions')
        .select('endpoint, p256dh, auth_secret')
        .eq('user_id', userId);
      if (error) {
        throw new Error('Could not load mobile push subscriptions.');
      }

      await Promise.all(
        (data ?? []).map(async (subscription) => {
          try {
            await webPush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { auth: subscription.auth_secret, p256dh: subscription.p256dh },
              },
              JSON.stringify({ type: 'web-login-code', ...notification }),
              {
                TTL: 180,
                topic: notification.requestId.replaceAll('-', '').slice(0, 32),
                urgency: 'high',
              },
            );
          } catch (pushError) {
            if ([404, 410].includes(getPushStatusCode(pushError) ?? 0)) {
              await adminClient
                .from('web_login_push_subscriptions')
                .delete()
                .eq('endpoint', subscription.endpoint);
            }
          }
        }),
      );
    },
    store: {
      async cleanupExpired(now) {
        const retainUntil = new Date(Date.parse(now) - 10 * 60 * 1000).toISOString();
        const { error } = await adminClient
          .from('web_login_challenges')
          .delete()
          .lt('expires_at', now)
          .lt('created_at', retainUntil);
        if (error) {
          throw new Error('Could not remove expired login challenges.');
        }
      },
      async create(input) {
        const { data, error } = await adminClient
          .from('web_login_challenges')
          .insert({
            approval_secret_hash: input.approvalSecretHash,
            expires_at: input.expiresAt,
            origin_host: input.originHost,
            poll_secret_hash: input.pollSecretHash,
          })
          .select('id')
          .single();
        if (error || !data) {
          throw new Error('Could not create a login challenge.');
        }

        return data.id;
      },
      async createCodeChallenge(input) {
        const { data, error } = await adminClient.rpc('create_web_login_code_challenge', {
          p_approval_secret_hash: input.approvalSecretHash,
          p_expires_at: input.expiresAt,
          p_origin_host: input.originHost,
          p_poll_secret_hash: input.pollSecretHash,
          p_request_id: input.requestId,
          p_target_user_id: input.targetUserId,
        });
        const result = Array.isArray(data) ? data[0] : null;
        if (error || !result || !('notification_user_id' in result)) {
          throw new Error('Could not create a login code challenge.');
        }

        return {
          notificationUserId:
            typeof result.notification_user_id === 'string' ? result.notification_user_id : null,
          requestId: input.requestId,
        };
      },
      async inspectApproval(requestId, secretHash) {
        const { data, error } = await adminClient
          .from('web_login_challenges')
          .select('status, expires_at, origin_host')
          .eq('id', requestId)
          .eq('approval_secret_hash', secretHash)
          .eq('login_method', 'qr')
          .maybeSingle();
        if (error) {
          throw new Error('Could not inspect the login challenge.');
        }
        if (!data) {
          return null;
        }

        return {
          expiresAt: data.expires_at,
          originHost: data.origin_host,
          status: data.status,
        };
      },
      async listPendingCodeApprovals(userId, now) {
        const { data, error } = await adminClient
          .from('web_login_challenges')
          .select('id, created_at, expires_at, origin_host')
          .eq('target_user_id', userId)
          .eq('login_method', 'code')
          .eq('status', 'pending')
          .gt('expires_at', now)
          .order('created_at', { ascending: true })
          .limit(10);
        if (error) {
          throw new Error('Could not list pending mobile approvals.');
        }

        return (data ?? []).map((approval) => ({
          createdAt: approval.created_at,
          expiresAt: approval.expires_at,
          originHost: approval.origin_host,
          requestId: approval.id,
        }));
      },
      async inspectCodeApproval(requestId, userId, now) {
        const { data, error } = await adminClient
          .from('web_login_challenges')
          .select('approval_secret_hash, failed_attempts, status, expires_at, origin_host')
          .eq('id', requestId)
          .eq('target_user_id', userId)
          .eq('login_method', 'code')
          .eq('status', 'pending')
          .gt('expires_at', now)
          .maybeSingle();
        if (error) {
          throw new Error('Could not inspect the mobile approval.');
        }
        if (!data) {
          return null;
        }

        return {
          approvalSecretHash: data.approval_secret_hash,
          expiresAt: data.expires_at,
          failedAttempts: data.failed_attempts,
          originHost: data.origin_host,
          status: data.status,
        };
      },
      async recordFailedCodeAttempt(requestId, userId) {
        const { data, error } = await adminClient.rpc('record_web_login_code_failure', {
          p_request_id: requestId,
          p_user_id: userId,
        });
        if (error) {
          throw new Error('Could not record the failed login code attempt.');
        }
        return typeof data === 'number' ? data : null;
      },
      async rejectCodeApproval(requestId, userId) {
        const { data, error } = await adminClient.rpc('reject_web_login_code_challenge', {
          p_request_id: requestId,
          p_user_id: userId,
        });
        if (error) {
          throw new Error('Could not reject the login challenge.');
        }
        return data === true;
      },
      async registerPushSubscription(userId, subscription) {
        const { error } = await adminClient
          .from('web_login_push_subscriptions')
          .upsert(
            {
              auth_secret: subscription.keys.auth,
              endpoint: subscription.endpoint,
              p256dh: subscription.keys.p256dh,
              user_id: userId,
            },
            { onConflict: 'endpoint' },
          );
        if (error) {
          throw new Error('Could not save the mobile push subscription.');
        }
      },
      async removePushSubscription(userId, endpoint) {
        const { error } = await adminClient
          .from('web_login_push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', endpoint);
        if (error) {
          throw new Error('Could not remove the mobile push subscription.');
        }
      },
      async inspectPoll(requestId, secretHash) {
        const { data, error } = await adminClient
          .from('web_login_challenges')
          .select('status, expires_at, origin_host')
          .eq('id', requestId)
          .eq('poll_secret_hash', secretHash)
          .maybeSingle();
        if (error) {
          throw new Error('Could not inspect the login challenge.');
        }
        if (!data) {
          return null;
        }

        return {
          expiresAt: data.expires_at,
          originHost: data.origin_host,
          status: data.status,
        };
      },
      async approve(input) {
        const { data, error } = await adminClient.rpc('approve_web_login_challenge', {
          p_account_email: input.accountEmail,
          p_approval_secret_hash: input.approvalSecretHash,
          p_magic_link_token_hash: input.magicLinkTokenHash,
          p_request_id: input.requestId,
          p_user_id: input.userId,
        });
        if (error) {
          throw new Error('Could not approve the login challenge.');
        }

        return data === true;
      },
      async approveCode(input) {
        const { data, error } = await adminClient.rpc('approve_web_login_code_challenge', {
          p_account_email: input.accountEmail,
          p_approval_secret_hash: input.approvalSecretHash,
          p_magic_link_token_hash: input.magicLinkTokenHash,
          p_request_id: input.requestId,
          p_user_id: input.userId,
        });
        if (error) {
          throw new Error('Could not approve the mobile login code.');
        }

        return data === true;
      },
      async consume(requestId, pollSecretHash) {
        const { data, error } = await adminClient.rpc('consume_web_login_challenge', {
          p_poll_secret_hash: pollSecretHash,
          p_request_id: requestId,
        });
        if (error) {
          throw new Error('Could not consume the login challenge.');
        }

        const handoff = Array.isArray(data) ? data[0] : null;
        if (
          !handoff ||
          typeof handoff.account_email !== 'string' ||
          typeof handoff.magic_link_token_hash !== 'string'
        ) {
          return null;
        }

        return {
          accountEmail: handoff.account_email,
          magicLinkTokenHash: handoff.magic_link_token_hash,
        };
      },
    },
  });

  Deno.serve(handler);
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

function getPushStatusCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return null;
  }
  return typeof error.statusCode === 'number' ? error.statusCode : null;
}