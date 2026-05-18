# Security Notes

Ardex is local-first. Default daemon binding is `127.0.0.1`.

## Controls

- Dashboard mutations require local daemon host.
- Dashboard mutations with an `Origin` header must match daemon origin.
- JSON body size limit is 64 KB.
- Evidence summaries and payload strings redact common API keys, tokens, passwords, and private keys before storage.
- Artifact image previews are limited to the project root and the configured Codex `generated_images` directory.
- `ardex init` writes a backup at `$HOME/.codex/hooks.json.ardex-backup` before merging hook config.
- Hook scripts use `ARDEX_BIN` only as a command path, not a shell string.

## Operator Notes

- Do not expose the daemon to a non-local interface unless an auth layer is added.
- Treat `~/.ardex/ardex.db` as sensitive. It may contain task context, command summaries, artifact paths, and user answers.
- Keep screenshots and artifact files out of public repos unless reviewed.
