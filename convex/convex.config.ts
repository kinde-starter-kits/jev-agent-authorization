import {defineApp} from 'convex/server';
import {v} from 'convex/values';

const app = defineApp({
  env: {
    KINDE_ISSUER_URL: v.optional(v.string()),
    GATEHOUSE_AUDIENCE: v.optional(v.string()),
    GATEHOUSE_ORG_CODE: v.optional(v.string()),
    KINDE_M2M_CLIENT_ID: v.optional(v.string()),
    KINDE_M2M_CLIENT_SECRET: v.optional(v.string()),
    OPENROUTER_API_KEY: v.optional(v.string()),
    JEV_MODEL: v.optional(v.string()),
    LLM_JUDGE_MODEL: v.optional(v.string()),
    KINDE_WEB_CLIENT_ID: v.optional(v.string()),
    GATEHOUSE_APP_URL: v.optional(v.string())
  }
});

export default app;
