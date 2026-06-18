import { Queue } from "bullmq";

function parseRedisUrl(url: string) {
  const u = new URL(url);
  const opts: Record<string, any> = {
    host: u.hostname,
    port: Number(u.port) || 6379,
    maxRetriesPerRequest: null,
  };
  if (u.password) opts.password = decodeURIComponent(u.password);
  if (u.username) opts.username = decodeURIComponent(u.username);
  if (u.protocol === "rediss:") opts.tls = {};
  return opts;
}

export const bullConnectionOptions = parseRedisUrl(
  process.env.REDIS_URL ?? "redis://localhost:6379"
);

export const generationQueue = new Queue("generation", {
  connection: bullConnectionOptions,
});
