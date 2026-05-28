const REDACT_KEYS = new Set([
  'authorization',
  'password',
  'token',
  'secret',
  'cookie',
  'jwt',
  'access_token',
  'refresh_token',
  'x-signature',
  'mercadopago_webhook_secret',
]);

const MAX_STRING = 500;
const MAX_ARRAY = 20;
const MAX_DEPTH = 6;

export function sanitizeForProcessAudit(
  value: unknown,
  maxBytes = 4096,
  depth = 0,
): unknown {
  if (depth > MAX_DEPTH) {
    return '[MAX_DEPTH]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    if (value.includes('users/') && value.endsWith('.pdf')) {
      return `…${value.slice(-24)}`;
    }
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    const slice = value
      .slice(0, MAX_ARRAY)
      .map((v) => sanitizeForProcessAudit(v, maxBytes, depth + 1));
    if (value.length > MAX_ARRAY) {
      slice.push(`…+${value.length - MAX_ARRAY} items`);
    }
    return slice;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const keyLower = k.toLowerCase();
      if (REDACT_KEYS.has(keyLower) || keyLower.includes('secret')) {
        out[k] = '[REDACTED]';
        continue;
      }
      if (keyLower === 'storagekey' && typeof v === 'string') {
        out[k] = `…${v.slice(-24)}`;
        continue;
      }
      out[k] = sanitizeForProcessAudit(v, maxBytes, depth + 1);
    }
    return trimJsonSize(out, maxBytes);
  }
  return String(value);
}

function trimJsonSize(obj: unknown, maxBytes: number): unknown {
  let serialized = JSON.stringify(obj);
  if (serialized.length <= maxBytes) {
    return obj;
  }
  return {
    _truncated: true,
    preview: serialized.slice(0, maxBytes - 50),
  };
}

export function extractProblemCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') {
    return undefined;
  }
  const response = (err as { response?: { code?: string } }).response;
  if (response?.code) {
    return response.code;
  }
  const problem = (err as { problem?: { code?: string } }).problem;
  return problem?.code;
}
