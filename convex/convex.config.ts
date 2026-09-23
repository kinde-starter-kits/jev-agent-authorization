import {defineApp} from 'convex/server';
import {v} from 'convex/values';

const app = defineApp({
  env: {
    KINDE_ISSUER_URL: v.optional(v.string()),
    GATEHOUSE_AUDIENCE: v.optional(v.string())
  }
});

export default app;
