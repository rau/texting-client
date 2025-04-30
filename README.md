# iMessage Search

A powerful desktop application for searching and managing your iMessage conversations on macOS.

## Features

- 🔍 Advanced search capabilities across all your messages
- 👥 Contact-based filtering
- 📎 Attachment search
- 📅 Date range filtering
- 💬 Group chat vs. Direct message filtering
- 🎯 Precise contact matching with flexible phone number support

## Installation

1. Download the latest release from the [Releases page](https://github.com/yourusername/your-repo-name/releases)
2. Open the DMG file
3. Drag the app to your Applications folder
4. When first launching, macOS will ask for permissions to access:
   - Messages (to read your iMessage database)
   - Contacts (to show contact names and photos)

## Development

### Prerequisites

- Node.js (v18 or later)
- Rust (latest stable)
- macOS (10.15 or later)

### Setup

1. Clone the repository:

```bash
git clone https://github.com/yourusername/your-repo-name.git
cd your-repo-name
```

2. Install dependencies:

```bash
npm install
```

3. Run in development mode:

```bash
npm run tauri dev
```

### Building

To create a production build:

```bash
npm run tauri build
```

## Releasing

To create a new release:

1. Update the version in `src-tauri/tauri.conf.json`
2. Commit your changes
3. Create and push a new tag:

```bash
git tag v1.0.0  # Replace with your version
git push origin v1.0.0
```

This will trigger the GitHub Actions workflow to build and release the app.

## Privacy

This app runs entirely on your local machine and does not send any data externally. It only reads from your local Messages and Contacts databases.

## License

MIT
