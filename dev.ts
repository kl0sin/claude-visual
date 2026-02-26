// Dev script — runs both server and Vite frontend concurrently

const server = Bun.spawn(["bun", "--watch", "server/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env },
});

const client = Bun.spawn(["bunx", "vite"], {
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env },
});

process.on("SIGINT", () => {
  server.kill();
  client.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.kill();
  client.kill();
  process.exit(0);
});

await Promise.race([server.exited, client.exited]);

// If one exits, kill the other
server.kill();
client.kill();
