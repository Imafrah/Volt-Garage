import express from 'express';
import { IS_SERVERLESS, store } from './store';

export interface ImChargeAppHandle {
  app: express.Express;
  broadcastSnapshot: () => void;
}

/**
 * Shared Express API gateway factory used by both local dev server (server.ts)
 * and the Vercel serverless bundle (src/server/vercelApp.ts -> api/server.js).
 */
export function createImChargeApp(): ImChargeAppHandle {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const sseClients = new Set<express.Response>();

  function broadcastSnapshot() {
    if (sseClients.size === 0) return;
    const payload = `event: snapshot\ndata: ${JSON.stringify(store.getSnapshot())}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  // Reconcile stateless/multi-container Vercel state before processing any POST mutation
  app.use('/api/v1', (req, _res, next) => {
    if (
      req.method === 'POST' &&
      req.path !== '/demo/reset' &&
      req.body &&
      typeof req.body === 'object' &&
      '_syncState' in req.body
    ) {
      store.reconcileClientState(req.body._syncState);
    }
    next();
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'imcharge-api-gateway',
      mode: IS_SERVERLESS ? 'serverless' : 'stateful',
    });
  });

  // Explicit client/server state reconciliation endpoint (used after page reload on serverless)
  app.post('/api/v1/state/sync', (req, res) => {
    try {
      const clientSnapshot = req.body?.snapshot ?? req.body?._syncState;
      store.reconcileClientState(clientSnapshot);
      res.json({ snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // SSE Live Telemetry & Platform State Stream
  app.get('/api/v1/telemetry/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    sseClients.add(res);
    res.write(
      `event: snapshot\ndata: ${JSON.stringify(store.getSnapshot())}\n\n`
    );

    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // OCPP 2.0.1 / OCPI 2.2 Smart Meter Webhook Ingestion
  app.post('/api/v1/telemetry/ocpp', (req, res) => {
    try {
      const { chargingPointId, connectorId, eventType, powerKw, meterWh, status } =
        req.body || {};
      if (!chargingPointId || !connectorId || !eventType) {
        res.status(400).json({
          error: 'chargingPointId, connectorId, and eventType are required.',
        });
        return;
      }
      if (
        eventType !== 'MeterValues' &&
        eventType !== 'StatusNotification' &&
        eventType !== 'WalkInLoadDetected'
      ) {
        res.status(400).json({ error: 'Unsupported OCPP eventType.' });
        return;
      }

      const result = store.ingestOcppTelemetry({
        chargingPointId: String(chargingPointId),
        connectorId: String(connectorId),
        eventType,
        powerKw: powerKw !== undefined ? Number(powerKw) : undefined,
        meterWh: meterWh !== undefined ? Number(meterWh) : undefined,
        status,
      });
      broadcastSnapshot();
      res.json({
        event: result.event,
        cancelledReservationIds: result.cancelledReservationIds,
        snapshot: store.getSnapshot(),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/v1/telemetry/heartbeat', (req, res) => {
    try {
      const enabled = store.setTelemetryHeartbeat(Boolean(req.body?.enabled));
      broadcastSnapshot();
      res.json({ enabled, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Full platform snapshot (with auto-expiry of stale 30-min holds)
  app.get('/api/v1/bootstrap', (_req, res) => {
    res.json(store.getSnapshot());
  });

  // Reset demo data
  app.post('/api/v1/demo/reset', (_req, res) => {
    const snap = store.resetDemoData();
    broadcastSnapshot();
    res.json(snap);
  });

  // Account authentication (Sign In for EV Owner & Charging Host)
  app.post('/api/v1/auth/login', (req, res) => {
    try {
      const { role, email, password } = req.body || {};
      if ((role !== 'driver' && role !== 'host') || !email || !password) {
        res.status(400).json({
          error: 'Role, email address, and password are required.',
        });
        return;
      }
      const result = store.authenticate({
        role,
        email: String(email),
        password: String(password),
      });
      res.json({
        role: result.role,
        driver: result.driver,
        host: result.host,
        snapshot: store.getSnapshot(),
      });
    } catch (err) {
      res.status(401).json({ error: (err as Error).message });
    }
  });

  // Account registrations (EV Vehicle Owner & Charging Host)
  app.post('/api/v1/drivers/register', (req, res) => {
    try {
      const driver = store.registerDriver(req.body || {});
      broadcastSnapshot();
      res.status(201).json({ driver, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/v1/hosts/register', (req, res) => {
    try {
      const host = store.registerHost(req.body || {});
      broadcastSnapshot();
      res.status(201).json({ host, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Driver vehicles
  app.post('/api/v1/drivers/:driverId/vehicles', (req, res) => {
    try {
      const { make, model, year, licensePlate, batteryCapacity, connectorType } =
        req.body || {};
      if (!make || !model || !licensePlate || !Array.isArray(connectorType) || connectorType.length === 0) {
        res.status(400).json({ error: 'Vehicle make, model, licensePlate, and connectorType are required.' });
        return;
      }
      const vehicle = store.addVehicle(req.params.driverId, {
        make: String(make),
        model: String(model),
        year: Number(year) || 2024,
        licensePlate: String(licensePlate),
        batteryCapacity: Number(batteryCapacity) || 75,
        connectorType,
      });
      broadcastSnapshot();
      res.status(201).json({ vehicle, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Update live driver GPS location & enforce 10 km booking geofence
  app.post('/api/v1/drivers/:driverId/location', (req, res) => {
    try {
      const { lat, lon } = req.body || {};
      if (lat === undefined || lon === undefined) {
        res.status(400).json({ error: 'lat and lon are required.' });
        return;
      }
      const result = store.updateDriverLocation(req.params.driverId, {
        lat: Number(lat),
        lon: Number(lon),
      });
      broadcastSnapshot();
      res.json({
        driver: result.driver,
        autoReleasedReservations: result.autoReleasedReservations,
        snapshot: store.getSnapshot(),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Charging points
  app.get('/api/v1/charging-points', (_req, res) => {
    res.json({ chargingPoints: store.getSnapshot().chargingPoints });
  });

  app.post('/api/v1/charging-points', (req, res) => {
    try {
      const body = req.body || {};
      if (!body.name || !body.address || !body.hostName || !body.connectorType) {
        res.status(400).json({
          error: 'Name, address, host name, and connector type are required.',
        });
        return;
      }
      const cp = store.createChargingPoint({
        hostUid: body.hostUid,
        hostName: String(body.hostName),
        type: body.type === 'existing_station' ? 'existing_station' : 'private_host',
        partnerName: body.partnerName,
        partnerStationId: body.partnerStationId,
        name: String(body.name),
        address: String(body.address),
        description: String(body.description || 'Verified ImCharge charging bay.'),
        lat: Number(body.lat) || 48.1415,
        lon: Number(body.lon) || 11.5712,
        pricePerKwh: Number(body.pricePerKwh) || 18,
        connectorType: body.connectorType,
        powerKw: Number(body.powerKw) || 22,
        meterSerialNumber: body.meterSerialNumber,
        availabilityHours: String(body.availabilityHours || '07:00 – 22:00 daily'),
      });
      broadcastSnapshot();
      res.status(201).json({ chargingPoint: cp, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Reservations
  app.post('/api/v1/reservations', (req, res) => {
    try {
      const { driverId, chargingPointId, connectorId, driverLocation, enforceProximity, notes } =
        req.body || {};
      if (!driverId || !chargingPointId || !connectorId) {
        res.status(400).json({
          error: 'driverId, chargingPointId, and connectorId are required.',
        });
        return;
      }
      const reservation = store.createReservation({
        driverId,
        chargingPointId,
        connectorId,
        driverLocation,
        enforceProximity,
        notes,
      });
      broadcastSnapshot();
      res.status(201).json({ reservation, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/v1/reservations/:resId/confirm', (req, res) => {
    try {
      const { qrToken } = req.body || {};
      if (!qrToken) {
        res.status(400).json({ error: 'QR token or connector ID is required.' });
        return;
      }
      const reservation = store.confirmReservation(req.params.resId, String(qrToken));
      broadcastSnapshot();
      res.json({ reservation, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/v1/reservations/:resId/cancel', (req, res) => {
    try {
      const reservation = store.cancelReservation(req.params.resId);
      broadcastSnapshot();
      res.json({ reservation, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Charging sessions
  app.post('/api/v1/charging-sessions', (req, res) => {
    try {
      const { reservationId, meterReadingStartWh } = req.body || {};
      if (!reservationId) {
        res.status(400).json({ error: 'reservationId is required.' });
        return;
      }
      const session = store.startChargingSession({
        reservationId,
        meterReadingStartWh:
          meterReadingStartWh !== undefined ? Number(meterReadingStartWh) : undefined,
      });
      broadcastSnapshot();
      res.status(201).json({ session, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/v1/charging-sessions/:sessionId/end', (req, res) => {
    try {
      const { meterReadingEndWh, partnerEnergyKwh, flagDispute, disputeReason } =
        req.body || {};
      const session = store.endChargingSession(req.params.sessionId, {
        meterReadingEndWh:
          meterReadingEndWh !== undefined ? Number(meterReadingEndWh) : undefined,
        partnerEnergyKwh:
          partnerEnergyKwh !== undefined ? Number(partnerEnergyKwh) : undefined,
        flagDispute: Boolean(flagDispute),
        disputeReason,
      });
      broadcastSnapshot();
      res.json({ session, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post(
    '/api/v1/charging-points/:pointId/connectors/:connectorId/status',
    (req, res) => {
      try {
        const { status, reason } = req.body || {};
        if (
          status !== 'available' &&
          status !== 'occupied' &&
          status !== 'maintenance'
        ) {
          res.status(400).json({
            error: 'status must be "available", "occupied", or "maintenance".',
          });
          return;
        }
        const result = store.updateConnectorStatus(
          req.params.pointId,
          req.params.connectorId,
          status,
          reason
        );
        broadcastSnapshot();
        res.json({
          point: result.point,
          cancelledReservationIds: result.cancelledReservationIds,
          snapshot: store.getSnapshot(),
        });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  );

  app.post('/api/v1/reservations/:resId/report-blocked', (req, res) => {
    try {
      const result = store.reportBlockedBay(req.params.resId);
      broadcastSnapshot();
      res.json({
        reservation: result.reservation,
        backupSuggestion: result.backupSuggestion,
        snapshot: store.getSnapshot(),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Reviews
  app.post('/api/v1/reviews', (req, res) => {
    try {
      const { chargingPointId, driverId, rating, comment } = req.body || {};
      if (!chargingPointId || !driverId || !rating || !comment) {
        res.status(400).json({
          error: 'chargingPointId, driverId, rating, and comment are required.',
        });
        return;
      }
      const review = store.addReview({
        chargingPointId,
        driverId,
        rating: Number(rating),
        comment: String(comment),
      });
      broadcastSnapshot();
      res.status(201).json({ review, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Admin disputes & partner sync & payouts
  app.post('/api/v1/admin/disputes/:sessionId/resolve', (req, res) => {
    try {
      const { action, adjustedMeterEndWh } = req.body || {};
      if (action !== 'approve_adjusted' && action !== 'refund') {
        res.status(400).json({ error: 'Invalid resolution action.' });
        return;
      }
      const session = store.resolveDispute(req.params.sessionId, {
        action,
        adjustedMeterEndWh:
          adjustedMeterEndWh !== undefined ? Number(adjustedMeterEndWh) : undefined,
      });
      broadcastSnapshot();
      res.json({ session, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/v1/admin/partners/:partnerId/sync', (req, res) => {
    try {
      const partner = store.syncPartner(req.params.partnerId);
      broadcastSnapshot();
      res.json({ partner, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/api/v1/hosts/:hostId/payouts/process', (req, res) => {
    try {
      const processedCount = store.processHostPayouts(req.params.hostId);
      broadcastSnapshot();
      res.json({ processedCount, snapshot: store.getSnapshot() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return { app, broadcastSnapshot };
}
