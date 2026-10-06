/**
 * Master Specification coverage catalog.
 *
 * This is a contract registry, not a claim that every route is deployed.
 * Device-side sensitive operations remain consent-gated and auditable.
 */
const TABLES = [
  "users","roles","permissions","sessions","devices","device_links","auth_tokens","otp_codes","owner_accounts","free_access_grants",
  "connections","pairing_codes","group_links","persistent_links","connection_logs","reconnect_queue",
  "permission_requests","permission_grants","consent_logs","location_data","camera_data","mic_data","gallery_data","screen_data","clipboard_data","notification_data",
  "touch_events","keyboard_events","app_install_logs","file_transfers","clipboard_sync","remote_commands","p2p_sessions","control_logs",
  "files_access","contacts","sms_logs","call_logs","app_usage","data_downloads",
  "plans","subscriptions","payments","emi_schedule","free_grants",
  "sos_alerts","battery_info","network_info","audit_logs",
  "support_tickets","whatsapp_sessions","chat_logs"
];

const API = [
  "POST /api/link/generate","POST /api/link/join","POST /api/link/share","GET /api/link/status","GET /api/link/history","POST /api/connect","POST /api/disconnect","POST /api/reconnect","GET /api/devices","GET /api/devices/:id",
  "GET /api/permissions","GET /api/permissions/:id","POST /api/permissions/request","POST /api/permissions/grant","POST /api/permissions/revoke","POST /api/permissions/allow-all","GET /api/permissions/status","GET /api/permissions/logs","POST /api/consent/save","POST /api/consent/verify","GET /api/consent/history","GET /api/consent/export",
  "POST /api/control/touch","POST /api/control/keyboard","POST /api/control/app/install","POST /api/control/app/uninstall","POST /api/control/file/transfer","POST /api/control/clipboard","GET /api/control/status","GET /api/control/logs","POST /api/control/screen/share","POST /api/control/screen/record","POST /api/control/camera","POST /api/control/mic","GET /api/control/live","GET /api/control/history","POST /api/control/p2p/start","POST /api/control/p2p/stop",
  "GET /api/data/location","GET /api/data/contacts","GET /api/data/sms","GET /api/data/call-logs","GET /api/data/files","GET /api/data/gallery","GET /api/data/app-usage","GET /api/data/battery","POST /api/data/download","POST /api/data/share",
  "POST /api/admin/login","GET /api/admin/users","GET /api/admin/devices","GET /api/admin/plans","GET /api/admin/subscriptions","POST /api/admin/free-access/grant","POST /api/admin/free-access/edit","POST /api/admin/free-access/revoke","GET /api/admin/analytics","GET /api/admin/logs","POST /api/admin/user/ban","POST /api/admin/user/unban","POST /api/admin/system/config","GET /api/admin/support/tickets",
  "GET /api/plans","GET /api/plans/:id","POST /api/subscribe","POST /api/payment/initiate","POST /api/payment/verify","POST /api/emi/apply","GET /api/subscription/status","GET /api/payment/history",
  "POST /api/support/whatsapp/initiate","GET /api/support/whatsapp/status","POST /api/support/ticket/create",
  "POST /api/sos/trigger","POST /api/sos/cancel","GET /api/sos/history","GET /api/system/status","POST /api/system/sync"
];

const SENSITIVE = new Set([
  "POST /api/control/touch","POST /api/control/keyboard","POST /api/control/app/install","POST /api/control/app/uninstall",
  "POST /api/control/camera","POST /api/control/mic","POST /api/control/screen/share","POST /api/control/screen/record",
  "GET /api/data/location","GET /api/data/contacts","GET /api/data/sms","GET /api/data/call-logs","GET /api/data/files","GET /api/data/gallery"
]);

const POLICY = {
  tableCount: TABLES.length,
  apiCount: API.length,
  everySensitiveRouteRequiresActiveConsent: true,
  everyMediaSessionRequiresVisibleSystemConsent: true,
  everyRemoteCommandRequiresApprovedSession: true,
  adminEndpointsRequireAuthenticatedAdminRole: true,
  noHiddenOwnerIdentityOrHiddenCapture: true,
  noPermissionBypass: true
};

if (TABLES.length < 42 || API.length < 60) {
  throw new Error("Master specification catalog is incomplete");
}

module.exports = { TABLES, API, SENSITIVE, POLICY };
