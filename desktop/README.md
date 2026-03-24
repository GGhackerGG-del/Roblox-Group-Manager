# Limited.Ink Desktop

Standalone desktop application for Windows and MacOS.

## Prerequisites

- Node.js 20+
- npm or pnpm
- Git

## Setup

```bash
# Clone the repository
git clone <repo-url>
cd <repo-name>

# Install workspace dependencies (needed for building)
pnpm install

# Navigate to desktop directory
cd desktop

# Install desktop-specific dependencies
npm install
```

## Build

### Build for your current platform
```bash
npm run pack
```

### Build for Windows (.exe installer)
```bash
npm run dist:win
```

### Build for MacOS (.dmg)
```bash
npm run dist:mac
```

### Build for both platforms
```bash
npm run dist
```

## Development

```bash
npm run dev
```

## Configuration

The application stores data in:
- **Windows**: `%APPDATA%/limited-ink-desktop/`
- **MacOS**: `~/Library/Application Support/limited-ink-desktop/`

### Environment Variables (optional)
- `TELEGRAM_BOT_TOKEN` — Token for the Telegram license bot
- `SESSION_SECRET` — Auto-generated if not provided

## Architecture

- **Electron** — Desktop shell
- **Express** — API server running on localhost
- **SQLite** — Local database (via better-sqlite3)
- **React + Vite** — Frontend (pre-built and served as static files)
