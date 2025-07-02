import { useState } from 'react';
import './App.css';

function App() {
  const [scanOutput, setScanOutput] = useState<string | null>(null);

  const handleScan = async () => {
    const result = await window.electronAPI?.scanDesktop?.();
    if (result) {
      setScanOutput(result.output || 'Scan completed with no output.');
    }
  };

  return (
    <div className="p-8 text-center">
      <h1 className="text-4xl font-bold mb-2">Digital Total Maintenance</h1>
      <p className="text-lg text-gray-600 mb-6">One-click scan of your local desktop workspace.</p>

      <button
        onClick={handleScan}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded shadow"
      >
        🧹 Scan Desktop
      </button>

      <div className="mt-10">
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">📊 Scan Output</h2>
        <pre className="text-left bg-gray-100 p-4 rounded whitespace-pre-wrap overflow-x-auto">
          {scanOutput || 'No scan yet.'}
        </pre>
      </div>
    </div>
  );
}

export default App;