interface AccessClient {
  auth: {
    getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: { ativo: boolean | null } | null; error: unknown }>;
      };
    };
  };
}

// Validate the user first; approval is read only from the protected server-side profile.
export async function operatorAccessStatus(
  authorization: string | null,
  client: AccessClient,
): Promise<401 | 403 | null> {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return 401;
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) return 401;
  const profile = await client.from('profiles').select('ativo').eq('id', data.user.id).maybeSingle();
  if (profile.error || profile.data?.ativo !== true) return 403;
  return null;
}