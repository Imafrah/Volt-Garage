// api/server.ts
import express from "express";

// src/server/store.ts
import crypto from "crypto";
import fs from "fs";
import path from "path";

// src/domain/imchargeEngine.ts
var HOLD_DURATION_MINUTES = 30;
var PROXIMITY_RADIUS_KM = 10;
var PRIVATE_HOST_COMMISSION_RATE = 0.2;
var COMPANY_STATION_COMMISSION_RATE = 0.15;
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function round3(value) {
  return Math.round((value + Number.EPSILON) * 1e3) / 1e3;
}
function calculateDistanceKm(a, b) {
  const toRad = (deg) => deg * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return round2(earthRadiusKm * c);
}
function estimateEtaMinutes(distanceKm) {
  if (distanceKm <= 0) return 1;
  return Math.max(2, Math.round(distanceKm / 28 * 60));
}
function isWithinProximityRadius(driverLoc, chargerLoc, maxRadiusKm = PROXIMITY_RADIUS_KM) {
  return calculateDistanceKm(driverLoc, chargerLoc) <= maxRadiusKm;
}
var VALID_TRANSITIONS = {
  reserved: ["confirmed", "cancelled"],
  confirmed: ["charging", "cancelled"],
  charging: ["completed", "disputed", "cancelled"],
  completed: [],
  disputed: ["completed", "cancelled"],
  cancelled: []
};
function canTransitionReservation(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
function createHoldWindow(reservedAtMs, holdMinutes = HOLD_DURATION_MINUTES) {
  const reservedAt = new Date(reservedAtMs).toISOString();
  const expiresAt = new Date(reservedAtMs + holdMinutes * 60 * 1e3).toISOString();
  return { reservedAt, expiresAt };
}
function isReservationExpired(reservation, nowMs) {
  if (reservation.status !== "reserved") return false;
  return nowMs >= Date.parse(reservation.expiresAt);
}
function hasConnectorConflict(reservations, chargingPointId, connectorId, nowMs) {
  return reservations.some((res) => {
    if (res.chargingPointId !== chargingPointId || res.connectorId !== connectorId) {
      return false;
    }
    if (res.status === "confirmed" || res.status === "charging") {
      return true;
    }
    if (res.status === "reserved") {
      return !isReservationExpired(res, nowMs);
    }
    return false;
  });
}
function calculateMeteredBilling(meterStartWh, meterEndWh, pricePerKwh, commissionRate = PRIVATE_HOST_COMMISSION_RATE) {
  if (!Number.isFinite(meterStartWh) || !Number.isFinite(meterEndWh)) {
    throw new Error("Meter readings must be valid numbers.");
  }
  if (meterEndWh < meterStartWh) {
    throw new Error("End meter reading cannot be lower than start meter reading.");
  }
  if (pricePerKwh < 0) {
    throw new Error("Price per kWh cannot be negative.");
  }
  const energyDeliveredKwh = round3((meterEndWh - meterStartWh) / 1e3);
  const grossAmount = round2(energyDeliveredKwh * pricePerKwh);
  const imchargeCommission = round2(grossAmount * commissionRate);
  const hostPayout = round2(grossAmount - imchargeCommission);
  return {
    energyDeliveredKwh,
    grossAmount,
    imchargeCommission,
    hostPayout
  };
}
function calculateCompanyCommission(energyDeliveredKwh, pricePerKwh, commissionRate = COMPANY_STATION_COMMISSION_RATE) {
  if (!Number.isFinite(energyDeliveredKwh) || energyDeliveredKwh < 0) {
    throw new Error("Delivered energy must be a non-negative number.");
  }
  const grossAmount = round2(energyDeliveredKwh * pricePerKwh);
  const imchargeCommission = round2(grossAmount * commissionRate);
  return {
    energyDeliveredKwh: round3(energyDeliveredKwh),
    grossAmount,
    imchargeCommission,
    hostPayout: 0
  };
}
function detectMeterAnomaly(meterStartWh, meterEndWh, connectorPowerKw, durationMinutes) {
  if (meterEndWh < meterStartWh) {
    return {
      isAnomaly: true,
      reason: "End meter reading is lower than start meter reading."
    };
  }
  const deliveredKwh = (meterEndWh - meterStartWh) / 1e3;
  if (deliveredKwh <= 0) {
    return {
      isAnomaly: true,
      reason: "Zero energy consumption recorded on meter."
    };
  }
  if (deliveredKwh > 150) {
    return {
      isAnomaly: true,
      reason: `Delivered energy (${deliveredKwh.toFixed(1)} kWh) exceeds maximum single-session threshold (150 kWh).`
    };
  }
  const effectiveHours = Math.max(durationMinutes / 60, 0.5);
  const theoreticalMaxKwh = connectorPowerKw * effectiveHours * 1.25;
  if (deliveredKwh > theoreticalMaxKwh) {
    return {
      isAnomaly: true,
      reason: `Meter delta (${deliveredKwh.toFixed(2)} kWh) exceeds physical ${connectorPowerKw} kW hardware ceiling for session duration.`
    };
  }
  return { isAnomaly: false };
}
function generateQrToken(reservationId) {
  const suffix = reservationId.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase() || "0000";
  return `IMC-${suffix}-QR`;
}
function scoreChargingPoint(point, driverLoc, preferredConnectors) {
  const distKm = calculateDistanceKm(driverLoc, point.location);
  const hasAvailable = point.connectors.some((c) => c.status === "available");
  const matchesVehicle = preferredConnectors.length === 0 || point.connectors.some(
    (c) => preferredConnectors.includes(c.type) && c.status === "available"
  );
  let score = 100;
  score -= distKm * 6;
  score -= point.pricePerKwh * 20;
  score += point.rating * 5;
  if (hasAvailable) score += 25;
  if (matchesVehicle) score += 20;
  return round2(score);
}
function findNearestBackupConnector(points, excludedPointId, driverLoc, preferredConnectors, maxRadiusKm = PROXIMITY_RADIUS_KM) {
  const candidates = [];
  for (const point of points) {
    if (point.id === excludedPointId) continue;
    const distanceKm = calculateDistanceKm(driverLoc, point.location);
    if (distanceKm > maxRadiusKm) continue;
    const availableConnectors = point.connectors.filter(
      (c) => c.status === "available"
    );
    if (availableConnectors.length === 0) continue;
    const compatibleConnectors = availableConnectors.filter(
      (c) => preferredConnectors.includes(c.type)
    );
    const pool = compatibleConnectors.length > 0 ? compatibleConnectors : availableConnectors;
    const bestConnector = [...pool].sort((a, b) => b.powerKw - a.powerKw)[0];
    candidates.push({
      suggestion: {
        point,
        connector: bestConnector,
        distanceKm,
        etaMinutes: estimateEtaMinutes(distanceKm)
      },
      compatible: preferredConnectors.length === 0 || compatibleConnectors.length > 0,
      score: scoreChargingPoint(point, driverLoc, preferredConnectors)
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.compatible !== b.compatible) return a.compatible ? -1 : 1;
    if (a.suggestion.distanceKm !== b.suggestion.distanceKm) {
      return a.suggestion.distanceKm - b.suggestion.distanceKm;
    }
    return b.score - a.score;
  });
  return candidates[0].suggestion;
}
var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validateDriverRegistrationInput(input) {
  if (!input.name?.trim()) {
    return { ok: false, error: "Full name is required." };
  }
  if (!input.email?.trim() || !EMAIL_REGEX.test(input.email.trim())) {
    return { ok: false, error: "A valid email address is required." };
  }
  if (!input.phone?.trim() || input.phone.trim().length < 6) {
    return { ok: false, error: "A valid phone number is required." };
  }
  if (!input.password || input.password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }
  if (!input.paymentMethodLabel?.trim()) {
    return { ok: false, error: "Payment method label is required." };
  }
  if (!input.vehicle?.make?.trim() || !input.vehicle?.model?.trim() || !input.vehicle?.licensePlate?.trim()) {
    return {
      ok: false,
      error: "EV make, model, and license plate are required."
    };
  }
  if (!Number.isFinite(input.vehicle.batteryCapacity) || input.vehicle.batteryCapacity <= 0) {
    return { ok: false, error: "EV battery capacity (kWh) must be positive." };
  }
  if (!Array.isArray(input.vehicle.connectorType) || input.vehicle.connectorType.length === 0) {
    return {
      ok: false,
      error: "Select at least one compatible EV connector type."
    };
  }
  return { ok: true };
}
function validateHostRegistrationInput(input) {
  if (!input.name?.trim()) {
    return { ok: false, error: "Host or operator name is required." };
  }
  if (!input.email?.trim() || !EMAIL_REGEX.test(input.email.trim())) {
    return { ok: false, error: "A valid email address is required." };
  }
  if (!input.phone?.trim() || input.phone.trim().length < 6) {
    return { ok: false, error: "A valid phone number is required." };
  }
  if (!input.password || input.password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }
  if (!input.bankAccountIban?.trim() || input.bankAccountIban.trim().length < 6) {
    return { ok: false, error: "Payout account / IBAN or UPI ID is required." };
  }
  if (input.chargingPointType === "private_host") {
    if (!input.equipment?.brand?.trim() || !input.equipment?.model?.trim() || !input.equipment?.meterSerialNumber?.trim()) {
      return {
        ok: false,
        error: "Private hosts must enter charger brand, model, and smart meter serial number."
      };
    }
    if (!Number.isFinite(input.equipment.powerKw) || input.equipment.powerKw <= 0) {
      return { ok: false, error: "Charger power (kW) must be positive." };
    }
    if (!Array.isArray(input.equipment.connectorType) || input.equipment.connectorType.length === 0) {
      return {
        ok: false,
        error: "Select at least one charger connector type."
      };
    }
  } else {
    if (!input.partnerNetwork?.trim() || !input.partnerStationId?.trim()) {
      return {
        ok: false,
        error: "Partner operators must provide partner network name and station ID."
      };
    }
  }
  if (!input.availability?.weekdays?.trim() || !input.availability?.weekends?.trim()) {
    return {
      ok: false,
      error: "Weekday and weekend availability hours are required."
    };
  }
  return { ok: true };
}
function advanceTelemetryReading(current, startMeterWh, connectorPowerKw, pricePerKwh, stepSeconds, nowIso, energyScaleFactor = 1) {
  const safeStep = Math.max(0, stepSeconds);
  const effectivePowerKw = round2(
    Math.min(connectorPowerKw, Math.max(0.5, current.livePowerKw || connectorPowerKw * 0.92))
  );
  const deltaKwh = effectivePowerKw * (safeStep * Math.max(1, energyScaleFactor)) / 3600;
  const nextDeliveredKwh = round3(current.deliveredKwh + deltaKwh);
  const nextMeterWh = Math.round(startMeterWh + nextDeliveredKwh * 1e3);
  const nextCostInr = round2(nextDeliveredKwh * pricePerKwh);
  return {
    ...current,
    livePowerKw: effectivePowerKw,
    deliveredKwh: nextDeliveredKwh,
    currentMeterWh: nextMeterWh,
    estimatedCostInr: nextCostInr,
    elapsedSeconds: current.elapsedSeconds + safeStep,
    lastUpdatedAt: nowIso
  };
}
function isUnbookedWalkInLoad(powerKw, hasActiveSessionOnConnector, thresholdKw = 0.5) {
  return !hasActiveSessionOnConnector && Number.isFinite(powerKw) && powerKw > thresholdKw;
}
function findOutOfRangeReservations(reservations, chargingPoints, driverId, driverLocation, maxRadiusKm = PROXIMITY_RADIUS_KM) {
  const outOfRange = [];
  for (const res of reservations) {
    if (res.driverId !== driverId || res.status !== "reserved") continue;
    const cp = chargingPoints.find((p) => p.id === res.chargingPointId);
    if (!cp) continue;
    const distanceKm = calculateDistanceKm(driverLocation, cp.location);
    if (distanceKm > maxRadiusKm) {
      outOfRange.push({ reservation: res, distanceKm });
    }
  }
  return outOfRange;
}

// src/server/store.ts
var DATA_DIR = path.resolve(process.cwd(), "data");
var DB_FILE = path.join(DATA_DIR, "imcharge-db.json");
function createInitialSeedState() {
  const now = Date.now();
  const iso = (offsetMinutes) => new Date(now + offsetMinutes * 60 * 1e3).toISOString();
  const drivers = [
    {
      uid: "drv-elena",
      name: "Elena Weber",
      email: "elena.weber@imcharge.io",
      phone: "+49 170 4829104",
      rating: 4.9,
      reviewCount: 24,
      defaultLocation: { lat: 48.137154, lon: 11.576124 },
      // Munich Marienplatz
      paymentMethodLabel: "Visa \u2022\u2022\u2022\u2022 4821 (Stripe)",
      vehicles: [
        {
          id: "veh-model3",
          make: "Tesla",
          model: "Model 3 Long Range",
          year: 2024,
          licensePlate: "M-EC 402E",
          batteryCapacity: 75,
          connectorType: ["Type2", "CCS"]
        },
        {
          id: "veh-id4",
          make: "Volkswagen",
          model: "ID.4 Pro",
          year: 2023,
          licensePlate: "M-VW 881E",
          batteryCapacity: 77,
          connectorType: ["Type2", "CCS"]
        }
      ]
    },
    {
      uid: "drv-markus",
      name: "Markus Lindner",
      email: "markus.lindner@imcharge.io",
      phone: "+49 172 8841209",
      rating: 4.8,
      reviewCount: 11,
      defaultLocation: { lat: 48.1412, lon: 11.5794 },
      paymentMethodLabel: "Mastercard \u2022\u2022\u2022\u2022 7734 (Stripe)",
      vehicles: [
        {
          id: "veh-polestar2",
          make: "Polestar",
          model: "Polestar 2 Long Range",
          year: 2024,
          licensePlate: "M-PS 209E",
          batteryCapacity: 82,
          connectorType: ["Type2", "CCS"]
        }
      ]
    }
  ];
  const hosts = [
    {
      uid: "host-lukas",
      name: "Lukas Brenner",
      email: "lukas.brenner@munich-homes.de",
      phone: "+49 171 9928311",
      chargingPointType: "private_host",
      kycStatus: "verified",
      rating: 4.9,
      reviewCount: 19,
      commissionRate: 0.2,
      bankAccountIban: "DE89 3704 0044 0532 0130 00",
      equipment: {
        brand: "Easee",
        model: "Home 22kW",
        powerKw: 22,
        connectorType: ["Type2"],
        meterSerialNumber: "SM-400-20230501A4"
      },
      availability: {
        weekdays: "07:00 \u2013 22:00",
        weekends: "08:00 \u2013 23:00"
      }
    },
    {
      uid: "host-studio",
      name: "Albion Works Studio",
      email: "ops@albionworks-munich.de",
      phone: "+49 89 41209800",
      chargingPointType: "private_host",
      kycStatus: "verified",
      rating: 4.7,
      reviewCount: 14,
      commissionRate: 0.2,
      bankAccountIban: "DE44 7001 0080 0912 4411 02",
      equipment: {
        brand: "ABL",
        model: "eM4 Twin Pedestal",
        powerKw: 22,
        connectorType: ["Type2"],
        meterSerialNumber: "ABL-992014-M"
      },
      availability: {
        weekdays: "06:30 \u2013 21:00",
        weekends: "09:00 \u2013 20:00"
      }
    },
    {
      uid: "host-ionity",
      name: "Ionity GmbH Munich Hub",
      email: "fleet-ops@ionity.eu",
      phone: "+49 89 21548000",
      chargingPointType: "existing_station",
      kycStatus: "verified",
      rating: 4.8,
      reviewCount: 62,
      partnerNetwork: "Ionity",
      partnerStationId: "ION-MUC-014",
      commissionRate: 0.15,
      bankAccountIban: "DE12 5001 0517 5407 3249 31",
      availability: {
        weekdays: "24/7",
        weekends: "24/7"
      }
    },
    {
      uid: "host-chargepoint",
      name: "ChargePoint Bavaria Fleet",
      email: "partner-eu@chargepoint.com",
      phone: "+49 89 90403210",
      chargingPointType: "existing_station",
      kycStatus: "verified",
      rating: 4.6,
      reviewCount: 41,
      partnerNetwork: "ChargePoint",
      partnerStationId: "CP-BY-902",
      commissionRate: 0.15,
      bankAccountIban: "DE71 2004 1133 0491 8820 00",
      availability: {
        weekdays: "24/7",
        weekends: "24/7"
      }
    }
  ];
  const chargingPoints = [
    {
      id: "cp-schwabing-wallbox",
      hostUid: "host-lukas",
      hostName: "Lukas Brenner",
      type: "private_host",
      location: { lat: 48.1618, lon: 11.5861 },
      // ~2.8 km from Marienplatz
      address: "Leopoldstra\xDFe 84, 80802 M\xFCnchen",
      name: "Schwabing Residence Wallbox",
      description: "Private covered driveway with MID-certified digital smart meter (SM-400). Step-free access and instant QR arrival check-in.",
      connectors: [
        { id: "c-sw-1", type: "Type2", powerKw: 22, status: "available" },
        { id: "c-sw-2", type: "Type2", powerKw: 11, status: "available" }
      ],
      pricePerKwh: 18,
      commissionRate: 0.2,
      rating: 4.9,
      reviewCount: 2,
      photos: [
        "/src/assets/images/private_home_wallbox_1795443222640.jpg",
        "/src/assets/images/digital_smart_meter_1795443225372.jpg"
      ],
      availabilityHours: "07:00 \u2013 22:00 daily",
      kycVerified: true,
      meterSerialNumber: "SM-400-20230501A4",
      createdAt: iso(-14400),
      updatedAt: iso(-60)
    },
    {
      id: "cp-albion-courtyard",
      hostUid: "host-studio",
      hostName: "Albion Works Studio",
      type: "private_host",
      location: { lat: 48.1445, lon: 11.5608 },
      // ~1.4 km from Marienplatz
      address: "Brienner Stra\xDFe 45, 80333 M\xFCnchen",
      name: "Maxvorstadt Studio Courtyard",
      description: "Dedicated EV bay inside gated brick studio courtyard. Ideal for half-day charging while working nearby; cafe on site.",
      connectors: [
        { id: "c-al-1", type: "Type2", powerKw: 22, status: "available" },
        { id: "c-al-2", type: "Type1", powerKw: 7.4, status: "reserved" }
      ],
      pricePerKwh: 20,
      commissionRate: 0.2,
      rating: 4.7,
      reviewCount: 1,
      photos: [
        "/src/assets/images/private_office_charger_1795443224418.jpg",
        "/src/assets/images/digital_smart_meter_1795443225372.jpg"
      ],
      availabilityHours: "06:30 \u2013 21:00 Mon\u2013Sat",
      kycVerified: true,
      meterSerialNumber: "ABL-992014-M",
      createdAt: iso(-12e3),
      updatedAt: iso(-30)
    },
    {
      id: "cp-ionity-ostbahnhof",
      hostUid: "host-ionity",
      hostName: "Ionity GmbH Munich Hub",
      type: "existing_station",
      partnerName: "Ionity",
      location: { lat: 48.1274, lon: 11.6047 },
      // ~2.4 km from Marienplatz
      address: "Friedenstra\xDFe 18, 81671 M\xFCnchen",
      name: "Ionity Munich East Ultra-Rapid Hub",
      description: "Four 350 kW high-power CCS dispensers under timber canopy. Direct partner API sync every 5 minutes; automated start on QR scan.",
      connectors: [
        { id: "c-io-1", type: "CCS", powerKw: 350, status: "available" },
        { id: "c-io-2", type: "CCS", powerKw: 350, status: "occupied" },
        { id: "c-io-3", type: "CCS", powerKw: 350, status: "available" },
        { id: "c-io-4", type: "CHAdeMO", powerKw: 50, status: "available" }
      ],
      pricePerKwh: 28,
      commissionRate: 0.15,
      rating: 4.8,
      reviewCount: 2,
      photos: ["/src/assets/images/company_fast_hub_1795443225006.jpg"],
      availabilityHours: "24/7 Open Access",
      kycVerified: true,
      createdAt: iso(-28800),
      updatedAt: iso(-5)
    },
    {
      id: "cp-chargepoint-olympia",
      hostUid: "host-chargepoint",
      hostName: "ChargePoint Bavaria Fleet",
      type: "existing_station",
      partnerName: "ChargePoint",
      location: { lat: 48.1748, lon: 11.5529 },
      // ~4.5 km from Marienplatz
      address: "Spiridon-Louis-Ring 21, 80809 M\xFCnchen",
      name: "ChargePoint Olympiapark Express",
      description: "Partner fast-charging plaza adjacent to Olympiapark North entrance. Live occupancy telemetry via ChargePoint OCPP gateway.",
      connectors: [
        { id: "c-cp-1", type: "CCS", powerKw: 150, status: "available" },
        { id: "c-cp-2", type: "Type2", powerKw: 22, status: "available" }
      ],
      pricePerKwh: 24,
      commissionRate: 0.15,
      rating: 4.6,
      reviewCount: 1,
      photos: ["/src/assets/images/company_fast_hub_1795443225006.jpg"],
      availabilityHours: "24/7 Open Access",
      kycVerified: true,
      createdAt: iso(-2e4),
      updatedAt: iso(-12)
    },
    {
      id: "cp-garching-outer",
      hostUid: "host-ionity",
      hostName: "Ionity GmbH Munich Hub",
      type: "existing_station",
      partnerName: "Ionity",
      location: { lat: 48.2489, lon: 11.651 },
      // ~13.6 km from Marienplatz (tests >10 km radius!)
      address: "Lichtenbergstra\xDFe 8, 85748 Garching",
      name: "Ionity A9 Garching Corridor",
      description: "Highway corridor fast-charging park north of Munich ring road. Outside the 10 km downtown booking geofence.",
      connectors: [
        { id: "c-ga-1", type: "CCS", powerKw: 350, status: "available" },
        { id: "c-ga-2", type: "CCS", powerKw: 350, status: "available" }
      ],
      pricePerKwh: 28,
      commissionRate: 0.15,
      rating: 4.7,
      reviewCount: 1,
      photos: ["/src/assets/images/company_fast_hub_1795443225006.jpg"],
      availabilityHours: "24/7 Open Access",
      kycVerified: true,
      createdAt: iso(-25e3),
      updatedAt: iso(-15)
    }
  ];
  const holdSeed = createHoldWindow(now - 8 * 60 * 1e3, 30);
  const reservations = [
    {
      id: "res-seed-active",
      driverId: "drv-elena",
      driverName: "Elena Weber",
      hostId: "host-studio",
      chargingPointId: "cp-albion-courtyard",
      chargingPointName: "Maxvorstadt Studio Courtyard",
      chargingPointType: "private_host",
      connectorId: "c-al-2",
      connectorType: "Type1",
      powerKw: 7.4,
      pricePerKwh: 20,
      status: "reserved",
      reservedAt: holdSeed.reservedAt,
      expiresAt: holdSeed.expiresAt,
      qrCodeToken: "IMC-AL2A-QR",
      distanceKm: 1.4,
      notes: "Arriving in 10 min for 2-hour top-up."
    },
    {
      id: "res-seed-completed-1",
      driverId: "drv-elena",
      driverName: "Elena Weber",
      hostId: "host-lukas",
      chargingPointId: "cp-schwabing-wallbox",
      chargingPointName: "Schwabing Residence Wallbox",
      chargingPointType: "private_host",
      connectorId: "c-sw-1",
      connectorType: "Type2",
      powerKw: 22,
      pricePerKwh: 18,
      status: "completed",
      reservedAt: iso(-260),
      expiresAt: iso(-230),
      confirmedAt: iso(-250),
      startedAt: iso(-248),
      completedAt: iso(-168),
      qrCodeToken: "IMC-SW19-QR",
      distanceKm: 2.8
    },
    {
      id: "res-seed-disputed",
      driverId: "drv-elena",
      driverName: "Elena Weber",
      hostId: "host-lukas",
      chargingPointId: "cp-schwabing-wallbox",
      chargingPointName: "Schwabing Residence Wallbox",
      chargingPointType: "private_host",
      connectorId: "c-sw-2",
      connectorType: "Type2",
      powerKw: 11,
      pricePerKwh: 18,
      status: "disputed",
      reservedAt: iso(-720),
      expiresAt: iso(-690),
      confirmedAt: iso(-710),
      startedAt: iso(-705),
      completedAt: iso(-645),
      qrCodeToken: "IMC-DSP2-QR",
      distanceKm: 2.8
    }
  ];
  const sessions = [
    {
      id: "ses-seed-1",
      reservationId: "res-seed-completed-1",
      driverId: "drv-elena",
      driverName: "Elena Weber",
      hostId: "host-lukas",
      chargingPointId: "cp-schwabing-wallbox",
      chargingPointName: "Schwabing Residence Wallbox",
      chargingPointType: "private_host",
      connectorId: "c-sw-1",
      pricePerKwh: 18,
      startTime: iso(-248),
      endTime: iso(-168),
      energyDeliveredKwh: 22.4,
      meterReadingStartWh: 120180,
      meterReadingEndWh: 142580,
      meterPhotoStart: "/src/assets/images/digital_smart_meter_1795443225372.jpg",
      meterPhotoEnd: "/src/assets/images/digital_smart_meter_1795443225372.jpg",
      amount: 403.2,
      commission: 80.64,
      hostPayout: 322.56,
      status: "completed"
    },
    {
      id: "ses-seed-partner",
      reservationId: "res-partner-hist",
      driverId: "drv-elena",
      driverName: "Elena Weber",
      hostId: "host-ionity",
      chargingPointId: "cp-ionity-ostbahnhof",
      chargingPointName: "Ionity Munich East Ultra-Rapid Hub",
      chargingPointType: "existing_station",
      connectorId: "c-io-1",
      pricePerKwh: 28,
      startTime: iso(-1440),
      endTime: iso(-1405),
      energyDeliveredKwh: 42,
      amount: 1176,
      commission: 176.4,
      hostPayout: 0,
      status: "completed"
    },
    {
      id: "ses-seed-disputed",
      reservationId: "res-seed-disputed",
      driverId: "drv-elena",
      driverName: "Elena Weber",
      hostId: "host-lukas",
      chargingPointId: "cp-schwabing-wallbox",
      chargingPointName: "Schwabing Residence Wallbox",
      chargingPointType: "private_host",
      connectorId: "c-sw-2",
      pricePerKwh: 18,
      startTime: iso(-705),
      endTime: iso(-645),
      energyDeliveredKwh: 48.5,
      meterReadingStartWh: 71680,
      meterReadingEndWh: 120180,
      meterPhotoStart: "/src/assets/images/digital_smart_meter_1795443225372.jpg",
      meterPhotoEnd: "/src/assets/images/digital_smart_meter_1795443225372.jpg",
      amount: 873,
      commission: 174.6,
      hostPayout: 698.4,
      status: "disputed",
      disputeReason: "Meter delta (48.50 kWh) exceeds physical 11 kW hardware ceiling for 60-minute session duration."
    }
  ];
  const payments = [
    {
      id: "pay-seed-1",
      sessionId: "ses-seed-1",
      driverId: "drv-elena",
      hostId: "host-lukas",
      amount: 403.2,
      type: "charge",
      status: "completed",
      stripeTransactionId: "pi_3Q9xLmImCharge001",
      description: "Metered session \xB7 22.40 kWh @ \u20B918.00/kWh",
      createdAt: iso(-168),
      completedAt: iso(-167)
    },
    {
      id: "pay-seed-2",
      sessionId: "ses-seed-1",
      driverId: "drv-elena",
      hostId: "host-lukas",
      amount: 322.56,
      type: "payout",
      status: "pending",
      stripeTransactionId: "po_3Q9xLmHost001",
      description: "Host 80% share pending weekly settlement",
      createdAt: iso(-167)
    },
    {
      id: "pay-seed-3",
      sessionId: "ses-seed-partner",
      driverId: "drv-elena",
      hostId: "host-ionity",
      amount: 176.4,
      type: "commission",
      status: "completed",
      stripeTransactionId: "inv_Ionity15Pct002",
      description: "Ionity 15% partner commission (42.00 kWh)",
      createdAt: iso(-1405),
      completedAt: iso(-1404)
    }
  ];
  const reviews = [
    {
      id: "rev-1",
      chargingPointId: "cp-schwabing-wallbox",
      driverId: "drv-elena",
      driverName: "Elena Weber",
      rating: 5,
      comment: "Clean driveway access and exact digital meter readout matched my Tesla telemetry within 0.1 kWh.",
      createdAt: iso(-160)
    },
    {
      id: "rev-2",
      chargingPointId: "cp-schwabing-wallbox",
      driverId: "drv-markus",
      driverName: "Markus Lindner",
      rating: 5,
      comment: "Lukas verified QR code immediately and parking bay is spacious.",
      createdAt: iso(-2800)
    },
    {
      id: "rev-3",
      chargingPointId: "cp-albion-courtyard",
      driverId: "drv-sophia",
      driverName: "Sophia Klein",
      rating: 5,
      comment: "Quiet courtyard charger right near Odeonsplatz.",
      createdAt: iso(-1900)
    },
    {
      id: "rev-4",
      chargingPointId: "cp-ionity-ostbahnhof",
      driverId: "drv-elena",
      driverName: "Elena Weber",
      rating: 5,
      comment: "Hit 245 kW peak on stall 01. Timber canopy kept the rain off.",
      createdAt: iso(-1390)
    }
  ];
  const partners = [
    {
      id: "prt-ionity",
      partnerName: "Ionity",
      apiEndpoint: "https://ocpi.ionity.eu/2.2/locations",
      lastSyncTime: iso(-4),
      syncIntervalMinutes: 5,
      status: "active",
      syncedStationsCount: 2,
      commissionRate: 0.15
    },
    {
      id: "prt-chargepoint",
      partnerName: "ChargePoint",
      apiEndpoint: "https://api.chargepoint.com/ocpi/v2/stations",
      lastSyncTime: iso(-3),
      syncIntervalMinutes: 5,
      status: "active",
      syncedStationsCount: 1,
      commissionRate: 0.15
    },
    {
      id: "prt-fastned",
      partnerName: "Fastned",
      apiEndpoint: "https://api.fastnedcharging.com/v1/hubs",
      lastSyncTime: iso(-18),
      syncIntervalMinutes: 5,
      status: "error",
      syncedStationsCount: 0,
      commissionRate: 0.15
    }
  ];
  const telemetryEvents = [
    {
      id: "tel-seed-1",
      timestamp: iso(-3),
      chargingPointId: "cp-schwabing-wallbox",
      chargingPointName: "Schwabing Residence Wallbox",
      connectorId: "c-sw-1",
      eventType: "StatusNotification",
      protocol: "OCPP 2.0.1",
      powerKw: 0,
      meterWh: 142580,
      status: "available",
      summary: "Idle heartbeat verified \xB7 MID meter SM-400 synced at 142,580 Wh."
    },
    {
      id: "tel-seed-2",
      timestamp: iso(-4),
      chargingPointId: "cp-ionity-ostbahnhof",
      chargingPointName: "Ionity Munich East Ultra-Rapid Hub",
      connectorId: "c-io-1",
      eventType: "StatusNotification",
      protocol: "OCPI 2.2",
      powerKw: 0,
      status: "available",
      summary: "OCPI 2.2 station status polling active (350 kW DC stall ready)."
    }
  ];
  return {
    drivers,
    hosts,
    chargingPoints,
    reservations,
    sessions,
    payments,
    reviews,
    partners,
    liveTelemetry: {},
    telemetryEvents,
    telemetryHeartbeatEnabled: true
  };
}
var ImChargeStore = class {
  constructor() {
    this.state = this.loadFromDisk();
  }
  loadFromDisk() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.chargingPoints)) {
          return {
            ...parsed,
            liveTelemetry: parsed.liveTelemetry || {},
            telemetryEvents: Array.isArray(parsed.telemetryEvents) ? parsed.telemetryEvents : [],
            telemetryHeartbeatEnabled: parsed.telemetryHeartbeatEnabled !== false
          };
        }
      }
    } catch {
    }
    const seed = createInitialSeedState();
    this.saveToDisk(seed);
    return seed;
  }
  saveToDisk(state = this.state) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), "utf-8");
    } catch {
    }
  }
  expireStaleReservations(nowMs = Date.now()) {
    let expiredCount = 0;
    for (const res of this.state.reservations) {
      if (isReservationExpired(res, nowMs)) {
        res.status = "cancelled";
        res.notes = "Auto-cancelled after 30-minute hold window expired.";
        this.setConnectorStatus(res.chargingPointId, res.connectorId, "available");
        expiredCount++;
      }
    }
    if (expiredCount > 0) {
      this.saveToDisk();
    }
    return expiredCount;
  }
  setConnectorStatus(chargingPointId, connectorId, status) {
    const cp = this.state.chargingPoints.find((p) => p.id === chargingPointId);
    if (!cp) return;
    const conn = cp.connectors.find((c) => c.id === connectorId);
    if (conn) {
      conn.status = status;
      cp.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
  }
  getAnalytics() {
    const totalBookings = this.state.reservations.length;
    const activeSessions = this.state.sessions.filter(
      (s) => s.status === "in_progress"
    ).length;
    const completedSessionsList = this.state.sessions.filter(
      (s) => s.status === "completed"
    );
    const disputedSessions = this.state.sessions.filter(
      (s) => s.status === "disputed"
    ).length;
    const grossVolumeInr = round2(
      completedSessionsList.reduce((sum, s) => sum + s.amount, 0)
    );
    const netCommissionInr = round2(
      completedSessionsList.reduce((sum, s) => sum + s.commission, 0)
    );
    const hostPayoutsInr = round2(
      completedSessionsList.reduce((sum, s) => sum + s.hostPayout, 0)
    );
    const finishedOrDisputed = completedSessionsList.length + disputedSessions;
    const completionRatePct = finishedOrDisputed > 0 ? round2(completedSessionsList.length / finishedOrDisputed * 100) : 100;
    const disputeRatePct = finishedOrDisputed > 0 ? round2(disputedSessions / finishedOrDisputed * 100) : 0;
    return {
      totalBookings,
      activeSessions,
      completedSessions: completedSessionsList.length,
      disputedSessions,
      grossVolumeInr,
      netCommissionInr,
      hostPayoutsInr,
      completionRatePct,
      disputeRatePct,
      activeDriversCount: this.state.drivers.length,
      activeHostsCount: this.state.hosts.length
    };
  }
  getSnapshot() {
    this.expireStaleReservations();
    this.releaseAllOutOfRangeReservations();
    return {
      drivers: this.state.drivers,
      hosts: this.state.hosts,
      chargingPoints: this.state.chargingPoints,
      reservations: this.state.reservations,
      sessions: this.state.sessions,
      payments: this.state.payments,
      reviews: this.state.reviews,
      partners: this.state.partners,
      analytics: this.getAnalytics(),
      liveTelemetry: this.state.liveTelemetry,
      telemetryEvents: this.state.telemetryEvents,
      telemetryHeartbeatEnabled: this.state.telemetryHeartbeatEnabled
    };
  }
  releaseAllOutOfRangeReservations() {
    let total = 0;
    for (const driver of this.state.drivers) {
      const released = this.releaseOutOfRangeReservationsForDriver(
        driver.uid,
        driver.defaultLocation
      );
      total += released.length;
    }
    if (total > 0) {
      this.saveToDisk();
    }
    return total;
  }
  releaseOutOfRangeReservationsForDriver(driverId, driverLocation) {
    const outOfRange = findOutOfRangeReservations(
      this.state.reservations,
      this.state.chargingPoints,
      driverId,
      driverLocation,
      PROXIMITY_RADIUS_KM
    );
    if (outOfRange.length === 0) return [];
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const released = [];
    for (const { reservation, distanceKm } of outOfRange) {
      reservation.status = "cancelled";
      reservation.notes = `Auto-unreserved: driver moved ${distanceKm} km away (outside ${PROXIMITY_RADIUS_KM} km geofence). Connector released for other drivers.`;
      this.setConnectorStatus(
        reservation.chargingPointId,
        reservation.connectorId,
        "available"
      );
      this.pushTelemetryEvent({
        id: `tel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: nowIso,
        chargingPointId: reservation.chargingPointId,
        chargingPointName: reservation.chargingPointName,
        connectorId: reservation.connectorId,
        eventType: "StatusNotification",
        protocol: reservation.chargingPointType === "private_host" ? "OCPP 2.0.1" : "OCPI 2.2",
        powerKw: 0,
        status: "available",
        summary: `Geofence auto-unreserve: ${reservation.chargingPointName} (${reservation.connectorId}) released because ${reservation.driverName} moved ${distanceKm} km away (>${PROXIMITY_RADIUS_KM} km).`
      });
      released.push(reservation);
    }
    return released;
  }
  updateDriverLocation(driverId, location) {
    const driver = this.state.drivers.find((d) => d.uid === driverId);
    if (!driver) throw new Error("Driver not found.");
    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon) || location.lat < -90 || location.lat > 90 || location.lon < -180 || location.lon > 180) {
      throw new Error("Invalid GPS coordinates.");
    }
    driver.defaultLocation = {
      lat: Number(location.lat.toFixed(6)),
      lon: Number(location.lon.toFixed(6))
    };
    const autoReleasedReservations = this.releaseOutOfRangeReservationsForDriver(
      driver.uid,
      driver.defaultLocation
    );
    this.saveToDisk();
    return { driver, autoReleasedReservations };
  }
  pushTelemetryEvent(event) {
    this.state.telemetryEvents = [
      event,
      ...this.state.telemetryEvents || []
    ].slice(0, 25);
  }
  hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return { salt, hash };
  }
  registerDriver(input) {
    const validation = validateDriverRegistrationInput(input);
    if (!validation.ok) {
      throw new Error("error" in validation && validation.error ? validation.error : "Invalid driver registration");
    }
    const emailKey = input.email.trim().toLowerCase();
    if (this.state.drivers.some((d) => d.email.toLowerCase() === emailKey)) {
      throw new Error("An EV Vehicle Owner account with this email already exists.");
    }
    const uid = `drv-${Date.now().toString(36)}`;
    const vehicle = {
      id: `veh-${Date.now().toString(36)}`,
      make: input.vehicle.make.trim(),
      model: input.vehicle.model.trim(),
      year: Number(input.vehicle.year) || (/* @__PURE__ */ new Date()).getFullYear(),
      licensePlate: input.vehicle.licensePlate.trim().toUpperCase(),
      batteryCapacity: Number(input.vehicle.batteryCapacity),
      connectorType: input.vehicle.connectorType
    };
    const driver = {
      uid,
      name: input.name.trim(),
      email: emailKey,
      phone: input.phone.trim(),
      rating: 5,
      reviewCount: 0,
      defaultLocation: { lat: 48.137154, lon: 11.576124 },
      paymentMethodLabel: input.paymentMethodLabel.trim(),
      vehicles: [vehicle]
    };
    const { salt, hash } = this.hashPassword(input.password);
    this.state.credentials = this.state.credentials || {};
    this.state.credentials[`driver:${emailKey}`] = {
      role: "driver",
      uid,
      salt,
      hash
    };
    this.state.drivers.push(driver);
    this.saveToDisk();
    return driver;
  }
  registerHost(input) {
    const validation = validateHostRegistrationInput(input);
    if (!validation.ok) {
      throw new Error("error" in validation && validation.error ? validation.error : "Invalid host registration");
    }
    const emailKey = input.email.trim().toLowerCase();
    if (this.state.hosts.some((h) => h.email.toLowerCase() === emailKey)) {
      throw new Error("A Charging Host account with this email already exists.");
    }
    const uid = `host-${Date.now().toString(36)}`;
    const isPrivate = input.chargingPointType === "private_host";
    const host = {
      uid,
      name: input.name.trim(),
      email: emailKey,
      phone: input.phone.trim(),
      chargingPointType: input.chargingPointType,
      kycStatus: "verified",
      rating: 5,
      reviewCount: 0,
      partnerNetwork: !isPrivate ? input.partnerNetwork?.trim() : void 0,
      partnerStationId: !isPrivate ? input.partnerStationId?.trim() : void 0,
      commissionRate: isPrivate ? 0.2 : 0.15,
      bankAccountIban: input.bankAccountIban.trim().toUpperCase(),
      equipment: isPrivate && input.equipment ? {
        brand: input.equipment.brand.trim(),
        model: input.equipment.model.trim(),
        powerKw: Number(input.equipment.powerKw),
        connectorType: input.equipment.connectorType,
        meterSerialNumber: input.equipment.meterSerialNumber.trim().toUpperCase()
      } : void 0,
      availability: {
        weekdays: input.availability.weekdays.trim(),
        weekends: input.availability.weekends.trim()
      }
    };
    const { salt, hash } = this.hashPassword(input.password);
    this.state.credentials = this.state.credentials || {};
    this.state.credentials[`host:${emailKey}`] = {
      role: "host",
      uid,
      salt,
      hash
    };
    this.state.hosts.push(host);
    this.saveToDisk();
    return host;
  }
  addVehicle(driverId, input) {
    const driver = this.state.drivers.find((d) => d.uid === driverId);
    if (!driver) {
      throw new Error("Driver profile not found.");
    }
    const vehicle = {
      id: `veh-${Date.now().toString(36)}`,
      ...input
    };
    driver.vehicles.unshift(vehicle);
    this.saveToDisk();
    return vehicle;
  }
  createChargingPoint(input) {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const hostUid = input.hostUid || `host-${Date.now().toString(36)}`;
    const existingHost = this.state.hosts.find((h) => h.uid === hostUid);
    if (!existingHost) {
      this.state.hosts.push({
        uid: hostUid,
        name: input.hostName,
        email: `${input.hostName.toLowerCase().replace(/[^a-z0-9]/g, ".")}@imcharge.io`,
        phone: "+49 89 5550192",
        chargingPointType: input.type,
        kycStatus: "verified",
        rating: 5,
        reviewCount: 0,
        partnerNetwork: input.partnerName,
        partnerStationId: input.partnerStationId,
        commissionRate: input.type === "private_host" ? 0.2 : 0.15,
        bankAccountIban: "DE27 1007 7777 0209 2997 00",
        equipment: input.type === "private_host" ? {
          brand: "ImCharge Certified",
          model: `${input.powerKw}kW Wallbox`,
          powerKw: input.powerKw,
          connectorType: [input.connectorType],
          meterSerialNumber: input.meterSerialNumber || "SM-9901-NEW"
        } : void 0,
        availability: {
          weekdays: input.availabilityHours,
          weekends: input.availabilityHours
        }
      });
    }
    const cpId = `cp-${Date.now().toString(36)}`;
    const photo = input.type === "private_host" ? "/src/assets/images/private_home_wallbox_1795443222640.jpg" : "/src/assets/images/company_fast_hub_1795443225006.jpg";
    const newCp = {
      id: cpId,
      hostUid,
      hostName: input.hostName,
      type: input.type,
      partnerName: input.partnerName,
      location: { lat: input.lat, lon: input.lon },
      address: input.address,
      name: input.name,
      description: input.description,
      connectors: [
        {
          id: `c-${Date.now().toString(36)}`,
          type: input.connectorType,
          powerKw: input.powerKw,
          status: "available"
        }
      ],
      pricePerKwh: round2(input.pricePerKwh),
      commissionRate: input.type === "private_host" ? 0.2 : 0.15,
      rating: 5,
      reviewCount: 0,
      photos: [photo],
      availabilityHours: input.availabilityHours,
      kycVerified: true,
      meterSerialNumber: input.meterSerialNumber,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    this.state.chargingPoints.unshift(newCp);
    this.saveToDisk();
    return newCp;
  }
  createReservation(input) {
    const nowMs = Date.now();
    this.expireStaleReservations(nowMs);
    const driver = this.state.drivers.find((d) => d.uid === input.driverId);
    if (!driver) throw new Error("Driver not found.");
    const cp = this.state.chargingPoints.find(
      (p) => p.id === input.chargingPointId
    );
    if (!cp) throw new Error("Charging point not found.");
    const connector = cp.connectors.find((c) => c.id === input.connectorId);
    if (!connector) throw new Error("Connector not found.");
    if (connector.status !== "available" || hasConnectorConflict(this.state.reservations, cp.id, connector.id, nowMs)) {
      throw new Error("This connector is already reserved or occupied.");
    }
    const origin = input.driverLocation || driver.defaultLocation;
    driver.defaultLocation = origin;
    this.releaseOutOfRangeReservationsForDriver(driver.uid, origin);
    const distanceKm = calculateDistanceKm(origin, cp.location);
    if (input.enforceProximity !== false && !isWithinProximityRadius(origin, cp.location, PROXIMITY_RADIUS_KM)) {
      throw new Error(
        `Charging point is ${distanceKm} km away, outside the ${PROXIMITY_RADIUS_KM} km booking geofence.`
      );
    }
    const resId = `res-${Date.now().toString(36)}`;
    const hold = createHoldWindow(nowMs, 30);
    const reservation = {
      id: resId,
      driverId: driver.uid,
      driverName: driver.name,
      hostId: cp.hostUid,
      chargingPointId: cp.id,
      chargingPointName: cp.name,
      chargingPointType: cp.type,
      connectorId: connector.id,
      connectorType: connector.type,
      powerKw: connector.powerKw,
      pricePerKwh: cp.pricePerKwh,
      status: "reserved",
      reservedAt: hold.reservedAt,
      expiresAt: hold.expiresAt,
      qrCodeToken: generateQrToken(resId),
      distanceKm,
      notes: input.notes
    };
    this.state.reservations.unshift(reservation);
    this.setConnectorStatus(cp.id, connector.id, "reserved");
    this.saveToDisk();
    return reservation;
  }
  confirmReservation(resId, qrTokenOrConnector) {
    const res = this.state.reservations.find((r) => r.id === resId);
    if (!res) throw new Error("Reservation not found.");
    if (isReservationExpired(res, Date.now())) {
      this.expireStaleReservations();
      throw new Error("Reservation 30-minute hold has expired.");
    }
    if (!canTransitionReservation(res.status, "confirmed")) {
      throw new Error(`Cannot confirm reservation in "${res.status}" state.`);
    }
    const normalized = qrTokenOrConnector.trim().toUpperCase();
    const matchesQr = normalized === res.qrCodeToken.toUpperCase();
    const matchesConnector = normalized === res.connectorId.toUpperCase();
    if (!matchesQr && !matchesConnector) {
      throw new Error(
        `Invalid QR token or connector ID. Expected ${res.qrCodeToken} or ${res.connectorId}.`
      );
    }
    res.status = "confirmed";
    res.confirmedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.saveToDisk();
    return res;
  }
  cancelReservation(resId) {
    const res = this.state.reservations.find((r) => r.id === resId);
    if (!res) throw new Error("Reservation not found.");
    if (!canTransitionReservation(res.status, "cancelled")) {
      throw new Error(`Cannot cancel reservation in "${res.status}" state.`);
    }
    res.status = "cancelled";
    this.setConnectorStatus(res.chargingPointId, res.connectorId, "available");
    this.saveToDisk();
    return res;
  }
  updateConnectorStatus(pointId, connectorId, status, reason) {
    const cp = this.state.chargingPoints.find((p) => p.id === pointId);
    if (!cp) throw new Error("Charging point not found.");
    const conn = cp.connectors.find((c) => c.id === connectorId);
    if (!conn) throw new Error("Connector not found.");
    const hasLiveSession = this.state.sessions.some(
      (s) => s.chargingPointId === pointId && s.connectorId === connectorId && s.status === "in_progress"
    );
    if (hasLiveSession) {
      throw new Error(
        "Cannot manually change connector status while an active ImCharge session is running."
      );
    }
    const cancelledReservationIds = [];
    if (status === "occupied" || status === "maintenance") {
      for (const res of this.state.reservations) {
        if (res.chargingPointId === pointId && res.connectorId === connectorId && (res.status === "reserved" || res.status === "confirmed")) {
          res.status = "cancelled";
          res.notes = reason?.trim() || (status === "occupied" ? "Auto-cancelled: connector occupied by walk-in / telemetry." : "Auto-cancelled: connector placed in maintenance.");
          cancelledReservationIds.push(res.id);
        }
      }
    }
    conn.status = status;
    cp.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.saveToDisk();
    return { point: cp, cancelledReservationIds };
  }
  reportBlockedBay(resId) {
    const res = this.state.reservations.find((r) => r.id === resId);
    if (!res) throw new Error("Reservation not found.");
    if (res.status !== "reserved") {
      throw new Error(
        `Blocked-bay fallback only applies to unconfirmed holds (currently "${res.status}").`
      );
    }
    res.status = "cancelled";
    res.notes = "Cancelled (no penalty): Bay physically blocked by unbooked vehicle on arrival.";
    this.setConnectorStatus(res.chargingPointId, res.connectorId, "occupied");
    const driver = this.state.drivers.find((d) => d.uid === res.driverId);
    const driverLoc = driver?.defaultLocation || { lat: 48.137154, lon: 11.576124 };
    const preferredConnectors = driver?.vehicles[0]?.connectorType ?? [res.connectorType];
    const backupSuggestion = findNearestBackupConnector(
      this.state.chargingPoints,
      res.chargingPointId,
      driverLoc,
      preferredConnectors,
      5
    );
    this.saveToDisk();
    return { reservation: res, backupSuggestion };
  }
  startChargingSession(input) {
    const res = this.state.reservations.find((r) => r.id === input.reservationId);
    if (!res) throw new Error("Reservation not found.");
    if (!canTransitionReservation(res.status, "charging")) {
      throw new Error(`Reservation must be confirmed before charging (currently "${res.status}").`);
    }
    if (res.chargingPointType === "private_host") {
      if (input.meterReadingStartWh === void 0 || !Number.isFinite(input.meterReadingStartWh) || input.meterReadingStartWh < 0) {
        throw new Error("Private host sessions require a valid starting meter reading (Wh).");
      }
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    res.status = "charging";
    res.startedAt = nowIso;
    this.setConnectorStatus(res.chargingPointId, res.connectorId, "occupied");
    const session = {
      id: `ses-${Date.now().toString(36)}`,
      reservationId: res.id,
      driverId: res.driverId,
      driverName: res.driverName,
      hostId: res.hostId,
      chargingPointId: res.chargingPointId,
      chargingPointName: res.chargingPointName,
      chargingPointType: res.chargingPointType,
      connectorId: res.connectorId,
      pricePerKwh: res.pricePerKwh,
      startTime: nowIso,
      energyDeliveredKwh: 0,
      meterReadingStartWh: res.chargingPointType === "private_host" ? input.meterReadingStartWh : void 0,
      meterPhotoStart: res.chargingPointType === "private_host" ? "/src/assets/images/digital_smart_meter_1795443225372.jpg" : void 0,
      amount: 0,
      commission: 0,
      hostPayout: 0,
      status: "in_progress"
    };
    const protocol = res.chargingPointType === "private_host" ? "OCPP 2.0.1" : "OCPI 2.2";
    const startMeterWh = session.meterReadingStartWh ?? 0;
    const initialPowerKw = round2(Math.max(1, (res.powerKw || 22) * 0.92));
    this.state.liveTelemetry[session.id] = {
      sessionId: session.id,
      chargingPointId: res.chargingPointId,
      connectorId: res.connectorId,
      livePowerKw: initialPowerKw,
      deliveredKwh: 0,
      currentMeterWh: startMeterWh,
      estimatedCostInr: 0,
      elapsedSeconds: 0,
      protocol,
      lastUpdatedAt: nowIso
    };
    this.pushTelemetryEvent({
      id: `tel-${Date.now().toString(36)}`,
      timestamp: nowIso,
      chargingPointId: res.chargingPointId,
      chargingPointName: res.chargingPointName,
      connectorId: res.connectorId,
      eventType: "StatusNotification",
      protocol,
      powerKw: initialPowerKw,
      meterWh: res.chargingPointType === "private_host" ? startMeterWh : void 0,
      status: "occupied",
      summary: `Session ${session.id} started \xB7 delivering ${initialPowerKw.toFixed(1)} kW (${protocol}).`
    });
    this.state.sessions.unshift(session);
    this.saveToDisk();
    return session;
  }
  endChargingSession(sessionId, input) {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error("Charging session not found.");
    if (session.status !== "in_progress") {
      throw new Error(`Session is already "${session.status}".`);
    }
    const res = this.state.reservations.find((r) => r.id === session.reservationId);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const durationMin = Math.max(
      1,
      Math.round((nowMs - Date.parse(session.startTime)) / 6e4)
    );
    if (session.chargingPointType === "private_host") {
      const startWh = session.meterReadingStartWh ?? 0;
      const endWh = input.meterReadingEndWh;
      if (endWh === void 0 || !Number.isFinite(endWh)) {
        throw new Error("Ending meter reading (Wh) is required to complete a private host session.");
      }
      if (endWh < startWh) {
        throw new Error("End meter reading cannot be lower than start meter reading.");
      }
      const billing = calculateMeteredBilling(
        startWh,
        endWh,
        session.pricePerKwh,
        0.2
      );
      const anomaly = detectMeterAnomaly(
        startWh,
        endWh,
        res?.powerKw ?? 22,
        durationMin
      );
      session.endTime = nowIso;
      session.meterReadingEndWh = endWh;
      session.meterPhotoEnd = "/src/assets/images/digital_smart_meter_1795443225372.jpg";
      session.energyDeliveredKwh = billing.energyDeliveredKwh;
      session.amount = billing.grossAmount;
      session.commission = billing.imchargeCommission;
      session.hostPayout = billing.hostPayout;
      if (input.flagDispute || anomaly.isAnomaly) {
        session.status = "disputed";
        session.disputeReason = input.disputeReason || anomaly.reason || "Meter reading flagged for admin review.";
        if (res) {
          res.status = "disputed";
          res.completedAt = nowIso;
        }
        delete this.state.liveTelemetry[session.id];
        this.pushTelemetryEvent({
          id: `tel-${Date.now().toString(36)}`,
          timestamp: nowIso,
          chargingPointId: session.chargingPointId,
          chargingPointName: session.chargingPointName,
          connectorId: session.connectorId,
          eventType: "StatusNotification",
          protocol: "OCPP 2.0.1",
          powerKw: 0,
          meterWh: endWh,
          status: "available",
          summary: `Session ${session.id} ended under meter review \xB7 connector returned to available.`
        });
        this.setConnectorStatus(session.chargingPointId, session.connectorId, "available");
        this.saveToDisk();
        return session;
      }
      session.status = "completed";
      if (res) {
        res.status = "completed";
        res.completedAt = nowIso;
      }
      this.state.payments.unshift(
        {
          id: `pay-${Date.now().toString(36)}-chg`,
          sessionId: session.id,
          driverId: session.driverId,
          hostId: session.hostId,
          amount: billing.grossAmount,
          type: "charge",
          status: "completed",
          stripeTransactionId: `pi_${Date.now().toString(36)}`,
          description: `Metered session \xB7 ${billing.energyDeliveredKwh.toFixed(2)} kWh @ \u20B9${session.pricePerKwh.toFixed(2)}/kWh`,
          createdAt: nowIso,
          completedAt: nowIso
        },
        {
          id: `pay-${Date.now().toString(36)}-po`,
          sessionId: session.id,
          driverId: session.driverId,
          hostId: session.hostId,
          amount: billing.hostPayout,
          type: "payout",
          status: "pending",
          stripeTransactionId: `po_${Date.now().toString(36)}`,
          description: `Host 80% share pending weekly payout`,
          createdAt: nowIso
        }
      );
    } else {
      const kwh = input.partnerEnergyKwh ?? 28.5;
      const commission = calculateCompanyCommission(kwh, session.pricePerKwh, 0.15);
      session.endTime = nowIso;
      session.energyDeliveredKwh = commission.energyDeliveredKwh;
      session.amount = commission.grossAmount;
      session.commission = commission.imchargeCommission;
      session.hostPayout = 0;
      session.status = "completed";
      if (res) {
        res.status = "completed";
        res.completedAt = nowIso;
      }
      this.state.payments.unshift({
        id: `pay-${Date.now().toString(36)}-com`,
        sessionId: session.id,
        driverId: session.driverId,
        hostId: session.hostId,
        amount: commission.imchargeCommission,
        type: "commission",
        status: "completed",
        stripeTransactionId: `inv_${Date.now().toString(36)}`,
        description: `Partner 15% commission (${kwh.toFixed(2)} kWh)`,
        createdAt: nowIso,
        completedAt: nowIso
      });
    }
    delete this.state.liveTelemetry[session.id];
    this.pushTelemetryEvent({
      id: `tel-${Date.now().toString(36)}`,
      timestamp: nowIso,
      chargingPointId: session.chargingPointId,
      chargingPointName: session.chargingPointName,
      connectorId: session.connectorId,
      eventType: "StatusNotification",
      protocol: session.chargingPointType === "private_host" ? "OCPP 2.0.1" : "OCPI 2.2",
      powerKw: 0,
      meterWh: session.meterReadingEndWh,
      status: "available",
      summary: `Session ${session.id} settled (${session.energyDeliveredKwh.toFixed(2)} kWh) \xB7 connector available.`
    });
    this.setConnectorStatus(session.chargingPointId, session.connectorId, "available");
    this.saveToDisk();
    return session;
  }
  addReview(input) {
    const cp = this.state.chargingPoints.find((p) => p.id === input.chargingPointId);
    if (!cp) throw new Error("Charging point not found.");
    const driver = this.state.drivers.find((d) => d.uid === input.driverId);
    const review = {
      id: `rev-${Date.now().toString(36)}`,
      chargingPointId: cp.id,
      driverId: input.driverId,
      driverName: driver?.name || "Driver",
      rating: Math.max(1, Math.min(5, Math.round(input.rating))),
      comment: input.comment.trim(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.state.reviews.unshift(review);
    const pointReviews = this.state.reviews.filter(
      (r) => r.chargingPointId === cp.id
    );
    const avg = pointReviews.reduce((acc, r) => acc + r.rating, 0) / pointReviews.length;
    cp.rating = Math.round(avg * 10) / 10;
    cp.reviewCount = pointReviews.length;
    this.saveToDisk();
    return review;
  }
  resolveDispute(sessionId, input) {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error("Session not found.");
    if (session.status !== "disputed") {
      throw new Error("Session is not in disputed state.");
    }
    const res = this.state.reservations.find((r) => r.id === session.reservationId);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (input.action === "refund") {
      session.status = "completed";
      session.amount = 0;
      session.commission = 0;
      session.hostPayout = 0;
      session.disputeReason = `${session.disputeReason || ""} \u2014 Resolved via full Stripe refund.`;
      if (res) res.status = "completed";
      this.state.payments.unshift({
        id: `pay-${Date.now().toString(36)}-ref`,
        sessionId: session.id,
        driverId: session.driverId,
        hostId: session.hostId,
        amount: 0,
        type: "charge",
        status: "refunded",
        stripeTransactionId: `re_${Date.now().toString(36)}`,
        description: `Dispute resolved: Stripe refund issued to driver`,
        createdAt: nowIso,
        completedAt: nowIso
      });
    } else {
      const startWh = session.meterReadingStartWh ?? 0;
      const endWh = input.adjustedMeterEndWh ?? session.meterReadingEndWh ?? startWh + 1e4;
      const billing = calculateMeteredBilling(
        startWh,
        endWh,
        session.pricePerKwh,
        0.2
      );
      session.meterReadingEndWh = endWh;
      session.energyDeliveredKwh = billing.energyDeliveredKwh;
      session.amount = billing.grossAmount;
      session.commission = billing.imchargeCommission;
      session.hostPayout = billing.hostPayout;
      session.status = "completed";
      session.disputeReason = void 0;
      if (res) res.status = "completed";
      this.state.payments.unshift(
        {
          id: `pay-${Date.now().toString(36)}-adj`,
          sessionId: session.id,
          driverId: session.driverId,
          hostId: session.hostId,
          amount: billing.grossAmount,
          type: "charge",
          status: "completed",
          stripeTransactionId: `pi_adj_${Date.now().toString(36)}`,
          description: `Adjusted meter settlement \xB7 ${billing.energyDeliveredKwh.toFixed(2)} kWh`,
          createdAt: nowIso,
          completedAt: nowIso
        },
        {
          id: `pay-${Date.now().toString(36)}-po`,
          sessionId: session.id,
          driverId: session.driverId,
          hostId: session.hostId,
          amount: billing.hostPayout,
          type: "payout",
          status: "pending",
          stripeTransactionId: `po_adj_${Date.now().toString(36)}`,
          description: `Host 80% adjusted share pending payout`,
          createdAt: nowIso
        }
      );
    }
    this.saveToDisk();
    return session;
  }
  syncPartner(partnerId) {
    const partner = this.state.partners.find((p) => p.id === partnerId);
    if (!partner) throw new Error("Partner integration not found.");
    partner.lastSyncTime = (/* @__PURE__ */ new Date()).toISOString();
    partner.status = "active";
    const matchingPoints = this.state.chargingPoints.filter(
      (cp) => cp.partnerName?.toLowerCase() === partner.partnerName.toLowerCase()
    );
    partner.syncedStationsCount = matchingPoints.length;
    for (const cp of matchingPoints) {
      cp.updatedAt = partner.lastSyncTime;
    }
    this.saveToDisk();
    return partner;
  }
  processHostPayouts(hostId) {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    let count = 0;
    for (const p of this.state.payments) {
      if (p.type === "payout" && p.status === "pending" && (!hostId || p.hostId === hostId)) {
        p.status = "completed";
        p.completedAt = nowIso;
        count++;
      }
    }
    if (count > 0) this.saveToDisk();
    return count;
  }
  setTelemetryHeartbeat(enabled) {
    this.state.telemetryHeartbeatEnabled = enabled;
    this.saveToDisk();
    return enabled;
  }
  tickActiveTelemetry(stepSeconds = 2, energyScaleFactor = 30) {
    const activeSessions = this.state.sessions.filter(
      (s) => s.status === "in_progress"
    );
    if (activeSessions.length === 0) return 0;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    let updatedCount = 0;
    for (const session of activeSessions) {
      const cp = this.state.chargingPoints.find(
        (p) => p.id === session.chargingPointId
      );
      const conn = cp?.connectors.find((c) => c.id === session.connectorId);
      const connectorPowerKw = conn?.powerKw ?? 22;
      const startMeterWh = session.meterReadingStartWh ?? 0;
      const protocol = session.chargingPointType === "private_host" ? "OCPP 2.0.1" : "OCPI 2.2";
      const current = this.state.liveTelemetry[session.id] ?? {
        sessionId: session.id,
        chargingPointId: session.chargingPointId,
        connectorId: session.connectorId,
        livePowerKw: round2(Math.max(1, connectorPowerKw * 0.92)),
        deliveredKwh: session.energyDeliveredKwh || 0,
        currentMeterWh: Math.round(
          startMeterWh + (session.energyDeliveredKwh || 0) * 1e3
        ),
        estimatedCostInr: round2(
          (session.energyDeliveredKwh || 0) * session.pricePerKwh
        ),
        elapsedSeconds: 0,
        protocol,
        lastUpdatedAt: nowIso
      };
      const next = advanceTelemetryReading(
        current,
        startMeterWh,
        connectorPowerKw,
        session.pricePerKwh,
        stepSeconds,
        nowIso,
        energyScaleFactor
      );
      this.state.liveTelemetry[session.id] = next;
      session.energyDeliveredKwh = next.deliveredKwh;
      updatedCount++;
    }
    if (updatedCount > 0) {
      this.saveToDisk();
    }
    return updatedCount;
  }
  ingestOcppTelemetry(payload) {
    const cp = this.state.chargingPoints.find(
      (p) => p.id === payload.chargingPointId
    );
    if (!cp) throw new Error("Charging point not found for telemetry event.");
    const conn = cp.connectors.find((c) => c.id === payload.connectorId);
    if (!conn) throw new Error("Connector not found for telemetry event.");
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const protocol = cp.type === "private_host" ? "OCPP 2.0.1" : "OCPI 2.2";
    const activeSession = this.state.sessions.find(
      (s) => s.chargingPointId === cp.id && s.connectorId === conn.id && s.status === "in_progress"
    );
    const hasActive = Boolean(activeSession);
    const detectedWalkIn = payload.eventType === "WalkInLoadDetected" || payload.status === "occupied" && !hasActive || isUnbookedWalkInLoad(payload.powerKw ?? 0, hasActive);
    if (detectedWalkIn) {
      const loadKw = round2(
        payload.powerKw !== void 0 && payload.powerKw > 0.5 ? payload.powerKw : Math.min(conn.powerKw, 7.4)
      );
      const result = this.updateConnectorStatus(
        cp.id,
        conn.id,
        "occupied",
        `Auto-flagged occupied via ${protocol} smart meter load (${loadKw.toFixed(1)} kW).`
      );
      const cancelledSuffix = result.cancelledReservationIds.length > 0 ? ` Auto-cancelled hold(s): ${result.cancelledReservationIds.join(", ")}.` : "";
      const event2 = {
        id: `tel-${Date.now().toString(36)}`,
        timestamp: nowIso,
        chargingPointId: cp.id,
        chargingPointName: cp.name,
        connectorId: conn.id,
        eventType: "WalkInLoadDetected",
        protocol,
        powerKw: loadKw,
        meterWh: payload.meterWh,
        status: "occupied",
        summary: `Unbooked ${loadKw.toFixed(1)} kW draw detected on ${conn.id}; connector marked occupied.${cancelledSuffix}`
      };
      this.pushTelemetryEvent(event2);
      this.saveToDisk();
      return {
        event: event2,
        cancelledReservationIds: result.cancelledReservationIds
      };
    }
    if (payload.eventType === "StatusNotification" && (payload.status === "available" || payload.status === "maintenance")) {
      const result = this.updateConnectorStatus(
        cp.id,
        conn.id,
        payload.status,
        `${protocol} StatusNotification set connector to ${payload.status}.`
      );
      const event2 = {
        id: `tel-${Date.now().toString(36)}`,
        timestamp: nowIso,
        chargingPointId: cp.id,
        chargingPointName: cp.name,
        connectorId: conn.id,
        eventType: "StatusNotification",
        protocol,
        powerKw: round2(payload.powerKw ?? 0),
        meterWh: payload.meterWh,
        status: payload.status,
        summary: `StatusNotification updated ${conn.id} to ${payload.status}.`
      };
      this.pushTelemetryEvent(event2);
      this.saveToDisk();
      return {
        event: event2,
        cancelledReservationIds: result.cancelledReservationIds
      };
    }
    if (activeSession) {
      const startMeterWh = activeSession.meterReadingStartWh ?? 0;
      const baseReading = this.state.liveTelemetry[activeSession.id] ?? {
        sessionId: activeSession.id,
        chargingPointId: cp.id,
        connectorId: conn.id,
        livePowerKw: round2(
          payload.powerKw ?? Math.max(1, conn.powerKw * 0.92)
        ),
        deliveredKwh: activeSession.energyDeliveredKwh || 0,
        currentMeterWh: Math.round(
          startMeterWh + (activeSession.energyDeliveredKwh || 0) * 1e3
        ),
        estimatedCostInr: round2(
          (activeSession.energyDeliveredKwh || 0) * cp.pricePerKwh
        ),
        elapsedSeconds: 0,
        protocol,
        lastUpdatedAt: nowIso
      };
      let next;
      if (payload.meterWh !== void 0 && Number.isFinite(payload.meterWh) && payload.meterWh >= startMeterWh) {
        const deliveredKwh = round2((payload.meterWh - startMeterWh) / 1e3);
        next = {
          ...baseReading,
          livePowerKw: round2(
            payload.powerKw !== void 0 && payload.powerKw > 0 ? payload.powerKw : baseReading.livePowerKw
          ),
          deliveredKwh,
          currentMeterWh: Math.round(payload.meterWh),
          estimatedCostInr: round2(deliveredKwh * cp.pricePerKwh),
          elapsedSeconds: baseReading.elapsedSeconds + 15,
          lastUpdatedAt: nowIso
        };
      } else {
        const seeded = payload.powerKw !== void 0 && payload.powerKw > 0 ? { ...baseReading, livePowerKw: round2(payload.powerKw) } : baseReading;
        next = advanceTelemetryReading(
          seeded,
          startMeterWh,
          conn.powerKw,
          cp.pricePerKwh,
          15,
          nowIso,
          20
        );
      }
      this.state.liveTelemetry[activeSession.id] = next;
      activeSession.energyDeliveredKwh = next.deliveredKwh;
      const event2 = {
        id: `tel-${Date.now().toString(36)}`,
        timestamp: nowIso,
        chargingPointId: cp.id,
        chargingPointName: cp.name,
        connectorId: conn.id,
        eventType: "MeterValues",
        protocol,
        powerKw: next.livePowerKw,
        meterWh: next.currentMeterWh,
        status: "occupied",
        summary: `MeterValues pulse for ${activeSession.id}: ${next.livePowerKw.toFixed(1)} kW \xB7 ${next.deliveredKwh.toFixed(2)} kWh (\u20B9${next.estimatedCostInr.toFixed(2)}).`
      };
      this.pushTelemetryEvent(event2);
      this.saveToDisk();
      return { event: event2, cancelledReservationIds: [] };
    }
    const idleKw = round2(Math.max(0, payload.powerKw ?? 0));
    const event = {
      id: `tel-${Date.now().toString(36)}`,
      timestamp: nowIso,
      chargingPointId: cp.id,
      chargingPointName: cp.name,
      connectorId: conn.id,
      eventType: "MeterValues",
      protocol,
      powerKw: idleKw,
      meterWh: payload.meterWh,
      status: conn.status,
      summary: `Idle MeterValues pulse on ${conn.id} (${idleKw.toFixed(2)} kW, below 0.5 kW load threshold).`
    };
    this.pushTelemetryEvent(event);
    this.saveToDisk();
    return { event, cancelledReservationIds: [] };
  }
  resetDemoData() {
    this.state = createInitialSeedState();
    this.saveToDisk();
    return this.getSnapshot();
  }
};
var store = new ImChargeStore();

// api/server.ts
var app = express();
app.use(express.json());
var sseClients = /* @__PURE__ */ new Set();
function broadcastSnapshot() {
  if (sseClients.size === 0) return;
  const payload = `event: snapshot
data: ${JSON.stringify(store.getSnapshot())}

`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "imcharge-api-gateway" });
});
app.get("/api/v1/telemetry/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
  sseClients.add(res);
  res.write(`event: snapshot
data: ${JSON.stringify(store.getSnapshot())}

`);
  const keepAlive = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 15e3);
  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});
app.post("/api/v1/telemetry/ocpp", (req, res) => {
  try {
    const { chargingPointId, connectorId, eventType, powerKw, meterWh, status } = req.body || {};
    if (!chargingPointId || !connectorId || !eventType) {
      res.status(400).json({ error: "chargingPointId, connectorId, and eventType are required." });
      return;
    }
    if (eventType !== "MeterValues" && eventType !== "StatusNotification" && eventType !== "WalkInLoadDetected") {
      res.status(400).json({ error: "Unsupported OCPP eventType." });
      return;
    }
    const result = store.ingestOcppTelemetry({
      chargingPointId: String(chargingPointId),
      connectorId: String(connectorId),
      eventType,
      powerKw: powerKw !== void 0 ? Number(powerKw) : void 0,
      meterWh: meterWh !== void 0 ? Number(meterWh) : void 0,
      status
    });
    broadcastSnapshot();
    res.json({ event: result.event, cancelledReservationIds: result.cancelledReservationIds, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/telemetry/heartbeat", (req, res) => {
  try {
    const enabled = store.setTelemetryHeartbeat(Boolean(req.body?.enabled));
    broadcastSnapshot();
    res.json({ enabled, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.get("/api/v1/bootstrap", (_req, res) => {
  res.json(store.getSnapshot());
});
app.post("/api/v1/demo/reset", (_req, res) => {
  const snap = store.resetDemoData();
  broadcastSnapshot();
  res.json(snap);
});
app.post("/api/v1/drivers/register", (req, res) => {
  try {
    const driver = store.registerDriver(req.body || {});
    broadcastSnapshot();
    res.status(201).json({ driver, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/hosts/register", (req, res) => {
  try {
    const host = store.registerHost(req.body || {});
    broadcastSnapshot();
    res.status(201).json({ host, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/drivers/:driverId/vehicles", (req, res) => {
  try {
    const { make, model, year, licensePlate, batteryCapacity, connectorType } = req.body || {};
    if (!make || !model || !licensePlate || !Array.isArray(connectorType) || connectorType.length === 0) {
      res.status(400).json({ error: "Vehicle make, model, licensePlate, and connectorType are required." });
      return;
    }
    const vehicle = store.addVehicle(req.params.driverId, {
      make: String(make),
      model: String(model),
      year: Number(year) || 2024,
      licensePlate: String(licensePlate),
      batteryCapacity: Number(batteryCapacity) || 75,
      connectorType
    });
    broadcastSnapshot();
    res.status(201).json({ vehicle, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/drivers/:driverId/location", (req, res) => {
  try {
    const { lat, lon } = req.body || {};
    if (lat === void 0 || lon === void 0) {
      res.status(400).json({ error: "lat and lon are required." });
      return;
    }
    const result = store.updateDriverLocation(req.params.driverId, { lat: Number(lat), lon: Number(lon) });
    broadcastSnapshot();
    res.json({ driver: result.driver, autoReleasedReservations: result.autoReleasedReservations, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.get("/api/v1/charging-points", (_req, res) => {
  res.json({ chargingPoints: store.getSnapshot().chargingPoints });
});
app.post("/api/v1/charging-points", (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.address || !body.hostName || !body.connectorType) {
      res.status(400).json({ error: "Name, address, host name, and connector type are required." });
      return;
    }
    const cp = store.createChargingPoint({
      hostUid: body.hostUid,
      hostName: String(body.hostName),
      type: body.type === "existing_station" ? "existing_station" : "private_host",
      partnerName: body.partnerName,
      partnerStationId: body.partnerStationId,
      name: String(body.name),
      address: String(body.address),
      description: String(body.description || "Verified ImCharge charging bay."),
      lat: Number(body.lat) || 48.1415,
      lon: Number(body.lon) || 11.5712,
      pricePerKwh: Number(body.pricePerKwh) || 18,
      connectorType: body.connectorType,
      powerKw: Number(body.powerKw) || 22,
      meterSerialNumber: body.meterSerialNumber,
      availabilityHours: String(body.availabilityHours || "07:00 \u2013 22:00 daily")
    });
    broadcastSnapshot();
    res.status(201).json({ chargingPoint: cp, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/reservations", (req, res) => {
  try {
    const { driverId, chargingPointId, connectorId, driverLocation, enforceProximity, notes } = req.body || {};
    if (!driverId || !chargingPointId || !connectorId) {
      res.status(400).json({ error: "driverId, chargingPointId, and connectorId are required." });
      return;
    }
    const reservation = store.createReservation({ driverId, chargingPointId, connectorId, driverLocation, enforceProximity, notes });
    broadcastSnapshot();
    res.status(201).json({ reservation, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/reservations/:resId/confirm", (req, res) => {
  try {
    const { qrToken } = req.body || {};
    if (!qrToken) {
      res.status(400).json({ error: "QR token or connector ID is required." });
      return;
    }
    const reservation = store.confirmReservation(req.params.resId, String(qrToken));
    broadcastSnapshot();
    res.json({ reservation, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/reservations/:resId/cancel", (req, res) => {
  try {
    const reservation = store.cancelReservation(req.params.resId);
    broadcastSnapshot();
    res.json({ reservation, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/charging-sessions", (req, res) => {
  try {
    const { reservationId, meterReadingStartWh } = req.body || {};
    if (!reservationId) {
      res.status(400).json({ error: "reservationId is required." });
      return;
    }
    const session = store.startChargingSession({
      reservationId,
      meterReadingStartWh: meterReadingStartWh !== void 0 ? Number(meterReadingStartWh) : void 0
    });
    broadcastSnapshot();
    res.status(201).json({ session, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/charging-sessions/:sessionId/end", (req, res) => {
  try {
    const { meterReadingEndWh, partnerEnergyKwh, flagDispute, disputeReason } = req.body || {};
    const session = store.endChargingSession(req.params.sessionId, {
      meterReadingEndWh: meterReadingEndWh !== void 0 ? Number(meterReadingEndWh) : void 0,
      partnerEnergyKwh: partnerEnergyKwh !== void 0 ? Number(partnerEnergyKwh) : void 0,
      flagDispute: Boolean(flagDispute),
      disputeReason
    });
    broadcastSnapshot();
    res.json({ session, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/charging-points/:pointId/connectors/:connectorId/status", (req, res) => {
  try {
    const { status, reason } = req.body || {};
    if (status !== "available" && status !== "occupied" && status !== "maintenance") {
      res.status(400).json({ error: 'status must be "available", "occupied", or "maintenance".' });
      return;
    }
    const result = store.updateConnectorStatus(req.params.pointId, req.params.connectorId, status, reason);
    broadcastSnapshot();
    res.json({ point: result.point, cancelledReservationIds: result.cancelledReservationIds, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/reservations/:resId/report-blocked", (req, res) => {
  try {
    const result = store.reportBlockedBay(req.params.resId);
    broadcastSnapshot();
    res.json({ reservation: result.reservation, backupSuggestion: result.backupSuggestion, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/reviews", (req, res) => {
  try {
    const { chargingPointId, driverId, rating, comment } = req.body || {};
    if (!chargingPointId || !driverId || !rating || !comment) {
      res.status(400).json({ error: "chargingPointId, driverId, rating, and comment are required." });
      return;
    }
    const review = store.addReview({ chargingPointId, driverId, rating: Number(rating), comment: String(comment) });
    broadcastSnapshot();
    res.status(201).json({ review, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/admin/disputes/:sessionId/resolve", (req, res) => {
  try {
    const { action, adjustedMeterEndWh } = req.body || {};
    if (action !== "approve_adjusted" && action !== "refund") {
      res.status(400).json({ error: "Invalid resolution action." });
      return;
    }
    const session = store.resolveDispute(req.params.sessionId, {
      action,
      adjustedMeterEndWh: adjustedMeterEndWh !== void 0 ? Number(adjustedMeterEndWh) : void 0
    });
    broadcastSnapshot();
    res.json({ session, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/admin/partners/:partnerId/sync", (req, res) => {
  try {
    const partner = store.syncPartner(req.params.partnerId);
    broadcastSnapshot();
    res.json({ partner, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/v1/hosts/:hostId/payouts/process", (req, res) => {
  try {
    const processedCount = store.processHostPayouts(req.params.hostId);
    broadcastSnapshot();
    res.json({ processedCount, snapshot: store.getSnapshot() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
var server_default = app;
export {
  server_default as default
};
