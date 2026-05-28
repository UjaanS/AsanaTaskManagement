import { spawn } from "node:child_process";
import { startServer } from "./index";

const api = startServer(Number(process.env.PORT ?? 8787));
const vite = spawn("vite", ["--host", "127.0.0.1"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    PATH: `./node_modules/.bin:${process.env.PATH ?? ""}`,
  },
});

function shutdown() {
  vite.kill("SIGTERM");
  api.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
vite.on("exit", () => api.close());
