---
name: opencli
description: Run OpenCLI commands to interact with websites, Electron apps, and external CLIs via a unified interface. Use when the user wants to explore websites, generate CLI adapters, or run opencli commands.
argument-hint: <command> [options]
allowed-tools: Bash
---

Execute OpenCLI commands. OpenCLI turns any website, Electron app, or local CLI tool into a standardized command-line interface.

## Usage

Run the user's requested opencli command:

```bash
opencli $ARGUMENTS
```

## Available Commands

- `opencli list` — List all available CLI commands
- `opencli explore <url>` — Explore a website: discover APIs, stores, and strategies
- `opencli synthesize <target>` — Synthesize CLIs from explore results
- `opencli generate <url>` — One-shot: explore → synthesize → register
- `opencli cascade <url>` — Strategy cascade: find simplest working strategy
- `opencli install <name>` — Install an external CLI
- `opencli register <name>` — Register an external CLI
- `opencli doctor` — Diagnose browser bridge connectivity
- `opencli setup` — Interactive setup
- `opencli validate [target]` — Validate CLI definitions
- `opencli verify [target]` — Validate + smoke test

## External CLIs (pre-registered)

- `opencli docker [args...]` — Docker CLI
- `opencli gh [args...]` — GitHub CLI
- `opencli kubectl [args...]` — Kubernetes CLI
- `opencli gws [args...]` — Google Workspace CLI

## Output Formats

Most commands support `--format` flag: `table`, `json`, `yaml`, `markdown`, `csv`

## Notes

- If opencli is not installed, run: `cd /tmp/opencli && npm install -g .`
- Browser-based commands require the Chrome extension and browser bridge to be configured via `opencli setup`
