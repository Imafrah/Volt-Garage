import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { FallbackProps } from 'react-error-boundary';

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'An unexpected runtime error occurred in this module.';
}

/**
 * Full-page fallback rendered when an uncaught exception reaches the root ErrorBoundary.
 */
export function AppErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div
      role="alert"
      className="flex min-h-screen items-center justify-center bg-zinc-50 px-4"
    >
      <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 className="text-base font-semibold text-zinc-900">
          Something went wrong
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          {formatErrorMessage(error)}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={resetErrorBoundary}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try Again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Reload App
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline fallback isolating a failing panel or 3D canvas without taking down the workspace.
 */
export function SectionErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center"
    >
      <div className="mx-auto mb-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-700">
        <AlertTriangle className="h-4 w-4" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-900">
        Panel failed to render
      </h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-zinc-600">
        {formatErrorMessage(error)}
      </p>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Retry Panel
      </button>
    </div>
  );
}
