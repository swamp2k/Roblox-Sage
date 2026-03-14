import { getRequestContext } from '@cloudflare/next-on-pages';

export const getDb = () => {
    // In Edge runtime, D1 is injected via the context
    // We cast it to any here to avoid strict TS type issues without a full env.d.ts setup
    return getRequestContext().env.DB as any;
};
