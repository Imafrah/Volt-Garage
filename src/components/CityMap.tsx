import { useState } from 'react';
import { Box, Map as MapIcon, Minus, Navigation, Plus, RotateCcw } from 'lucide-react';
import { calculateDistanceKm, estimateEtaMinutes } from '../domain/imchargeEngine';
import type { ChargingPoint, GeoPoint } from '../domain/types';
import { CityMap3D } from './CityMap3D';

interface CityMapProps {
  points: ChargingPoint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  driverLocation: GeoPoint;
  radiusKm: number;
  onMoveDriverLocation?: (
    location: GeoPoint,
    sourceLabel?: string
  ) => Promise<void> | void;
}

const VIEW_W = 720;
const VIEW_H = 420;

// Munich bounding projection centered around downtown Munich
const CENTER_LAT = 48.149;
const CENTER_LON = 11.578;

function projectPoint(geo: GeoPoint, zoom: number): { x: number; y: number } {
  const latScale = 2750 * zoom;
  const lonScale = 1900 * zoom;
  const x = VIEW_W / 2 + (geo.lon - CENTER_LON) * lonScale;
  const y = VIEW_H / 2 - (geo.lat - CENTER_LAT) * latScale;
  return { x, y };
}

export function CityMap({
  points,
  selectedId,
  onSelect,
  driverLocation,
  radiusKm,
  onMoveDriverLocation,
}: CityMapProps) {
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [zoom, setZoom] = useState(1);

  const driverPos = projectPoint(driverLocation, zoom);
  const selectedPoint = points.find((p) => p.id === selectedId) || null;
  const selectedPos = selectedPoint ? projectPoint(selectedPoint.location, zoom) : null;

  // Approximate pixels per km at Munich latitude (~48.15N)
  const pxPerKm = (2750 * zoom) / 111.32;
  const radiusPx = Math.max(24, radiusKm * pxPerKm);

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-xs text-zinc-600">
          <span className="truncate font-medium text-zinc-900">
            Munich Metro Grid
          </span>
          <span aria-hidden="true" className="hidden sm:inline">
            ·
          </span>
          <span className="hidden whitespace-nowrap tabular-nums sm:inline">
            {points.length} chargers in view
          </span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap tabular-nums">
            {radiusKm} km radius
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Map projection mode"
            className="flex items-center gap-1 rounded-lg bg-zinc-100 p-0.5"
          >
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              aria-pressed={viewMode === '3d'}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === '3d'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Box className="h-3 w-3 text-emerald-600" />
              3D View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('2d')}
              aria-pressed={viewMode === '2d'}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === '2d'
                  ? 'bg-white text-zinc-900 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <MapIcon className="h-3 w-3" />
              2D Grid
            </button>
          </div>

          {viewMode === '2d' && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.min(2.2, +(z + 0.25).toFixed(2)))
                }
                aria-label="Zoom in map"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.max(0.65, +(z - 0.25).toFixed(2)))
                }
                aria-label="Zoom out map"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                aria-label="Reset map zoom"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {viewMode === '3d' ? (
        <CityMap3D
          points={points}
          selectedId={selectedId}
          onSelect={onSelect}
          driverLocation={driverLocation}
          radiusKm={radiusKm}
          onMoveDriverLocation={onMoveDriverLocation}
        />
      ) : (
      <div className="relative h-[300px] w-full select-none bg-[#eef2f6]">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-full w-full"
          role="img"
          aria-label="Interactive Munich EV charging station map"
        >
          {/* Subtle district grid */}
          <defs>
            <pattern
              id="cityGrid"
              width="48"
              height="48"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 48 0 L 0 0 0 48"
                fill="none"
                stroke="#dde4ee"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width={VIEW_W} height={VIEW_H} fill="url(#cityGrid)" />

          {/* Green parks */}
          <ellipse
            cx={VIEW_W * 0.56}
            cy={VIEW_H * 0.42}
            rx={48 * zoom}
            ry={76 * zoom}
            fill="#d9ece3"
            opacity="0.7"
          />
          <ellipse
            cx={VIEW_W * 0.36}
            cy={VIEW_H * 0.32}
            rx={52 * zoom}
            ry={32 * zoom}
            fill="#d9ece3"
            opacity="0.65"
          />

          {/* Isar river curve */}
          <path
            d={`M ${VIEW_W * 0.44} ${VIEW_H + 20} C ${VIEW_W * 0.48} ${
              VIEW_H * 0.65
            }, ${VIEW_W * 0.55} ${VIEW_H * 0.45}, ${VIEW_W * 0.66} -20`}
            fill="none"
            stroke="#bdd6ec"
            strokeWidth={14 * zoom}
            strokeLinecap="round"
          />

          {/* Ring road & arterial corridors */}
          <ellipse
            cx={driverPos.x}
            cy={driverPos.y}
            rx={95 * zoom}
            ry={72 * zoom}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="2.5"
          />
          <line
            x1={driverPos.x - 280 * zoom}
            y1={driverPos.y + 10}
            x2={driverPos.x + 280 * zoom}
            y2={driverPos.y - 24}
            stroke="#ffffff"
            strokeWidth="4"
          />
          <line
            x1={driverPos.x - 10}
            y1={driverPos.y - 220 * zoom}
            x2={driverPos.x + 30}
            y2={driverPos.y + 220 * zoom}
            stroke="#ffffff"
            strokeWidth="4"
          />

          {/* District labels */}
          <text
            x={driverPos.x - 24}
            y={driverPos.y + 24}
            fill="#64748b"
            fontSize="10"
            fontWeight="600"
          >
            Altstadt
          </text>
          <text
            x={driverPos.x + 12}
            y={driverPos.y - 68 * zoom}
            fill="#64748b"
            fontSize="10"
            fontWeight="600"
          >
            Schwabing
          </text>
          <text
            x={driverPos.x - 86 * zoom}
            y={driverPos.y - 28 * zoom}
            fill="#64748b"
            fontSize="10"
            fontWeight="600"
          >
            Maxvorstadt
          </text>
          <text
            x={driverPos.x + 68 * zoom}
            y={driverPos.y + 28 * zoom}
            fill="#64748b"
            fontSize="10"
            fontWeight="600"
          >
            Haidhausen
          </text>

          {/* Search radius circle */}
          <circle
            cx={driverPos.x}
            cy={driverPos.y}
            r={radiusPx}
            fill="#059669"
            fillOpacity="0.06"
            stroke="#059669"
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />

          {/* Route line to selected charger */}
          {selectedPos && (
            <line
              x1={driverPos.x}
              y1={driverPos.y}
              x2={selectedPos.x}
              y2={selectedPos.y}
              stroke="#0f172a"
              strokeWidth="2.5"
              strokeDasharray="5 5"
            />
          )}

          {/* Driver location pin */}
          <g transform={`translate(${driverPos.x}, ${driverPos.y})`}>
            <circle r="11" fill="#0f172a" fillOpacity="0.16" />
            <circle r="6" fill="#0f172a" stroke="#ffffff" strokeWidth="2" />
          </g>
        </svg>

        {/* Accessible HTML charger markers overlaid cleanly */}
        {points.map((point) => {
          const pos = projectPoint(point.location, zoom);
          const leftPct = (pos.x / VIEW_W) * 100;
          const topPct = (pos.y / VIEW_H) * 100;
          if (leftPct < 3 || leftPct > 97 || topPct < 6 || topPct > 94) {
            return null;
          }
          const availableCount = point.connectors.filter(
            (c) => c.status === 'available'
          ).length;
          const isSelected = point.id === selectedId;
          const isPrivate = point.type === 'private_host';

          return (
            <button
              key={point.id}
              type="button"
              onClick={() => onSelect(point.id)}
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
              aria-label={`Select ${point.name}, ₹${point.pricePerKwh.toFixed(2)} per kWh, ${availableCount} available`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2 py-1 font-mono text-[11px] font-semibold tabular-nums transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                isSelected
                  ? 'z-20 scale-105 border-zinc-900 bg-zinc-900 text-white shadow-md'
                  : availableCount > 0
                    ? isPrivate
                      ? 'z-10 border-emerald-600 bg-white text-emerald-800 shadow-sm hover:bg-emerald-50'
                      : 'z-10 border-zinc-300 bg-white text-zinc-800 shadow-sm hover:border-zinc-500'
                    : 'z-0 border-zinc-300 bg-zinc-200 text-zinc-500'
              }`}
            >
              ₹{point.pricePerKwh.toFixed(2)}
            </button>
          );
        })}

        {/* Selected route telemetry bar */}
        {selectedPoint && (
          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 text-xs text-zinc-700 backdrop-blur-sm">
            <div className="flex items-center gap-2 truncate">
              <Navigation className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="truncate font-medium text-zinc-900">
                {selectedPoint.name}
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono tabular-nums text-zinc-600">
              <span>
                {calculateDistanceKm(driverLocation, selectedPoint.location)} km
              </span>
              <span aria-hidden="true">·</span>
              <span>
                ~
                {estimateEtaMinutes(
                  calculateDistanceKm(driverLocation, selectedPoint.location)
                )}{' '}
                min drive
              </span>
            </div>
          </div>
        )}
      </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-500">
        <div className="flex items-center gap-4">
          <span>Emerald: Available · Amber: Reserved · Canopy: Partner DC Hub</span>
        </div>
        <span className="font-mono tabular-nums">
          Driver pin: {driverLocation.lat.toFixed(3)}°N,{' '}
          {driverLocation.lon.toFixed(3)}°E
        </span>
      </div>
    </div>
  );
}
