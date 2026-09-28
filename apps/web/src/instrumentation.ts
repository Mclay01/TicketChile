import type { Instrumentation } from 'next';
import { operationalLog } from '@/lib/observability.server';

export const onRequestError: Instrumentation.onRequestError = () => {
  operationalLog({ action: 'request.failed', category: 'unexpected', severity: 'error' });
};
