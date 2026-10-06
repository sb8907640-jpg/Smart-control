# Smart Control Desktop

Electron shell for the Smart Control web application.

Security defaults:
- context isolation enabled
- Node integration disabled
- sandbox enabled
- renderer permission requests denied by default
- no hidden device-control APIs exposed to the renderer

Set SMARTCONTROL_WEB_URL to the deployed Next.js application URL before launching. The desktop client does not bypass operating-system permissions or browser/user consent.
