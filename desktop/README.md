# Smart Control Desktop

Electron shell for the Smart Control web application.

## Endpoint configuration

Set these environment variables when packaging:
- `SMARTCONTROL_WEB_URL`: deployed Next.js application URL (HTTPS only; no embedded credentials, query, or fragment).
- `SMARTCONTROL_API_BASE_URL`: backend API origin (HTTPS only; no path, query, or fragment).

The build script validates these public URLs and embeds them in a generated `src/build-config.json`. No service credentials are embedded. The checked-in template is empty; production readiness remains blocked until the real URLs are configured in GitHub Actions variables/secrets. At runtime, environment values can override the packaged values.

## Security defaults

- context isolation enabled
- Node integration disabled
- sandbox enabled
- main window navigation pinned to the configured HTTPS origin
- camera/microphone and notifications allowed only for the configured app origin
- screen capture requires a native screen/window selection; no source is auto-selected
- OAuth popups are restricted to HTTPS and use isolated, sandboxed renderer settings
- no hidden device-control APIs exposed to the renderer

The desktop client does not bypass operating-system permissions or browser/user consent.
