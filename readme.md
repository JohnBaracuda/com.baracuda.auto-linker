# Smart Autolinker

A no-fuss Obsidian plugin that turns plain-text references to your notes, headings and block IDs into wiki-links automatically.

## Key features

- Live linking while you type (current line only)
- Links trigger after space **or punctuation** (, . ! ? : ;)
- Continues growing the last link if you keep typing a longer matching phrase
- Full-file relink on save
- Vault-wide relink command
- Plural sensitivity (e.g. "Task" <-> "Tasks")
- Skips existing links, code, tables and fenced blocks
- Optional self-link prevention

## Installation

### Community Plugins

1. Open **Settings -> Community Plugins -> Browse** in Obsidian.
2. Search for **Smart Autolinker**.
3. Click **Install** and then **Enable**.

### Manual

Download the latest release from GitHub and copy the unzipped folder into `<vault>/.obsidian/plugins/`, then reload Obsidian.

## Usage

With the plugin enabled, type normally; when you finish a word with a space **or punctuation (, . ! ? : ;)**, the preceding words will auto-link if a matching page, heading or block exists. If you immediately continue typing, the plugin will expand that freshly inserted link to include the new words -- no need to delete and rebuild links.

Existing links and inline code remain untouched.

The command palette offers:

- **Auto-link current file** - relink the active note.
- **Auto-link ALL markdown files** - relink the entire vault.

## Settings

Find all toggles under **Settings -> Smart Autolinker**.

| Option | Description | Default |
| ------ | ----------- | ------- |
| Auto-link on edit | Relink the current line as you type | On |
| Auto-link on file save | Relink the whole note each time you save | Off |
| Prevent self-linking | Skip links that point to the current note | On |

## Minimum requirements

Obsidian 1.5.0 or newer.

## License

MIT
