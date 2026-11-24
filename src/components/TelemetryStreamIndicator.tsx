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
      aria-label={`Telemetry stream status: ${isLive ? 'Live' : 'Reconnecting'}`}
      className={`fixed bottom-16 right-3 sm:bottom-4 sm:right-4 z-30 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs shadow-sm backdrop-blur-sm transition-colors ${
        isLive
          ? 'border-emerald-200 bg-white/95 text-slate-900'
          : 'border-amber-300 bg-amber-50/95 text-amber-950'
      }`}
    >
      {isLive ? (
        <Radio className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-700" />
      )}
      <span className="text-slate-500">Telemetry</span>
      <span aria-hidden="true" className="text-slate-300">
        ·
      </span>
      <span
        className={`font-semibold ${
          isLive ? 'text-emerald-700' : 'text-amber-800'
        }`}
      >
        {isLive ? 'Live' : 'Reconnecting'}
      </span>
    </div>
  );
}
