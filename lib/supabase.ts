import { createClient } from '@supabase/supabase-js';

function getRuntimeEnv(name: string) {
  return process.env[name]?.trim() ?? '';
}

function getProjectRef(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname.endsWith('.supabase.co') ? hostname.slice(0, -'.supabase.co'.length) : '';
  } catch {
    return '';
  }
}

function getLegacyKeyProjectRef(key: string) {
  const payload = key.split('.')[1];
  if (!payload) return '';

  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims && typeof claims === 'object' && 'ref' in claims && typeof claims.ref === 'string'
      ? claims.ref
      : '';
  } catch {
    return '';
  }
}

export function getSupabaseConfigDiagnostics() {
  const urlName = getRuntimeEnv('SUPABASE_URL') ? 'SUPABASE_URL' : 'NEXT_PUBLIC_SUPABASE_URL';
  const keyName = getRuntimeEnv('SUPABASE_SECRET_KEY') ? 'SUPABASE_SECRET_KEY' : 'SUPABASE_SERVICE_ROLE_KEY';
  const url = getRuntimeEnv(urlName);
  const key = getRuntimeEnv(keyName);
  const legacyPayload = key.split('.')[1];
  let legacyRole = '';

  if (legacyPayload) {
    try {
      const claims: unknown = JSON.parse(Buffer.from(legacyPayload, 'base64url').toString('utf8'));
      if (claims && typeof claims === 'object' && 'role' in claims && typeof claims.role === 'string') {
        legacyRole = claims.role;
      }
    } catch {
      // The key format is reported below without logging the key itself.
    }
  }

  return {
    urlVariable: urlName,
    projectHost: (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return 'invalid-url';
      }
    })(),
    keyVariable: keyName,
    keyFormat: key.startsWith('sb_secret_')
      ? 'secret'
      : key.startsWith('sb_publishable_')
        ? 'publishable'
        : legacyPayload
          ? 'legacy-jwt'
          : key
            ? 'unknown'
            : 'missing',
    keyLength: key.length,
    legacyRole: legacyRole || undefined,
  };
}

export function getSupabaseAdmin() {
  const url = getRuntimeEnv('SUPABASE_URL') || getRuntimeEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = getRuntimeEnv('SUPABASE_SECRET_KEY') || getRuntimeEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다. SUPABASE_URL과 SUPABASE_SECRET_KEY를 설정해주세요.');
  }

  const urlProjectRef = getProjectRef(url);
  const keyProjectRef = getLegacyKeyProjectRef(serviceRoleKey);
  if (urlProjectRef && keyProjectRef && urlProjectRef !== keyProjectRef) {
    throw new Error('Supabase 프로젝트 URL과 API 키가 서로 다른 프로젝트의 값입니다. Railway의 SUPABASE_URL과 SUPABASE_SECRET_KEY를 같은 프로젝트에서 복사해주세요.');
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabaseErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : '';

  if (!message) return fallback;
  if (/invalid api key/i.test(message)) {
    return 'Supabase가 서버 API 키를 거부했습니다. Railway의 SUPABASE_URL과 SUPABASE_SECRET_KEY가 같은 프로젝트의 현재 활성 키인지 확인해주세요.';
  }
  if (code === '42P01' || code === 'PGRST205') {
    return `Supabase에서 필요한 테이블을 찾지 못했습니다. 최신 supabase/schema.sql을 SQL Editor에서 실행해주세요. (${code})`;
  }
  if (code) return `${message} (${code})`;
  return message;
}

export function getKoreaDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
