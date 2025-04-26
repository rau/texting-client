# iMessage Viewer for macOS

A desktop application that provides a modern interface for viewing your iMessage conversations. Built with Tauri, React, TypeScript, and Tailwind CSS.

## Features

- View all your iMessage conversations in a clean, modern interface
- Browse message history with proper formatting and timestamps
- Fast and responsive native app experience

## Requirements

- macOS (the app accesses the local iMessage database)
- Rust toolchain
- Node.js and npm

## Development Setup

1. Install Rust by following the instructions at [https://www.rust-lang.org/tools/install](https://www.rust-lang.org/tools/install)

2. Clone this repository and navigate to the project folder:

```bash
git clone <repository-url>
cd texting-client
```

3. Install dependencies:

```bash
npm install
```

4. Start the development server:

```bash
npm run tauri dev
```

## Build for Production

To build the app for production:

```bash
npm run tauri build
```

The packaged app will be available in the `src-tauri/target/release/bundle` directory.

## Technical Details

- **Frontend**: React with TypeScript and Tailwind CSS
- **Backend**: Rust with Tauri framework
- **Database Access**: Using rusqlite to read from the iMessage SQLite database

## Permissions

This app requires read access to your iMessage database located at `~/Library/Messages/chat.db`. The app does not modify your messages or send any data over the internet.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
