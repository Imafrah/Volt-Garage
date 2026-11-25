/**
 * Skeleton loading placeholders for Host Console tabs.
 * Shown while async data settles to give perceived performance.
 */

function Bone({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-zinc-200/70 ${className}`}
      aria-hidden="true"
    />
  );
}

export function QueueSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Bone className="h-3 w-28" />
              <Bone className="h-4 w-48" />
            </div>
            <Bone className="h-5 w-20 rounded-full" />
          </div>
          <Bone className="h-px w-full" />
          <div className="flex items-center gap-3">
            <Bone className="h-8 w-32 rounded-lg" />
            <Bone className="h-8 w-24 rounded-lg" />
            <Bone className="h-8 w-28 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PayoutsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-2">
              <Bone className="h-4 w-40" />
              <Bone className="h-3 w-56" />
            </div>
            <div className="flex items-center gap-6">
              <div className="space-y-1.5">
                <Bone className="h-3 w-20" />
                <Bone className="h-5 w-24" />
              </div>
              <div className="space-y-1.5">
                <Bone className="h-3 w-20" />
                <Bone className="h-5 w-24" />
              </div>
              <Bone className="h-9 w-28 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
      {/* Smart Meter 3D placeholder */}
      <Bone className="h-72 w-full rounded-xl" />
    </div>
  );
}

export function OnboardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-5">
      <div className="space-y-2 pb-4 border-b border-zinc-200">
        <Bone className="h-5 w-64" />
        <Bone className="h-3 w-96" />
      </div>
      <Bone className="h-10 w-full max-w-md rounded-lg" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mt-4">
        <Bone className="h-20 rounded-xl" />
        <Bone className="h-20 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-2">
            <Bone className="h-3 w-24" />
            <Bone className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
