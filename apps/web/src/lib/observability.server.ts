import 'server-only';
import { randomUUID } from 'node:crypto';

type Event = { action: 'request.failed' | 'readiness.checked'; category: 'unexpected' | 'database' | 'configuration'; severity: 'error' | 'info'; durationMs?: number };
// Deliberately closed schema: never serialize Error, URLs, headers, bodies or identities.
export function operationalLog(event: Event) {
  const requestId = randomUUID();
  console[event.severity === 'error' ? 'error' : 'info'](JSON.stringify({
    time: new Date().toISOString(), requestId, action: event.action,
    category: event.category, severity: event.severity,
    ...(event.durationMs === undefined ? {} : { durationMs: Math.max(0, Math.round(event.durationMs)) }),
  }));
  return requestId;
}
