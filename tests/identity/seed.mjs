const apiUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;

if (!apiUrl || !serviceRoleKey) {
  throw new Error('IDENTITY_E2E_SUPABASE_ENV_MISSING');
}

const headers = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  'content-type': 'application/json',
};

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Identity E2E seed failed ${response.status}: ${await response.text()}`,
    );
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const email = `identity-e2e-owner-${Date.now()}@example.test`;

const user = await request('/auth/v1/admin/users', {
  method: 'POST',
  body: JSON.stringify({
    email,
    password: 'Prisma-Identity-E2E-2026!',
    email_confirm: true,
  }),
});

if (!user?.id) {
  throw new Error('IDENTITY_E2E_USER_NOT_CREATED');
}

await request('/rest/v1/workspaces', {
  method: 'POST',
  headers: {
    prefer: 'return=minimal',
  },
  body: JSON.stringify({
    id: '22000000-0000-0000-0000-000000000001',
    name: 'Identity E2E Workspace',
    slug: 'identity-e2e-workspace',
    created_by: user.id,
  }),
});

await request('/rest/v1/pixels', {
  method: 'POST',
  headers: {
    prefer: 'return=minimal',
  },
  body: JSON.stringify({
    id: '32000000-0000-0000-0000-000000000001',
    workspace_id: '22000000-0000-0000-0000-000000000001',
    name: 'Identity E2E Pixel',
    public_key: 'px_pub_dddddddddddddddddddddddddddddddddddd',
    created_by: user.id,
  }),
});

console.log('Identity E2E control-plane fixture created.');
