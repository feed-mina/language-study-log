import app from 'vinext/server/app-router-entry';

import { handleAutomationApi } from './worker/api';
import { runScheduled } from './worker/content';
import { ensureAutomationSchema } from './worker/db';
import type { WorkerEnv } from './worker/types';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const apiResponse = await handleAutomationApi(request, env);
    if (apiResponse) return apiResponse;
    return app.fetch(request, env, ctx);
  },

  async scheduled(controller, env): Promise<void> {
    await ensureAutomationSchema(env);
    await runScheduled(controller, env);
  },
} satisfies ExportedHandler<WorkerEnv>;
