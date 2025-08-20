import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connecting: Promise<void> | null = null;

export async function getRedisClient(): Promise<RedisClient> {
  if (client && client.isOpen) return client;
  if (connecting) {
    await connecting;
    return client as RedisClient;
  }

  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";

  const c = createClient({ url });
  c.on("error", (err) => {
    console.error("Redis Client Error:", err);
  });

  connecting = c.connect().then(() => {
    client = c;
  });

  await connecting;
  return client as RedisClient;
}
