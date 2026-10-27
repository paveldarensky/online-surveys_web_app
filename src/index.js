import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { checkConnection, pool } from './db/pool.js';

async function waitForDatabase(attempts = 30, delayMs = 1000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await checkConnection();
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.log(`База ещё не готова, повтор ${attempt}/${attempts}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  await waitForDatabase();
  await migrate();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`Сервер слушает порт ${config.port}`);
  });

  const shutdown = async () => {
    server.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
