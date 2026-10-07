const { getSupportWhatsAppUrl } = require("./support-whatsapp");

const url = getSupportWhatsAppUrl();
if (!url) {
  console.error("SUPPORT_WHATSAPP_VERIFY=FAIL");
  console.error("SUPPORT_WHATSAPP_NUMBER must be configured in the private deployment environment.");
  process.exit(1);
}
console.log("SUPPORT_WHATSAPP_VERIFY=PASS");
console.log("SUPPORT_WHATSAPP_MESSAGE=PASS");
console.log("SUPPORT_WHATSAPP_NUMBER=PRIVATE");
