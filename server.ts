import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createImChargeApp } from './src/server/createApp';
import { store } from './src/server/store';

async function startServer() {
  const { app, broadcastSnapshot } = createImChargeApp();

  // Server-authoritative OCPP/OCPI telemetry heartbeat ticker (every 2s)
  setInterval(() => {
    const snap = store.getSnapshot();
    if (!snap.telemetryHeartbeatEnabled) return;
    if (Object.keys(snap.liveTelemetry).length === 0) return;
    const updated = store.tickActiveTelemetry(2, 30);
    if (updated > 0) {
      broadcastSnapshot();
    }
  }, 2000);

  // Vite middleware in dev, static serving in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`ImCharge server running on http://0.0.0.0:${port}`);
  });
}

startServer();
