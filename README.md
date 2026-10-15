# Gridly for Visual Studio Code

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.99.0-blue)](https://marketplace.visualstudio.com)

**Gridly** is a high-performance, lightweight, and privacy-first Visual Studio Code extension that tracks your active programming time and displays real-time statistics in the status bar.

Modeled on the architecture of the open-source CodeTime extension, Gridly features a robust offline queue, exponential backoff with jitter, zero-latency local event throttling, and native multi-language internationalization.

---

## ✨ Features

- **Status Bar Duration**: Shows your active coding time right in your status bar (e.g. `$(clock) 3h 12m`).
- **Flexible Modes**:
  - **Total**: All-time accumulated programming duration.
  - **Today**: Programming time since midnight in your local timezone.
  - **24h**: Programming time across the trailing 24 hours.
- **Offline & Crash Resilient**: Events are buffered in memory and mirrored to persistent storage. If your network drops or the server is temporarily unavailable, your coding time is never lost.
- **Privacy First**: Gridly **never** logs or transmits file contents, keystrokes, terminal contents, or clipboard data.
- **Path Obfuscation**: Optional setting to hash relative workspace paths with SHA-256 for complete confidentiality in proprietary codebases.
- **Internationalization**: Localized in 13 languages (English, Simplified Chinese, Traditional Chinese, Japanese, German, French, Spanish, Italian, Brazilian Portuguese, Russian, Korean, Hindi, and Urdu with RTL support).

---

## 🚀 Getting Started

### 1. Enter Your Upload Token

To sync statistics with your backend server:

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
2. Run `Gridly: Enter Token`.
3. Paste your authentication token. It is validated immediately against the server and stored securely in VS Code `SecretStorage`.

#### Online IDEs and GitHub Codespaces
In cloud-hosted environments like GitHub Codespaces, you can supply your token seamlessly via an environment variable without needing manual prompts:
```bash
export CODETIME_TOKEN="your-secret-token"
```
Gridly automatically checks `CODETIME_TOKEN` on startup before looking in secret storage.

### 2. View Status Bar Time

The status bar item is located on the bottom-left of VS Code:
- Click the status bar to jump straight to your web dashboard (`Gridly: Browse Dashboard`).
- Run `Gridly: Select Status Bar Display` to toggle between **Total**, **Today**, or **24h**.

---

## 🔒 Privacy & Data Collection

Gridly only collects high-level programming activity telemetry to accurately compute time spent per project and language.

### What is collected:
- **Timestamp** (epoch milliseconds)
- **Project name** (workspace folder name)
- **Language ID** (e.g. `typescript`, `python`, `rust`)
- **Relative file path** (e.g. `src/index.ts` — or its SHA-256 hash if obfuscation is enabled)
- **Operation type** (`write`, `save`, `open`, `focus`)
- **Editor & OS version** (`vscode 1.99.x`, operating system name)
- **Git branch & remote** (if available)

### What is NEVER collected:
- ❌ Source code contents
- ❌ Keystrokes or character inputs
- ❌ Passwords, environment files, or clipboard data
- ❌ Output console logs or terminal buffers

---

## ⚙️ Settings

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `gridly.statusBarInfo` | `enum` | `"Total"` | Choose between `"Total"`, `"Today"`, and `"24h"`. |
| `gridly.displayLanguage` | `enum` | `"Auto"` | Display language (or `"Auto"` to match VS Code). |
| `gridly.trackingEnabled` | `boolean` | `true` | Enable or disable programming activity tracking. |
| `gridly.obfuscateFilePaths` | `boolean` | `false` | When enabled, converts file paths into SHA-256 hashes before reporting. |

---

## 🧪 Testing with Local Mock Server

Gridly includes a built-in mock server (`src/mockServer.ts`) for testing and offline development:
```typescript
import { MockGridlyServer } from './mockServer';

const server = new MockGridlyServer();
const serverUrl = await server.start();
console.log(`Mock server running at: ${serverUrl}`);
```

---

## 🛠️ Building & Packaging

```bash
# Install dependencies
pnpm install

# Compile with Webpack 5
pnpm run compile

# Run tests
pnpm test

# Build production VSIX package
pnpm run vscode:package
```

---

## 📄 License

MIT © [Jeeva](https://github.com/Jeeva1070)
