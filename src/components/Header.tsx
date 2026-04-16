type HeaderProps = {
  isScanning?: boolean;
};

function Header({ isScanning = false }: HeaderProps) {
  return (
    <header className="rounded-[2.25rem] border border-slate-200 bg-white px-6 py-8 shadow-sm md:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-400">
            Digital Total Maintenance
          </p>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
            Calm control for your digital environment
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-500">
            Scan, understand, and gradually improve the health of your digital space with a
            dashboard designed for clarity instead of overwhelm.
          </p>
        </div>

        <div className="flex shrink-0 items-center">
          <div
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
              isScanning
                ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-200'
                : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isScanning ? 'bg-sky-500' : 'bg-emerald-500'
              }`}
            />
            {isScanning ? 'Scan running' : 'Ready to scan'}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;