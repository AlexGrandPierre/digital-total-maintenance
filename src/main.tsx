/**
 * main.tsx
 *
 * React application entry point for Digital Total Maintenance.
 *
 * Responsibilities:
 * - Load global styles
 * - Mount the React application
 * - Enable React Strict Mode
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);