# SlackCLI

A fast, developer-friendly command-line interface tool for interacting with Slack workspaces. Built with TypeScript and Bun, it enables AI agents, automation tools, and developers to access Slack functionality directly from the terminal.

## Features

- 🔐 **Dual Authentication Support**: Standard Slack tokens (xoxb/xoxp) or browser tokens (xoxd/xoxc)
- 🏢 **Multi-Workspace Management**: Manage multiple Slack workspaces with ease
- 💬 **Conversation Management**: List channels, read messages, send messages
- 🚀 **Fast & Lightweight**: Built with Bun for blazing fast performance
- 🔄 **Auto-Update**: Built-in self-update mechanism
- 🎨 **Beautiful Output**: Colorful, user-friendly terminal output

## Installation

### Pre-built Binaries

#### Linux
```bash
curl -L https://github.com/shaharia-lab/slackcli/releases/latest/download/slackcli-linux -o slackcli
chmod +x slackcli
mkdir -p ~/.local/bin && mv slackcli ~/.local/bin/
```

#### macOS (Intel)
```bash
curl -L https://github.com/shaharia-lab/slackcli/releases/latest/download/slackcli-macos -o slackcli
chmod +x slackcli
mkdir -p ~/.local/bin && mv slackcli ~/.local/bin/
```

#### macOS (Apple Silicon)
```bash
curl -L https://github.com/shaharia-lab/slackcli/releases/latest/download/slackcli-macos-arm64 -o slackcli
chmod +x slackcli
mkdir -p ~/.local/bin && mv slackcli ~/.local/bin/
```

#### Windows
Download `slackcli-windows.exe` from the [latest release](https://github.com/shaharia-lab/slackcli/releases/latest) and add it to your PATH.

### From Source

```bash
# Clone the repository
git clone https://github.com/shaharia-lab/slackcli.git
cd slackcli

# Install dependencies
bun install

# Build binary
bun run build
```

## Authentication

SlackCLI supports two authentication methods:

### 1. Standard Slack App Tokens (Recommended for Production)

Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps) and obtain a bot token (xoxb-*) or user token (xoxp-*).

```bash
slackcli auth login --token=xoxb-YOUR-TOKEN --workspace-name="My Team"
```

### 2. Browser Session Tokens (Quick Setup)

Extract tokens from your browser session. No Slack app creation required!

```bash
# Step 1: Get extraction guide
slackcli auth extract-tokens

# Step 2: Login with extracted tokens
slackcli auth login-browser \
  --xoxd=xoxd-YOUR-TOKEN \
  --xoxc=xoxc-YOUR-TOKEN \
  --workspace-url=https://yourteam.slack.com
```

**How to Extract Browser Tokens:**

1. Open your Slack workspace in a web browser
2. Open Developer Tools (F12)
3. Go to Network tab
4. Send a message or refresh
5. Find a Slack API request
6. Extract:
   - `xoxd` token from Cookie header (d=xoxd-...)
   - `xoxc` token from request payload ("token":"xoxc-...")

## Usage

### Authentication Commands

```bash
# List all authenticated workspaces
slackcli auth list

# Set default workspace
slackcli auth set-default T1234567

# Remove a workspace
slackcli auth remove T1234567

# Logout from all workspaces
slackcli auth logout
```

### Conversation Commands

```bash
# List all conversations
slackcli conversations list

# List only public channels
slackcli conversations list --types=public_channel

# List DMs
slackcli conversations list --types=im

# Read recent messages from a channel
slackcli conversations read C1234567890

# Read a specific thread
slackcli conversations read C1234567890 --thread-ts=1234567890.123456

# Read with custom limit
slackcli conversations read C1234567890 --limit=50

# Get JSON output (includes ts_iso, user_name and permalink per message)
slackcli conversations read C1234567890 --json

# Read a time window without epoch math: ISO date/datetime, durations
# (36h, 7d, 2w) or working days (7wd). Paginates until the window is fully
# covered (unless you pass --limit explicitly), so nothing gets dropped.
slackcli conversations read C1234567890 --json --since 7wd
slackcli conversations read C1234567890 --json --since 2026-07-01

# Write output to a file instead of stdout — recommended for JSON consumed
# by scripts (large outputs piped through shells can get truncated)
slackcli conversations read C1234567890 --json --since 7d --output /tmp/msgs.json
```

Note: Slack's history API returns thread replies only under their parent
message, so `--since` cannot surface a fresh reply whose parent is older
than the window. When that matters, fetch without `--since` (plus
`--include-threads`) and filter client-side on the reply timestamps.

### Message Commands

```bash
# Send message to a channel
slackcli messages send --recipient-id=C1234567890 --message="Hello team!"

# Send DM to a user
slackcli messages send --recipient-id=U9876543210 --message="Hey there!"

# Reply to a thread
slackcli messages send --recipient-id=C1234567890 --thread-ts=1234567890.123456 --message="Great idea!"

# Attach a file (the --message becomes the file's comment)
slackcli messages send --recipient-id=C1234567890 --file=./report.pdf --message="Here's the report"

# Add an emoji reaction to a message
slackcli messages react --channel-id=C1234567890 --timestamp=1234567890.123456 --emoji=thumbsup

# Remove an emoji reaction from a message
slackcli messages unreact --channel-id=C1234567890 --timestamp=1234567890.123456 --emoji=thumbsup
```

> Tip: emoji names are the Slack shortcode without colons (e.g. `thumbsup`, `heart`, `tada`).
> To read the reactions already on a message, use `conversations read` — reactions appear in
> the human-readable output and in the `--json` output.

### File Commands

```bash
# Get a video's transcript — GENERATES it if Slack hasn't yet, then prints it.
# Slack does not auto-transcribe DM/channel videos: until the "Generate
# transcript" button (the files.retranscribe API) is hit, transcription.status
# stays "none" with no transcript. This command triggers it, waits, and prints.
slackcli files transcript --file F0BG53QCYUU
slackcli files transcript --file F0BG53QCYUU --json      # {file_id, status, transcript}

# Resolve the file from a message instead of a file id; for a thread reply,
# pass the parent --thread-ts. Matches the EXACT ts (never a different message).
slackcli files transcript --channel D08PRF1T8BE --ts 1783532497.537739 \
  --thread-ts 1783528413.764109

# Only print an already-generated transcript (don't trigger generation):
slackcli files transcript --file F0BG53QCYUU --no-generate

# Read file content (VTT/text), download a file, or list/batch-download files
slackcli files read --url "<url_private_download>"
slackcli files download --url "<url_private_download>" --output ./out.mp4
slackcli files list --channel C1234567890 --types videos --json
slackcli files download-all --channel C1234567890 --types images --output ./downloads
```

> `--timeout <seconds>` (default 120) bounds how long `transcript` waits for
> Slack to finish. Only videos where `is_transcription_region_supported` is true
> can be transcribed.

### Draft Commands

Drafts require **browser authentication** (xoxd/xoxc). They are created in your
Slack drafts — unsent and visible only to you — so you can review, edit, and send
them from any Slack client.

```bash
# Create a draft in a channel or DM
slackcli drafts create --channel-id=D08PRF1T8BE --text="Draft I'll send later"

# Create the draft as a reply inside a thread — pass the parent message's ts.
# Without --thread-ts the draft lands at the top level of the conversation.
slackcli drafts create --channel-id=D08PRF1T8BE --text="Threaded reply" \
  --thread-ts=1783528413.764109

# List your active drafts (--all also shows sent/deleted ones)
slackcli drafts list
slackcli drafts list --all

# Delete a draft by ID
slackcli drafts delete --draft-id=Dr0BGD4BT941
```

> Threading lives on the draft's destination, mirroring how Slack's own composer
> stores a threaded draft — so the draft opens already scoped to the thread when
> you go to send it.

### Update Commands

```bash
# Check for updates
slackcli update check

# Update to latest version
slackcli update
```

### Multi-Workspace Usage

```bash
# Use specific workspace by ID
slackcli conversations list --workspace=T1234567

# Use specific workspace by name
slackcli conversations list --workspace="My Team"
```

## Configuration

Configuration is stored in `~/.config/slackcli/`:

- `workspaces.json` - Workspace credentials
- `config.json` - User preferences (future)

## Development

### Prerequisites

- Bun v1.0+
- TypeScript 5.x+

### Setup

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev --help

# Build binary
bun run build

# Build for all platforms
bun run build:all

# Type check
bun run type-check
```

### Project Structure

```
slackcli/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── commands/             # Command implementations
│   │   ├── auth.ts
│   │   ├── conversations.ts
│   │   ├── messages.ts
│   │   └── update.ts
│   ├── lib/                  # Core library
│   │   ├── auth.ts
│   │   ├── workspaces.ts
│   │   ├── slack-client.ts
│   │   ├── formatter.ts
│   │   └── updater.ts
│   └── types/                # Type definitions
│       └── index.ts
├── .github/workflows/        # CI/CD
└── dist/                     # Build output
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

### Authentication Issues

**Standard Tokens:**
- Ensure your token has the required OAuth scopes
- Check token validity in your Slack app settings

**Browser Tokens:**
- Tokens expire with your browser session
- Extract fresh tokens if authentication fails
- Verify workspace URL format (https://yourteam.slack.com)

### Permission Errors

If you get permission errors when accessing conversations or sending messages:
- Verify your bot/user has been added to the channel
- Check OAuth scopes include required permissions
- For browser tokens, ensure you have access in the web UI

### Update Issues

If `slackcli update` fails:
- Ensure you have write permissions to the binary location
- Try running with sudo if installed system-wide
- Consider installing to user directory (~/.local/bin) instead

## License

MIT License - see [LICENSE](LICENSE) file for details

## Support

- 🐛 [Report Issues](https://github.com/shaharia-lab/slackcli/issues)
- 💬 [Discussions](https://github.com/shaharia-lab/slackcli/discussions)
- 📧 Email: support@shaharia.com

## Acknowledgments

- Built with [Bun](https://bun.sh)
- Powered by [@slack/web-api](https://slack.dev/node-slack-sdk/)
- Inspired by [gscli](https://github.com/shaharia-lab/gscli)

---

**Made with ❤️ by Shaharia Lab**

