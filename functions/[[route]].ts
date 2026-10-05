import workerHandler, { Env } from '../deploy/cloudflare-worker';

export const onRequest: PagesFunction<Env> = async (context) => {
  return workerHandler.fetch(context.request, context.env as any);
};
