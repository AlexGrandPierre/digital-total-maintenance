import logo from '../assets/dtm-logo.png';

export default function Header({
  isScanning,
  toggleSupport,
}: {
  isScanning: boolean;
  toggleSupport: () => void;
}) {
  return (
    <header className="rounded-[2rem] border border-slate-200 bg-white px-6 py-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSupport}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition hover:bg-slate-200"
            aria-label="Open support panel"
          >
            <div className="space-y-1">
              <div className="h-[2px] w-5 bg-slate-700" />
              <div className="h-[2px] w-5 bg-slate-700" />
              <div className="h-[2px] w-5 bg-slate-700" />
            </div>
          </button>

          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-50 ring-1 ring-slate-200">
            <img
              src={logo}
              alt="Digital Total Maintenance logo"
              className="h-16 w-16 object-contain"
            />
          </div>

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