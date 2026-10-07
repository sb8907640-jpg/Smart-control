/**
 * Canonical Smart Control feature contract.
 * This file records the product's declared capability matrix.
 * Runtime/device verification remains a separate gate.
 */
const FEATURES = [
  { id: 1, key: "LOCATION", icon: "📍", name: "Location", description: "Live location share", offline: true, online: true },
  { id: 2, key: "NOTIFICATIONS", icon: "🔔", name: "Notifications", description: "Read notifications", offline: true, online: true },
  { id: 3, key: "BATTERY_NETWORK", icon: "🔋", name: "Battery & Network", description: "Battery/network info", offline: true, online: true },
  { id: 4, key: "CAMERA", icon: "📷", name: "Camera", description: "Camera access", offline: true, online: true },
  { id: 5, key: "MICROPHONE", icon: "🎤", name: "Microphone", description: "Mic access", offline: true, online: true },
  { id: 6, key: "GALLERY", icon: "🖼️", name: "Gallery", description: "Access photos/videos", offline: true, online: true },
  { id: 7, key: "SCREEN_SHARE", icon: "🖥️", name: "Screen Share", description: "Share your screen", offline: false, online: true },
  { id: 8, key: "SCREEN_RECORDING", icon: "⏺️", name: "Screen Recording", description: "Record your screen", offline: true, online: true },
  { id: 9, key: "TOUCH_CONTROL", icon: "👆", name: "Touch Control", description: "Touch your screen", offline: "P2P", online: true },
  { id: 10, key: "KEYBOARD_INPUT", icon: "⌨️", name: "Keyboard Input", description: "Type on your device", offline: "P2P", online: true },
  { id: 11, key: "APP_INSTALL_UNINSTALL", icon: "📦", name: "App Install / Uninstall", description: "Install/uninstall apps", offline: "QUEUE", online: true },
  { id: 12, key: "FILE_TRANSFER", icon: "📤", name: "File Transfer", description: "Send and receive files", offline: true, online: true },
  { id: 13, key: "CLIPBOARD_SYNC", icon: "📋", name: "Clipboard Sync", description: "Sync clipboard text", offline: true, online: true },
  { id: 14, key: "FILES_ACCESS", icon: "📁", name: "Files Access", description: "Access files/folders", offline: true, online: true },
  { id: 15, key: "CONTACTS", icon: "👥", name: "Contacts", description: "View contacts", offline: true, online: true },
  { id: 16, key: "SMS", icon: "💬", name: "SMS", description: "View SMS (read-only)", offline: true, online: true },
  { id: 17, key: "CALL_LOGS", icon: "📞", name: "Call Logs", description: "View call history", offline: true, online: true },
  { id: 18, key: "APP_USAGE", icon: "📱", name: "App Usage", description: "See which apps used", offline: true, online: true },
  { id: 19, key: "SOS_ALERTS", icon: "🆘", name: "SOS Alerts", description: "Emergency SOS alerts", offline: true, online: true }
];

const MODES = {
  CONTROLLER: ["Code generate", "devices manage", "consents", "full control"],
  CLIENT: ["Code enter", "permissions allow/deny", "STOP button"]
};

const PLATFORMS = [
  ["Android", "Kotlin + Jetpack Compose + Hilt"],
  ["iOS", "Swift + SwiftUI + Combine"],
  ["Web", "Next.js 14 + TypeScript + Tailwind"],
  ["Desktop", "Electron (Windows/Mac/Linux)"],
  ["Backend", "Node.js + Express + PostgreSQL"]
];

const APP_VARIANTS = [
  ["Owner App", "~80 MB", "Full control (Android/iOS)"],
  ["Receiver Lite", "≤8 MB", "Only permissions (3 screens)"],
  ["Receiver Full", "~80 MB", "Optional upgrade"],
  ["Desktop Agent", "~60 MB", "Electron controller + clients"]
];

const ROLES = [
  ["Super Admin", "Full system"],
  ["Owner", "Plans + settings + Free access grant"],
  ["Admin", "Limited edit"],
  ["Finance Admin", "EMI + payments"],
  ["Legal Admin", "Legal templates"],
  ["Moderator", "User management"],
  ["Support", "Read-only + tickets"],
  ["User", "Normal"]
];

const ONLINE_COUNT = FEATURES.filter(f => f.online === true).length;
const OFFLINE_COUNT = FEATURES.filter(f => f.offline === true || f.offline === "P2P" || f.offline === "QUEUE").length;

module.exports = { FEATURES, MODES, PLATFORMS, APP_VARIANTS, ROLES, ONLINE_COUNT, OFFLINE_COUNT };
