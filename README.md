# Cursor Export

A command-line tool to export chat history and composer data from Cursor IDE.

## Installation

```bash
npm install -g cursor-export
```

Or run directly with npx:

```bash
# Replace <you> with your macOS username

npx cursor-export --workspacePath="/Users/<you>/Library/Application Support/Cursor/User/workspaceStorage"

```

## Usage

```bash
cursor-export [options]

Options:
  -w, --workspacePath  Path to Cursor workspace storage
  -o, --only           Only export workspaces whose name, folder path, or id includes this string (case-insensitive)
  -L, --list           List discovered workspaces (applies --only filter if provided) and exit
  -h, --help           Show help information

Example Output:

Export completed successfully!
Total workspaces processed: 1
Output directory structure:
cursor-export-output/
  ├── html/
  │   └── <workspace_folders>/
  │       └── <timestamp>--<chat_title>.html
  ├── markdown/
  │   └── <workspace_folders>/
  │       └── <timestamp>--<chat_title>.md
  └── json/
      └── <workspace_name>.json
```

Example html file:

![](./images/2025-03-05-15-35-48.png)

## Quick Start

```bash
# Clone the repository
git clone git@github.com:adg29/cursor-export.git
cd cursor-export

# Install dependencies
npm install

# Install globally for local testing
npm install -g .

# Run the tool locally (exports all workspaces by default)
npm run dev

# List workspaces (names, ids, paths)
npm run dev -- --list

# Export a single workspace only
npm run dev -- --only "your-workspace-name-or-id"
```

### Project Structure

- `index.js` - Core functionality for exporting chat history
- `cli.js` - Command line interface implementation
- `index.test.js` - Test suite

### Notes

- Node 14+ required. If you hit a dyld/ICU error with Homebrew’s Node on macOS, use `nvm use 24` and rerun.
- Exports are written to `cursor-export-output/{html,markdown,json}`.

### Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Debugging

To enable debug logs, set the DEBUG environment variable:

```bash
# On Unix-like systems
DEBUG=cursor-export:* npm start

# On Windows
set DEBUG=cursor-export:* && npm start
```

## License

MIT

## Inspired by cursor-chat-browser

[cursor-chat-browser](https://github.com/thomas-pedersen/cursor-chat-browser)
