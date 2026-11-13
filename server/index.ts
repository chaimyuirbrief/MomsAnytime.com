import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createApp, trustCloudflareFromEnv } from "./app.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  // The CAPTCHA wall reads TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY from the
  // environment; without them every request is a 503 (README: "Node hosts").
  const { app } = createApp({
    staticPath,
    env: process.env,
    trustCloudflare: trustCloudflareFromEnv(),
    localDev: process.env.GATE_LOCAL_DEV === "1",
  });
  const server = createServer(app);

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
