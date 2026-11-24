import { useEffect, useState } from 'react';
import { Building2, Car, CheckCircle2, Home, ShieldCheck, X } from 'lucide-react';
import {
  validateDriverRegistrationInput,
  validateHostRegistrationInput,
} from '../domain/imchargeEngine';
import type {
  ChargingPointType,
  ConnectorType,
  DriverRegistrationInput,
  HostRegistrationInput,
} from '../domain/types';

export type RegistrationRole = 'driver' | 'host';

interface RegistrationModalProps {
  initialRole: RegistrationRole;
  onClose: () => void;
  onRegisterDriver: (payload: DriverRegistrationInput) => Promise<void>;
  onRegisterHost: (payload: HostRegistrationInput) => Promise<void>;
}

const CONNECTOR_OPTIONS: ConnectorType[] = ['Type2', 'CCS', 'CHAdeMO', 'Type1'];

export function RegistrationModal({
  initialRole,
  onClose,
  onRegisterDriver,
  onRegisterHost,
}: RegistrationModalProps) {
  const [role, setRole] = useState<RegistrationRole>(initialRole);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // EV Vehicle Owner fields
  const [drvName, setDrvName] = useState('');
  const [drvEmail, setDrvEmail] = useState('');
  const [drvPhone, setDrvPhone] = useState('');
  const [drvPassword, setDrvPassword] = useState('');
  const [drvPayment, setDrvPayment] = useState('UPI •••• 4419');
  const [vehMake, setVehMake] = useState('');
  const [vehModel, setVehModel] = useState('');
  const [vehYear, setVehYear] = useState('2025');
  const [vehPlate, setVehPlate] = useState('');
  const [vehBattery, setVehBattery] = useState('78');
  const [vehConnectors, setVehConnectors] = useState<ConnectorType[]>([
    'Type2',
    'CCS',
  ]);

  // Charging Host fields
  const [hostType, setHostType] = useState<ChargingPointType>('private_host');
  const [hostName, setHostName] = useState('');
  const [hostEmail, setHostEmail] = useState('');
  const [hostPhone, setHostPhone] = useState('');
  const [hostPassword, setHostPassword] = useState('');
  const [hostBank, setHostBank] = useState('');
  const [eqBrand, setEqBrand] = useState('Easee');
  const [eqModel, setEqModel] = useState('Home Wallbox 22kW');
  const [eqPower, setEqPower] = useState('22');
  const [eqMeter, setEqMeter] = useState('');
  const [eqConnectors, setEqConnectors] = useState<ConnectorType[]>(['Type2']);
  const [partnerNetwork, setPartnerNetwork] = useState('Ionity');
  const [partnerStationId, setPartnerStationId] = useState('');
  const [availWeekdays, setAvailWeekdays] = useState('07:00 – 22:00');
  const [availWeekends, setAvailWeekends] = useState('08:00 – 23:00');

  useEffect(() => {
    setRole(initialRole);
    setError(null);
  }, [initialRole]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function toggleConnector(
    list: ConnectorType[],
    setList: (next: ConnectorType[]) => void,
    conn: ConnectorType
  ) {
    setList(
      list.includes(conn) ? list.filter((c) => c !== conn) : [...list, conn]
    );
  }

  async function handleDriverSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: DriverRegistrationInput = {
      name: drvName.trim(),
      email: drvEmail.trim(),
      phone: drvPhone.trim(),
      password: drvPassword,
      paymentMethodLabel: drvPayment.trim() || 'UPI •••• 4419',
      vehicle: {
        make: vehMake.trim(),
        model: vehModel.trim(),
        year: Number(vehYear) || 2025,
        licensePlate: vehPlate.trim().toUpperCase(),
        batteryCapacity: Number(vehBattery) || 0,
        connectorType: vehConnectors,
      },
    };

    const check = validateDriverRegistrationInput(payload);
    if (!check.ok) {
      setError('error' in check && check.error ? check.error : 'Invalid registration details.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onRegisterDriver(payload);
    } catch (err) {
      setError((err as Error).message);
      setIsSubmitting(false);
    }
  }

  async function handleHostSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: HostRegistrationInput = {
      name: hostName.trim(),
      email: hostEmail.trim(),
      phone: hostPhone.trim(),
      password: hostPassword,
      chargingPointType: hostType,
      bankAccountIban: hostBank.trim(),
      partnerNetwork: hostType === 'existing_station' ? partnerNetwork.trim() : undefined,
      partnerStationId:
        hostType === 'existing_station' ? partnerStationId.trim() : undefined,
      equipment:
        hostType === 'private_host'
          ? {
              brand: eqBrand.trim(),
              model: eqModel.trim(),
              powerKw: Number(eqPower) || 0,
              connectorType: eqConnectors,
              meterSerialNumber: eqMeter.trim(),
            }
          : undefined,
      availability: {
        weekdays: availWeekdays.trim(),
        weekends: availWeekends.trim(),
      },
    };

    const check = validateHostRegistrationInput(payload);
    if (!check.ok) {
      setError('error' in check && check.error ? check.error : 'Invalid host details.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onRegisterHost(payload);
    } catch (err) {
      setError((err as Error).message);
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* Clean Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3.5 sm:px-6 sm:py-4">
          <div>
            <h2
              id="registration-modal-title"
              className="text-base font-bold text-slate-900"
            >
              {role === 'driver' ? 'Register as EV Owner' : 'Register as Charging Host'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Create your ImCharge account to reserve chargers or host private wallboxes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close registration modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {/* Segmented Account Type Selector */}
          <div
            role="tablist"
            aria-label="Registration role selector"
            className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={role === 'driver'}
              onClick={() => {
                setRole('driver');
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-colors ${
                role === 'driver'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Car className="h-4 w-4 text-emerald-600" />
              <span>EV Vehicle Owner</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={role === 'host'}
              onClick={() => {
                setRole('host');
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold transition-colors ${
                role === 'host'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Home className="h-4 w-4 text-emerald-600" />
              <span>Charging Host</span>
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-900"
            >
              {error}
            </div>
          )}

          {/* Form 1: EV Owner */}
          {role === 'driver' && (
            <form
              onSubmit={handleDriverSubmit}
              onChange={() => error && setError(null)}
              className="space-y-4"
            >
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  1. Contact &amp; Payment Details
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-drv-name" className="block text-xs font-medium text-slate-700">
                      Full Name *
                    </label>
                    <input
                      id="reg-drv-name"
                      type="text"
                      required
                      value={drvName}
                      onChange={(e) => setDrvName(e.target.value)}
                      placeholder="e.g. Lukas Weber"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-drv-email" className="block text-xs font-medium text-slate-700">
                      Email Address *
                    </label>
                    <input
                      id="reg-drv-email"
                      type="email"
                      required
                      value={drvEmail}
                      onChange={(e) => setDrvEmail(e.target.value)}
                      placeholder="e.g. lukas@example.de"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-drv-phone" className="block text-xs font-medium text-slate-700">
                      Phone Number *
                    </label>
                    <input
                      id="reg-drv-phone"
                      type="tel"
                      required
                      value={drvPhone}
                      onChange={(e) => setDrvPhone(e.target.value)}
                      placeholder="e.g. +49 171 4458921"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-drv-password" className="block text-xs font-medium text-slate-700">
                      Password (min. 6 characters) *
                    </label>
                    <input
                      id="reg-drv-password"
                      type="password"
                      required
                      minLength={6}
                      value={drvPassword}
                      onChange={(e) => setDrvPassword(e.target.value)}
                      placeholder="••••••••"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="reg-drv-payment" className="block text-xs font-medium text-slate-700">
                      Billing / Payment Method *
                    </label>
                    <input
                      id="reg-drv-payment"
                      type="text"
                      required
                      value={drvPayment}
                      onChange={(e) => setDrvPayment(e.target.value)}
                      placeholder="e.g. Visa •••• 4419 or UPI"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  2. Primary Electric Vehicle Specs
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="reg-veh-make" className="block text-xs font-medium text-slate-700">
                      Make *
                    </label>
                    <input
                      id="reg-veh-make"
                      type="text"
                      required
                      value={vehMake}
                      onChange={(e) => setVehMake(e.target.value)}
                      placeholder="e.g. BMW"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-veh-model" className="block text-xs font-medium text-slate-700">
                      Model *
                    </label>
                    <input
                      id="reg-veh-model"
                      type="text"
                      required
                      value={vehModel}
                      onChange={(e) => setVehModel(e.target.value)}
                      placeholder="e.g. i4 eDrive40"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-veh-plate" className="block text-xs font-medium text-slate-700">
                      License Plate *
                    </label>
                    <input
                      id="reg-veh-plate"
                      type="text"
                      required
                      value={vehPlate}
                      onChange={(e) => setVehPlate(e.target.value.toUpperCase())}
                      placeholder="e.g. M-EV 2025"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-veh-year" className="block text-xs font-medium text-slate-700">
                      Model Year
                    </label>
                    <input
                      id="reg-veh-year"
                      type="number"
                      min={2012}
                      max={2028}
                      value={vehYear}
                      onChange={(e) => setVehYear(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-veh-battery" className="block text-xs font-medium text-slate-700">
                      Battery Capacity (kWh) *
                    </label>
                    <input
                      id="reg-veh-battery"
                      type="number"
                      step="0.1"
                      min={10}
                      max={250}
                      required
                      value={vehBattery}
                      onChange={(e) => setVehBattery(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-700">
                    Charging Connectors (Select at least 1) *
                  </span>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {CONNECTOR_OPTIONS.map((conn) => (
                      <label
                        key={conn}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          vehConnectors.includes(conn)
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={vehConnectors.includes(conn)}
                          onChange={() =>
                            toggleConnector(vehConnectors, setVehConnectors, conn)
                          }
                          className="h-3.5 w-3.5 rounded border-slate-300 accent-emerald-600"
                        />
                        <span>{conn}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{isSubmitting ? 'Creating Account...' : 'Register as EV Owner'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Form 2: Charging Host */}
          {role === 'host' && (
            <form
              onSubmit={handleHostSubmit}
              onChange={() => error && setError(null)}
              className="space-y-4"
            >
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  1. Settlement Model &amp; Host Account
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setHostType('private_host')}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      hostType === 'private_host'
                        ? 'border-emerald-600 bg-emerald-50/70'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <Home className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                    <div>
                      <div className="text-xs font-semibold text-slate-900">
                        Private Wallbox (80% Payout)
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        Home or commercial charger with MID smart meter
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHostType('existing_station')}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      hostType === 'existing_station'
                        ? 'border-emerald-600 bg-emerald-50/70'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />
                    <div>
                      <div className="text-xs font-semibold text-slate-900">
                        Partner Hub (15% Split)
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        Commercial DC fast network via OCPI gateway
                      </div>
                    </div>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-host-name" className="block text-xs font-medium text-slate-700">
                      Host Name or Operator *
                    </label>
                    <input
                      id="reg-host-name"
                      type="text"
                      required
                      value={hostName}
                      onChange={(e) => setHostName(e.target.value)}
                      placeholder="e.g. Sabine Klein"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-host-email" className="block text-xs font-medium text-slate-700">
                      Email Address *
                    </label>
                    <input
                      id="reg-host-email"
                      type="email"
                      required
                      value={hostEmail}
                      onChange={(e) => setHostEmail(e.target.value)}
                      placeholder="e.g. sabine.klein@example.de"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-host-phone" className="block text-xs font-medium text-slate-700">
                      Phone Number *
                    </label>
                    <input
                      id="reg-host-phone"
                      type="tel"
                      required
                      value={hostPhone}
                      onChange={(e) => setHostPhone(e.target.value)}
                      placeholder="e.g. +49 176 8923410"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-host-password" className="block text-xs font-medium text-slate-700">
                      Password (min. 6 characters) *
                    </label>
                    <input
                      id="reg-host-password"
                      type="password"
                      required
                      minLength={6}
                      value={hostPassword}
                      onChange={(e) => setHostPassword(e.target.value)}
                      placeholder="••••••••"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="reg-host-bank" className="block text-xs font-medium text-slate-700">
                      Payout Bank Account (IBAN or UPI ID) *
                    </label>
                    <input
                      id="reg-host-bank"
                      type="text"
                      required
                      value={hostBank}
                      onChange={(e) => setHostBank(e.target.value)}
                      placeholder="e.g. DE89 3704 0044 0532 0130 99"
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  2. Charger Hardware &amp; Operational Hours
                </div>

                {hostType === 'private_host' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="reg-eq-brand" className="block text-xs font-medium text-slate-700">
                          Charger Brand *
                        </label>
                        <input
                          id="reg-eq-brand"
                          type="text"
                          required
                          value={eqBrand}
                          onChange={(e) => setEqBrand(e.target.value)}
                          placeholder="e.g. Easee"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label htmlFor="reg-eq-model" className="block text-xs font-medium text-slate-700">
                          Model *
                        </label>
                        <input
                          id="reg-eq-model"
                          type="text"
                          required
                          value={eqModel}
                          onChange={(e) => setEqModel(e.target.value)}
                          placeholder="e.g. Home Wallbox 22kW"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label htmlFor="reg-eq-power" className="block text-xs font-medium text-slate-700">
                          Power (kW) *
                        </label>
                        <input
                          id="reg-eq-power"
                          type="number"
                          step="0.1"
                          min={2}
                          max={350}
                          required
                          value={eqPower}
                          onChange={(e) => setEqPower(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label htmlFor="reg-eq-meter" className="block text-xs font-medium text-slate-700">
                          Smart Meter Serial (MID Certified) *
                        </label>
                        <input
                          id="reg-eq-meter"
                          type="text"
                          required
                          value={eqMeter}
                          onChange={(e) => setEqMeter(e.target.value)}
                          placeholder="e.g. SM-DE-MUC-90214"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs font-medium text-slate-700">
                        Connector Types (Select at least 1) *
                      </span>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {CONNECTOR_OPTIONS.map((conn) => (
                          <label
                            key={conn}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                              eqConnectors.includes(conn)
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={eqConnectors.includes(conn)}
                              onChange={() =>
                                toggleConnector(eqConnectors, setEqConnectors, conn)
                              }
                              className="h-3.5 w-3.5 rounded border-slate-300 accent-emerald-600"
                            />
                            <span>{conn}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="reg-partner-network" className="block text-xs font-medium text-slate-700">
                        Partner Network Name *
                      </label>
                      <input
                        id="reg-partner-network"
                        type="text"
                        required
                        value={partnerNetwork}
                        onChange={(e) => setPartnerNetwork(e.target.value)}
                        placeholder="e.g. Ionity"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label htmlFor="reg-partner-station" className="block text-xs font-medium text-slate-700">
                        Partner Station OCPI ID *
                      </label>
                      <input
                        id="reg-partner-station"
                        type="text"
                        required
                        value={partnerStationId}
                        onChange={(e) => setPartnerStationId(e.target.value)}
                        placeholder="e.g. ION-MUC-408"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-avail-weekdays" className="block text-xs font-medium text-slate-700">
                      Weekday Availability
                    </label>
                    <input
                      id="reg-avail-weekdays"
                      type="text"
                      value={availWeekdays}
                      onChange={(e) => setAvailWeekdays(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-avail-weekends" className="block text-xs font-medium text-slate-700">
                      Weekend Availability
                    </label>
                    <input
                      id="reg-avail-weekends"
                      type="text"
                      value={availWeekends}
                      onChange={(e) => setAvailWeekends(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>{isSubmitting ? 'Creating Account...' : 'Register as Charging Host'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
