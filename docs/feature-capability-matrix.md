# Smart Control — 19 Feature Capability Matrix

This document is the declared product capability contract.

| # | Icon | Feature | Description | Offline | Online |
|---|---|---|---|---|---|
| 1 | 📍 | Location | Live location share | ✅ | ✅ |
| 2 | 🔔 | Notifications | Read notifications | ✅ | ✅ |
| 3 | 🔋 | Battery & Network | Battery/network info | ✅ | ✅ |
| 4 | 📷 | Camera | Camera access | ✅ | ✅ |
| 5 | 🎤 | Microphone | Mic access | ✅ | ✅ |
| 6 | 🖼️ | Gallery | Access photos/videos | ✅ | ✅ |
| 7 | 🖥️ | Screen Share | Share your screen | ❌ | ✅ |
| 8 | ⏺️ | Screen Recording | Record your screen | ✅ | ✅ |
| 9 | 👆 | Touch Control | Touch your screen | P2P | ✅ |
| 10 | ⌨️ | Keyboard Input | Type on your device | P2P | ✅ |
| 11 | 📦 | App Install / Uninstall | Install/uninstall apps | Queue | ✅ |
| 12 | 📤 | File Transfer | Send and receive files | ✅ | ✅ |
| 13 | 📋 | Clipboard Sync | Sync clipboard text | ✅ | ✅ |
| 14 | 📁 | Files Access | Access files/folders | ✅ | ✅ |
| 15 | 👥 | Contacts | View contacts | ✅ | ✅ |
| 16 | 💬 | SMS | View SMS (read-only) | ✅ | ✅ |
| 17 | 📞 | Call Logs | View call history | ✅ | ✅ |
| 18 | 📱 | App Usage | See which apps used | ✅ | ✅ |
| 19 | 🆘 | SOS Alerts | Emergency SOS alerts | ✅ | ✅ |

## Mode contract

- **Controller:** code generation, device management, consent management, full control after required approval.
- **Client:** code entry/opening, permission Allow/Deny choices, STOP control.

## Platform contract

- Android — Kotlin + Jetpack Compose + Hilt
- iOS — Swift + SwiftUI + Combine
- Web — Next.js 14 + TypeScript + Tailwind
- Desktop — Electron (Windows/Mac/Linux)
- Backend — Node.js + Express + PostgreSQL

## App variants

- Owner App — ~80 MB — full control (Android/iOS)
- Receiver Lite — ≤8 MB — permissions-focused flow
- Receiver Full — ~80 MB — optional upgrade
- Desktop Agent — ~60 MB — Electron controller + clients

## Roles

1. Super Admin — Full system
2. Owner — Plans, settings, Free Access grant
3. Admin — Limited edit
4. Finance Admin — EMI + payments
5. Legal Admin — Legal templates
6. Moderator — User management
7. Support — Read-only + tickets
8. User — Normal access

## Safety and verification boundary

The matrix is a product/specification contract. It does **not** grant Android/iOS protected permissions and does not bypass user approval, consent, OS security, or session authorization. Physical-device and production tests remain separate verification gates.

Declared totals: **Online 19/19**, **Offline-capable 18/19** (with P2P/Queue counted as offline transport modes).
