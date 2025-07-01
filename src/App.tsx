import { useEffect, useState } from 'react';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import './App.css';

type ExtractionEvent = {
  original: string;
  extractedTo: string;
  timestamp: string;
};

function App() {
  const [count, setCount] = useState(0);
  const [extractions, setExtractions] = useState<ExtractionEvent[]>([]);
  const [scanOutput, setScanOutput] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.receive?.('zip-extracted', (event: ExtractionEvent) => {
      setExtractions(prev => [event, ...prev]);
    });

    window.electronAPI?.onScanFinished?.((data) => {
      setScanOutput(data.output || 'Scan completed with no output.');
    });
  }, []);

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>

      <h1 className="text-3xl font-bold text-blue-600">Hello fucker</h1>

      <div className="card">
        <button onClick={() => setCount(count + 1)}>count is {count}</button>
        <p>Edit <code>src/App.tsx</code> and save to test HMR</p>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-semibold text-gray-800">📦 Extracted ZIPs</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {extractions.length === 0 ? (
            <li className="text-gray-500">No ZIPs extracted yet.</li>
          ) : (
            extractions.map((e, i) => (
              <li key={i} className="text-gray-700">
                <strong>{e.original}</strong> → <code>{e.extractedTo}</code> @ <em>{e.timestamp}</em>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-semibold text-green-700">🧠 Scan Output</h2>
        <pre className="mt-2 p-2 bg-gray-100 text-sm overflow-x-auto whitespace-pre-wrap">
          {scanOutput || 'No scan yet.'}
        </pre>
      </div>
    </>
  );
}

export default App;