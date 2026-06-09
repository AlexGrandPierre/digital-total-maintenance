import logo from '../assets/icon.png';

export default function Header({
  isScanning,
}: {
  isScanning: boolean;
}) {
  return (
    <header className="rounded-[2rem] border border-slate-200 bg-white px-6 py-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-5">

          <img
            src={logo}
            alt="Digital Total Maintenance logo"
            className="h-24 w-24 object-contain"
          />

          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">
              Digital Total Maintenance
            </p>

            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              Local-first file maintenance workspace
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Bounded, explainable, reversible cleanup for complex digital environments.
            </p>
          </div>

        </div>

        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              isScanning
                ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-200'
                : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
            }`}
          >
            {isScanning ? 'Scanning active' : 'Ready'}
          </span>
        </div>
      </div>
    </header>
  );
}