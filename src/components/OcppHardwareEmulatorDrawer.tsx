import { useState } from 'react';
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Play,
  Power,
  Radio,
  Terminal,
  Zap,
} from 'lucide-react';
import type {
  ChargingPoint,
  ConnectorStatus,
  OcppTelemetryPayload,
  TelemetryEventRecord,
} from '../domain/types';

interface OcppHardwareEmulatorDrawerProps {
  chargingPoints: ChargingPoint[];
  isOpen: boolean;
  onToggle: () => void;
  onSendTelemetry: (payload: OcppTelemetryPayload) => Promise<{
    event: TelemetryEventRecord;
    cancelledReservationIds: string[];
  }>;
}

interface LogMessage {
  id: string;
  timestamp: string;
  direction: 'tx' | 'rx';
  action: string;
  raw: string;
}

export function OcppHardwareEmulatorDrawer({
  chargingPoints,
  isOpen,
  onToggle,
  onSendTelemetry,
}: OcppHardwareEmulatorDrawerProps) {
  const [selectedPointId, setSelectedPointId] = useState<string>(
    () => chargingPoints[0]?.id ?? ''
  );
  const [simPowerKw, setSimPowerKw] = useState<number>(7.4);
  const [simMeterWh, setSimMeterWh] = useState<number>(14250);
  const [simVoltage, setSimVoltage] = useState<number>(230);
  const [simCurrentAmps, setSimCurrentAmps] = useState<number>(32);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const [logs, setLogs] = useState<LogMessage[]>([
    {
      id: 'boot-1',
      timestamp: new Date().toLocaleTimeString(),
      direction: 'tx',
      action: 'BootNotification.req',
      raw: JSON.stringify(
        [
          2,
          'msg-001',
          'BootNotification',
          {
            chargingStation: { model: 'Alfen Eve Single Pro', vendorName: 'Alfen' },
            reason: 'PowerUp',
          },
        ],
        null,
        2
      ),
    },
    {
      id: 'boot-2',
      timestamp: new Date().toLocaleTimeString(),
      direction: 'rx',
      action: 'BootNotification.conf',
      raw: JSON.stringify([3, 'msg-001', { status: 'Accepted', interval: 60 }], null, 2),
    },
  ]);

  const currentPoint =
    chargingPoints.find((p) => p.id === selectedPointId) ?? chargingPoints[0];
  const currentConnector = currentPoint?.connectors[0];

  function addLog(direction: 'tx' | 'rx', action: string, payload: unknown) {
    const msg: LogMessage = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      direction,
      action,
      raw: JSON.stringify(payload, null, 2),
    };
    setLogs((prev) => [msg, ...prev.slice(0, 19)]);
  }

  async function handleSend(
    eventType: 'MeterValues' | 'StatusNotification' | 'WalkInLoadDetected',
    customStatus?: ConnectorStatus,
    overridePower?: number
  ) {
    if (!currentPoint || !currentConnector) return;
    setIsSubmitting(true);
    setStatusFeedback(null);

    const power = overridePower ?? simPowerKw;
    const meter = simMeterWh;

    const ocppFrame = [
      2,
      `req-${Date.now().toString(36)}`,
      eventType,
      {
        chargingPointId: currentPoint.id,
        connectorId: currentConnector.id,
        status: customStatus,
        powerKw: power,
        meterWh: meter,
        voltage: simVoltage,
        currentA: simCurrentAmps,
        timestamp: new Date().toISOString(),
      },
    ];

    addLog('tx', `${eventType}.req`, ocppFrame);

    try {
      const res = await onSendTelemetry({
        chargingPointId: currentPoint.id,
        connectorId: currentConnector.id,
        eventType,
        powerKw: power,
        meterWh: meter,
        status: customStatus,
      });

      addLog('rx', `${eventType}.conf`, [
        3,
        `req-${Date.now().toString(36)}`,
        { status: 'Accepted', eventId: res.event.id },
      ]);

      if (res.cancelledReservationIds.length > 0) {
        setStatusFeedback(
          `⚠️ Reconciled: ${res.cancelledReservationIds.length} reservation(s) auto-released due to conflict!`
        );
      } else {
        setStatusFeedback(`✓ Frame delivered & ingested by central system.`);
      }
    } catch (err) {
      addLog('rx', 'CallError', [
        4,
        `req-${Date.now().toString(36)}`,
        'InternalError',
        (err as Error).message,
      ]);
      setStatusFeedback(`❌ Error: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed bottom-0 right-0 left-0 z-40 transition-transform duration-300">
      {/* Floating Toggle Bar */}
      <div className="mx-auto flex max-w-7xl justify-end px-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 rounded-t-xl border border-b-0 border-zinc-700 bg-zinc-950 px-4 py-2 text-xs font-mono font-medium text-emerald-400 shadow-xl transition-colors hover:bg-zinc-900"
        >
          <Cpu className="h-4 w-4 animate-pulse text-emerald-400" />
          <span>OCPP 2.0.1 Hardware Test Bench</span>
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300 font-sans">
            Virtual Wallbox
          </span>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-zinc-400" />
          ) : (
            <ChevronUp className="h-4 w-4 text-zinc-400" />
          )}
        </button>
      </div>

      {/* Expanded Bench Drawer */}
      {isOpen && (
        <div className="border-t border-zinc-800 bg-[#0c0d12] text-zinc-200 shadow-2xl backdrop-blur-xl">
          <div className="mx-auto max-w-7xl p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-sm">
                  ⚡
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-white tracking-wide">
                    Virtual Charger Hardware Emulator
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono">
                    Simulate real-time EVSE signals, cable locks, meter telemetry & walk-in loads
                  </p>
                </div>
              </div>

              {/* Station Picker */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 font-mono">Target EVSE:</span>
                <select
                  value={selectedPointId}
                  onChange={(e) => setSelectedPointId(e.target.value)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
                >
                  {chargingPoints.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name} ({cp.type === 'private_host' ? 'Private Wallbox' : 'DC Fast Hub'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Grid: Controls & JSON-RPC Telemetry Monitor */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left Column: Quick Injections (5 cols) */}
              <div className="space-y-4 lg:col-span-5">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold uppercase tracking-wider text-emerald-400">
                      1. Status Notifications
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      EVSE:{' '}
                      <span className="text-white font-bold">
                        {currentConnector?.status ?? 'available'}
                      </span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSend('StatusNotification', 'available', 0)}
                      className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-mono text-zinc-300 transition-colors hover:border-emerald-500/50 hover:bg-zinc-800 hover:text-emerald-300"
                    >
                      Available
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSend('StatusNotification', 'occupied', simPowerKw)}
                      className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-mono text-zinc-300 transition-colors hover:border-emerald-500/50 hover:bg-zinc-800 hover:text-emerald-300"
                    >
                      Plugged In
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSend('StatusNotification', 'maintenance', 0)}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-mono text-amber-300 transition-colors hover:bg-amber-500/20"
                    >
                      Fault / Maint
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSend('WalkInLoadDetected', 'occupied', 11.0)}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-mono text-rose-300 transition-colors hover:bg-rose-500/20"
                    >
                      Walk-in Load
                    </button>
                  </div>
                </div>

                {/* Meter Values Synthesizer */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold uppercase tracking-wider text-emerald-400">
                      2. MeterValues Telemetry Injector
                    </span>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setSimMeterWh((m) => m + Math.round(simPowerKw * 250));
                        handleSend('MeterValues');
                      }}
                      className="flex items-center gap-1 rounded bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
                    >
                      <Zap className="h-3 w-3" />
                      Push Meter
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-[11px] font-mono text-zinc-400">
                        Power Output (kW)
                      </label>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="range"
                          min="1.4"
                          max="22"
                          step="0.2"
                          value={simPowerKw}
                          onChange={(e) => setSimPowerKw(Number(e.target.value))}
                          className="h-1.5 w-full accent-emerald-500"
                        />
                        <span className="w-12 text-right font-mono font-bold text-white">
                          {simPowerKw} kW
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-mono text-zinc-400">
                        Cumulative Meter (Wh)
                      </label>
                      <input
                        type="number"
                        value={simMeterWh}
                        onChange={(e) => setSimMeterWh(Number(e.target.value))}
                        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-white"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-2 text-[11px] font-mono text-zinc-400">
                    <span>Grid: 230V · 32A · 50Hz</span>
                    <span>Board Temp: 38.4°C</span>
                    <span>Signal: -64 dBm</span>
                  </div>
                </div>

                {statusFeedback && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-mono text-emerald-300">
                    {statusFeedback}
                  </div>
                )}
              </div>

              {/* Right Column: Live OCPP JSON-RPC Frame Terminal (7 cols) */}
              <div className="flex flex-col rounded-xl border border-zinc-800 bg-[#07080b] p-3 font-mono lg:col-span-7">
                <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-2">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="font-semibold text-zinc-200">
                      OCPP 2.0.1 JSON-RPC 2.0 Log Stream
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLogs([])}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300"
                  >
                    Clear Logs
                  </button>
                </div>

                <div className="h-48 overflow-y-auto space-y-2 pr-1 text-[11px] scrollbar-thin">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded border border-zinc-800/80 bg-zinc-950/80 p-2 font-mono"
                    >
                      <div className="flex items-center justify-between text-[10px] text-zinc-500">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={
                              log.direction === 'tx'
                                ? 'text-amber-400 font-bold'
                                : 'text-emerald-400 font-bold'
                            }
                          >
                            {log.direction === 'tx' ? '▶ CALL (Client)' : '◀ CONF (Backend)'}
                          </span>
                          <span className="text-zinc-300 font-semibold">{log.action}</span>
                        </span>
                        <span>{log.timestamp}</span>
                      </div>
                      <pre className="mt-1 overflow-x-auto text-[10px] text-zinc-300 leading-tight">
                        {log.raw}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
