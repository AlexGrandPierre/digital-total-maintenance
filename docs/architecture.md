# DTM Architecture

Digital Total Maintenance is organized into three main layers.

## Frontend

`src/`

React and TypeScript interface for scan controls, file review, CSV review, filters, session state, and user actions.

## Desktop Shell

`electron/`

Electron main process, preload bridge, IPC handlers, app window creation, and Python process execution.

## Backend Engine

`modules/`

Python analysis and action engine for filesystem scanning, CSV scanning, review indexing, session persistence, exports, and file actions.

## Packaged Python

`bundled-python/`

PyInstaller-built executables used by the packaged Electron app.

## Packaging

`packaging/`

Build artifacts and PyInstaller spec files.

## Scripts

`scripts/`

Repeatable local build and release helper scripts.
