# Development

## Install

```bash
npm install

```bash
cat > docs/testing.md <<'EOF'
# Testing Notes

DTM is currently tested manually through local workflows.

## Local File Workflow

- Scan Desktop
- Scan Downloads
- Scan Documents
- Scan a custom folder
- Review file recommendations
- Archive or remove test files
- Confirm action history and restore behavior

## CSV Workflow

- Scan CSV dataset
- Load duplicate groups
- Load suspicious values
- Save duplicate decisions
- Save suspicious decisions
- Leave workflow and return
- Confirm session persistence
- Export clean copy

## Release Smoke Test

Before release, confirm:

- Packaged app opens
- Python executables run from the packaged app
- CSV scan completes
- Duplicate decisions persist
- Suspicious decisions persist
- Export folder opens
