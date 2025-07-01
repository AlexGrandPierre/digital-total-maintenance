# DTM Module: Desktop File Scanner

This module scans the user's Desktop folder and provides a JSON report summarizing:

- Total number of files
- File type counts
- Suspicious files (.zip, .dmg, .tmp, etc.)
- Age distribution of files
- Duplicate detection (by filename and size)

## Output

Printed to stdout as formatted JSON.

## Limitations

- Duplicate detection is basic and does not compute full content hashes.
- File system permission errors are silently ignored.
