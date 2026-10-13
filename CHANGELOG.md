# Changelog

All notable changes to the **CodeTrack** extension will be documented in this file.

## [0.1.0] - 2026-10-13

### Added
- Initial release of CodeTrack for Visual Studio Code.
- Real-time active programming tracking across multiple operation types (write, save, open, focus).
- Status bar statistics with Total, Today, and 24h duration views.
- Secure token handling via `SecretStorage` and `CODETIME_TOKEN` environment variable support.
- Persistent offline queue and retry pipeline with exponential backoff and jitter.
- SHA-256 relative path obfuscation option for privacy.
- Support for 13 languages including Urdu right-to-left numeral formatting.
- Integrated lightweight mock backend server for testing and self-hosted environments.