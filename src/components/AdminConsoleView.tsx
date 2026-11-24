import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import type {
  AdminAnalytics,
  ChargingPoint,
  ChargingSession,
  OcppTelemetryPayload,
  PartnerIntegration,
  PaymentRecord,
  Reservation,
  TelemetryEventRecord,
} from '../domain/types';

interface AdminConsoleViewProps {
  analytics: AdminAnalytics;
  chargingPoints: ChargingPoint[];
  reservations: Reservation[];
  sessions: ChargingSession[];
  partners: PartnerIntegration[];
  payments: PaymentRecord[];
  telemetryEvents: TelemetryEventRecord[];
  telemetryHeartbeatEnabled: boolean;
  onResolveDispute: (
    sessionId: string,
    payload: { action: 'approve_adjusted' | 'refund'; adjustedMeterEndWh?: number }
  ) => Promise<void>;
  onSyncPartner: (partnerId: string) => Promise<void>;
  onSendOcppTelemetry: (payload: OcppTelemetryPayload) => Promise<{
    event: TelemetryEventRecord;
    cancelledReservationIds: string[];
  }>;
  onToggleHeartbeat: (enabled: boolean) => Promise<void>;
  onResetDemo: () => Promise<void>;
}

type AdminSubTab = 'disputes' | 'reservations' | 'partners' | 'payments';

export function AdminConsoleView({
  analytics,
  chargingPoints,
  reservations,
  sessions,
  partners,
  payments,
  telemetryEvents,
  telemetryHeartbeatEnabled,
  onResolveDispute,
  onSyncPartner,
  onSendOcppTelemetry,
  onToggleHeartbeat,
  onResetDemo,
}: AdminConsoleViewProps) {
  const [subTab, setSubTab] = useState<AdminSubTab>('disputes');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [adjustedEndWh, setAdjustedEndWh] = useState<Record<string, string>>(
    {}
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);

  const disputedSessions = sessions.filter((s) => s.status === 'disputed');
  const filteredReservations =
    statusFilter === 'all'
      ? reservations
      : reservations.filter((r) => r.status === statusFilter);

  async function handleResolve(
    sessionId: string,
    action: 'approve_adjusted' | 'refund',
    fallbackEndWh: number
  ) {
    setBusyId(sessionId);
    setAdminMessage(null);
    try {
      const endWh = Number(adjustedEndWh[sessionId] ?? fallbackEndWh);
      await onResolveDispute(sessionId, {
        action,
        adjustedMeterEndWh: action === 'approve_adjusted' ? endWh : undefined,
      });
      setAdminMessage(
        action === 'refund'
          ? 'Issued Stripe refund and closed dispute.'
          : 'Adjusted meter reading settled and host payout queued.'
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handlePartnerSync(partnerId: string, name: string) {
    setBusyId(partnerId);
    setAdminMessage(null);
    try {
      await onSyncPartner(partnerId);
      setAdminMessage(`Synced live OCPI station telemetry from ${name}.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* 4-Column Platform KPI Strip */}
      <section
        aria-label="Platform key metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-xs font-medium text-zinc-500">
            Total Bookings
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-zinc-900">
            {analytics.totalBookings}
          </div>
          <div className="mt-1 text-xs text-zinc-500 tabular-nums">
            {analytics.activeSessions} active charging ·{' '}
            {analytics.completedSessions} settled
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-xs font-medium text-zinc-500">
            Gross Charging Volume
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-zinc-900">
            ₹{analytics.grossVolumeInr.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-zinc-500 tabular-nums">
            Host payouts: ₹{analytics.hostPayoutsInr.toFixed(2)}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-xs font-medium text-zinc-500">
            Net Platform Commission
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-700">
            ₹{analytics.netCommissionInr.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            20% Private Host · 15% Partner
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-xs font-medium text-zinc-500">
            Session Completion Rate
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-zinc-900">
            {analytics.completionRatePct.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-zinc-500 tabular-nums">
            {analytics.disputedSessions} open dispute(s)
          </div>
        </div>
      </section>

      {/* Admin Sub-Navigation & Demo Reset */}
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center">
        <div
          role="tablist"
          aria-label="Admin sections"
          className="flex flex-wrap items-center gap-1 rounded-lg bg-zinc-100 p-1"
        >
          {(
            [
              {
                id: 'disputes',
                label: `Disputes (${disputedSessions.length})`,
              },
              {
                id: 'reservations',
                label: `Reservations (${reservations.length})`,
              },
              { id: 'partners', label: 'Partner APIs' },
              { id: 'payments', label: 'Payments Ledger' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={subTab === tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                subTab === tab.id
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onResetDemo}
          className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Seed Data
        </button>
      </div>

      {adminMessage && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {adminMessage}
        </div>
      )}

      {/* TAB 1: Disputes & Escalations */}
      {subTab === 'disputes' && (
        <div className="space-y-4">
          {disputedSessions.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
              <p className="text-sm font-medium text-zinc-900">
                All meter verification disputes are resolved
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Any session flagged for hardware power-ceiling anomalies or driver mismatch will appear here.
              </p>
            </div>
          ) : (
            disputedSessions.map((session) => {
              const suggestedValidEnd =
                (session.meterReadingStartWh ?? 71680) + 9800;
              const currentAdjusted =
                adjustedEndWh[session.id] ?? String(suggestedValidEnd);

              return (
                <article
                  key={session.id}
                  className="rounded-xl border border-red-200 bg-white p-6"
                >
                  <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-4 md:flex-row md:items-center">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-red-700">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="font-semibold">
                          Meter Verification Dispute
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{session.id}</span>
                      </div>
                      <h3 className="mt-1 text-base font-bold text-zinc-900">
                        {session.chargingPointName} · Driver:{' '}
                        {session.driverName}
                      </h3>
                    </div>

                    <div className="font-mono text-xs tabular-nums text-zinc-700">
                      Reported: {session.energyDeliveredKwh.toFixed(2)} kWh (₹
                      {session.amount.toFixed(2)})
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-zinc-700">
                    {session.disputeReason}
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs sm:grid-cols-3">
                    <div>
                      <span className="text-zinc-500">Start Reading</span>
                      <div className="mt-0.5 font-mono font-semibold tabular-nums text-zinc-900">
                        {session.meterReadingStartWh?.toLocaleString()} Wh
                      </div>
                    </div>
                    <div>
                      <span className="text-zinc-500">Reported End</span>
                      <div className="mt-0.5 font-mono font-semibold tabular-nums text-red-700">
                        {session.meterReadingEndWh?.toLocaleString()} Wh
                      </div>
                    </div>
                    <div>
                      <span className="text-zinc-500">Tariff Rate</span>
                      <div className="mt-0.5 font-mono font-semibold tabular-nums text-zinc-900">
                        ₹{session.pricePerKwh.toFixed(2)} / kWh
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                    <div className="flex items-end gap-2">
                      <div>
                        <label
                          htmlFor={`adj-wh-${session.id}`}
                          className="block text-xs font-medium text-zinc-700"
                        >
                          Verified End Reading (Wh)
                        </label>
                        <input
                          id={`adj-wh-${session.id}`}
                          type="number"
                          value={currentAdjusted}
                          onChange={(e) =>
                            setAdjustedEndWh((p) => ({
                              ...p,
                              [session.id]: e.target.value,
                            }))
                          }
                          className="mt-1 w-40 rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs tabular-nums text-zinc-900"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={busyId === session.id}
                        onClick={() =>
                          handleResolve(
                            session.id,
                            'approve_adjusted',
                            suggestedValidEnd
                          )
                        }
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        Approve Adjusted Settlement
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={busyId === session.id}
                      onClick={() =>
                        handleResolve(session.id, 'refund', suggestedValidEnd)
                      }
                      className="rounded-lg border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      Issue Full Stripe Refund
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: All Reservations */}
      {subTab === 'reservations' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              Platform Reservations State Ledger
            </h2>
            <select
              aria-label="Filter reservations by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700"
            >
              <option value="all">All Statuses</option>
              <option value="reserved">Reserved</option>
              <option value="confirmed">Confirmed</option>
              <option value="charging">Charging</option>
              <option value="completed">Completed</option>
              <option value="disputed">Disputed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Reservation</th>
                  <th className="px-4 py-3 font-semibold">Driver</th>
                  <th className="px-4 py-3 font-semibold">Charging Point</th>
                  <th className="px-4 py-3 font-semibold">Connector</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Tariff
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filteredReservations.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2.5 font-mono text-zinc-900">
                      {r.id}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-700">
                      {r.driverName}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-zinc-900">
                      {r.chargingPointName}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-zinc-600 tabular-nums">
                      {r.connectorType} · {r.powerKw} kW
                    </td>
                    <td className="px-4 py-2.5 font-medium text-zinc-800">
                      {r.status}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-zinc-900">
                      ₹{r.pricePerKwh.toFixed(2)}/kWh
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Partner Integrations & Live Telemetry Feed */}
      {subTab === 'partners' && (
        <div className="space-y-6">
          <div className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {partners.map((partner) => (
              <div
                key={partner.id}
                className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-zinc-900">
                      {partner.partnerName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`text-xs font-semibold ${
                        partner.status === 'active'
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      }`}
                    >
                      {partner.status === 'active'
                        ? 'Active OCPI Sync'
                        : 'Sync Error (Retry Needed)'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-xs tabular-nums text-zinc-600">
                      {(partner.commissionRate * 100).toFixed(0)}% commission
                    </span>
                  </div>
                  <div className="font-mono text-xs text-zinc-500">
                    {partner.apiEndpoint} · Every {partner.syncIntervalMinutes}m ·
                    Last sync:{' '}
                    {new Date(partner.lastSyncTime).toLocaleTimeString()}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs tabular-nums text-zinc-700">
                    {partner.syncedStationsCount} station(s)
                  </span>
                  <button
                    type="button"
                    disabled={busyId === partner.id}
                    onClick={() =>
                      handlePartnerSync(partner.id, partner.partnerName)
                    }
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sync Now
                  </button>
                </div>
              </div>
            ))}
          </div>

          <section
            aria-label="Live OCPP and Smart Meter Telemetry Feed"
            className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
          >
            <div className="flex flex-col justify-between gap-3 border-b border-zinc-200 p-5 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <Radio className="h-3.5 w-3.5" />
                  <span>
                    SSE Stream{' '}
                    {telemetryHeartbeatEnabled ? 'Active (2s Heartbeat)' : 'Paused'}
                  </span>
                </div>
                <h3 className="mt-0.5 text-base font-bold text-zinc-900">
                  Live OCPP / Smart Meter Telemetry Feed
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyId === 'telemetry-hb'}
                  onClick={async () => {
                    setBusyId('telemetry-hb');
                    setAdminMessage(null);
                    try {
                      await onToggleHeartbeat(!telemetryHeartbeatEnabled);
                      setAdminMessage(
                        telemetryHeartbeatEnabled
                          ? 'Paused server telemetry heartbeat.'
                          : 'Resumed server telemetry heartbeat.'
                      );
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                >
                  {telemetryHeartbeatEnabled ? (
                    <>
                      <Pause className="h-3.5 w-3.5 text-amber-600" />
                      Pause Heartbeat
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 text-emerald-600" />
                      Resume Heartbeat
                    </>
                  )}
                </button>

                {chargingPoints[0]?.connectors[0] && (
                  <button
                    type="button"
                    disabled={busyId === 'telemetry-pulse'}
                    onClick={async () => {
                      const cp = chargingPoints[0];
                      const conn = cp.connectors[0];
                      if (!cp || !conn) return;
                      setBusyId('telemetry-pulse');
                      setAdminMessage(null);
                      try {
                        const res = await onSendOcppTelemetry({
                          chargingPointId: cp.id,
                          connectorId: conn.id,
                          eventType: 'MeterValues',
                          powerKw: 0,
                        });
                        setAdminMessage(res.event.summary);
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                  >
                    <Activity className="h-3.5 w-3.5 text-emerald-600" />
                    Send Test Pulse
                  </button>
                )}
              </div>
            </div>

            {telemetryEvents.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500">
                No telemetry events logged yet. Start a charging session or trigger an OCPP meter pulse.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Time</th>
                      <th className="px-4 py-3 font-semibold">Protocol · Event</th>
                      <th className="px-4 py-3 font-semibold">Charger · Bay</th>
                      <th className="px-4 py-3 font-semibold">Load</th>
                      <th className="px-4 py-3 font-semibold">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {telemetryEvents.map((ev) => (
                      <tr key={ev.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-2.5 font-mono text-zinc-500 tabular-nums whitespace-nowrap">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="font-mono text-zinc-600">
                            {ev.protocol}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span
                            className={`font-semibold ${
                              ev.eventType === 'WalkInLoadDetected'
                                ? 'text-amber-700'
                                : 'text-zinc-900'
                            }`}
                          >
                            {ev.eventType}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-zinc-900">
                          {ev.chargingPointName}{' '}
                          <span className="font-mono text-zinc-500">
                            ({ev.connectorId})
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-zinc-800 whitespace-nowrap">
                          {ev.powerKw.toFixed(1)} kW
                          {ev.meterWh !== undefined
                            ? ` · ${ev.meterWh.toLocaleString()} Wh`
                            : ''}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-600">
                          {ev.summary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: Payments Ledger */}
      {subTab === 'payments' && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Transaction ID</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Description</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {payments.map((pay) => (
                <tr key={pay.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2.5 font-mono text-zinc-900">
                    {pay.stripeTransactionId}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-zinc-700">
                    {pay.type}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">
                    {pay.description}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-zinc-800">
                    {pay.status}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-zinc-900">
                    ₹{pay.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
