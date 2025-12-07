import { app } from './app';
import { env } from './core/config/env';
import { connectDB, disconnectDB } from './core/db/client';

const port = Number(env.PORT) || 4000;

async function start() {
  try {
    await connectDB();

    // Escuchar en 0.0.0.0 para que sea accesible desde la red local
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 API listening on http://0.0.0.0:${port}`);
    });

    const shutdown = async () => {
      console.log('Shutting down gracefully...');
      server.close(async () => {
        await disconnectDB();
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
