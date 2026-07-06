# Release Process

Current macOS beta release process:

1. Build Python executables.
2. Build Electron app.
3. Clean macOS metadata from the app bundle.
4. Re-sign Electron helper apps.
5. Re-sign the main app.
6. Verify code signature.
7. Zip with `ditto`.
8. Upload ZIP to GitHub Releases.

Unsigned beta builds may require users to approve the app through macOS Privacy & Security or remove quarantine locally.
