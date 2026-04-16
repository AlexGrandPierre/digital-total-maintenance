type Props = {
  onClick: () => void;
  isScanning?: boolean;
};

function ScanButton({ onClick, isScanning = false }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={isScanning}
      className={`inline-flex items-center justify-center rounded-full px-6 py-3.5 text-sm font-semibold shadow-sm transition duration-200 ${
        isScanning
          ? 'cursor-not-allowed bg-slate-200 text-slate-500'
          : 'bg-rose-500 text-white hover:bg-rose-600 active:scale-[0.99]'
      }`}
    >
      {isScanning ? 'Scanning…' : 'Scan Test Folder'}
    </button>
  );
}

export default ScanButton;