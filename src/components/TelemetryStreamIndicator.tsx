import { Radio, RefreshCw } from 'lucide-react';

export type SseConnectionStatus = 'live' | 'reconnecting';

interface TelemetryStreamIndicatorProps {
  status: SseConnectionStatus;
}

export function TelemetryStreamIndicator({
  status,
}: TelemetryStreamIndicatorProps) {
  const isLive = status === 'live';

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="sse-status-indicator"
      data-status={status}
      aria-label={`OCPP Telemetry stream: ${isLive ? 'Online' : 'Reconnecting'}`}
      className={`fixed bottom-16 right-3 sm:bottom-5 sm:right-5 z-30 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-mono tabular-nums shadow-sm backdrop-blur-md transition-colors ${
        isLive
          ? 'border-zinc-200 bg-white/95 text-zinc-800'
          : 'border-amber-200 bg-amber-50/95 text-amber-900'
      }`}
    >
      <span className="relative flex h-2 w-2">
        {isLive ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
          </>
        ) : (
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        )}
      </span>
      <span className="font-semibold text-zinc-900 tracking-tight">OCPP 2.0.1</span>
      <span aria-hidden="true" className="text-zinc-300">
        /
      </span>
      <span
        className={`font-medium ${
          isLive ? 'text-emerald-700' : 'text-amber-700'
        }`}
      >
        {isLive ? '230V · 32A · LIVE' : 'RECONNECTING'}
      </span>
    </div>
  );
}
