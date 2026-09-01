const apiUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;

if (!apiUrl || !serviceRoleKey) {
  throw new Error('IDENTITY_CONCURRENCY_SUPABASE_ENV_MISSING');
}

const headers = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  'content-type': 'application/json',
};

async function rpc(visitorId) {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/resolve_identity_v1`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      target_workspace_id: '22000000-0000-0000-0000-000000000001',
      target_pixel_id: '32000000-0000-0000-0000-000000000001',
      target_visitor_id: visitorId,
      target_session_id: null,
      observed_at: '2026-09-01T00:00:00.000Z',
      protected_identifiers: [
        {
          type: 'email',
          blind_index: 'f'.repeat(64),
          encrypted_value:
            'aes256gcm.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          encryption_key_version: 1,
        },
      ],
      identity_source: 'manual_browser_identify',
      identity_confidence: 'high',
      target_test_mode: true,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Concurrent identity RPC failed ${response.status}: ${await response.text()}`,
    );
  }

  const data = await response.json();
  return Array.isArray(data) ? data[0] : data;
}

const [first, second] = await Promise.all([
  rpc('43000000-0000-7000-8000-000000000001'),
  rpc('43000000-0000-7000-8000-000000000002'),
]);

if (
  first?.resolution_status !== 'RESOLVED' ||
  second?.resolution_status !== 'RESOLVED' ||
  !first.person_id ||
  first.person_id !== second.person_id
) {
  throw new Error('CONCURRENT_IDENTITY_CREATED_DUPLICATE_PERSONS');
}

const response = await fetch(
  `${apiUrl}/rest/v1/persons?workspace_id=eq.22000000-0000-0000-0000-000000000001&id=eq.${first.person_id}&select=id`,
  {
    headers,
  },
);

if (!response.ok) {
  throw new Error(
    `Concurrent identity verification failed ${response.status}: ${await response.text()}`,
  );
}

const people = await response.json();

if (!Array.isArray(people) || people.length !== 1) {
  throw new Error('CONCURRENT_IDENTITY_PERSON_COUNT_INVALID');
}

console.log('Concurrent identify resolved to one canonical Person.');
