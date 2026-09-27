import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { createWebLoginHandler } from '../_shared/webLogin.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const publishableKey =
  Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
const serviceRoleKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  getDefaultSecretKey(Deno.env.get('SUPABASE_SECRET_KEYS'));

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
    store: {
      async cleanupExpired(now) {
        const { error } = await adminClient
          .from('web_login_challenges')
          .delete()
          .lt('expires_at', now);
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
      async inspectApproval(requestId, secretHash) {
        const { data, error } = await adminClient
          .from('web_login_challenges')
          .select('status, expires_at, origin_host')
          .eq('id', requestId)
          .eq('approval_secret_hash', secretHash)
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