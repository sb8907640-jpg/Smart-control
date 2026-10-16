const fs = require("node:fs");
const path = require("node:path");

const sourcePath = path.join(__dirname, "../app/src/main/java/com/smartcontrol/data/media/WebRtcMediaEngine.kt");
const source = fs.readFileSync(sourcePath, "utf8");

function method(name, nextMarker) {
  const start = source.indexOf(name);
  const end = source.indexOf(nextMarker, start + name.length);
  if (start < 0 || end < 0) throw new Error("Could not locate WebRTC capture method: " + name);
  return source.slice(start, end);
}

const camera = method("private fun createCameraTrack(", "private fun createScreenTrack(");
const screen = method("private fun createScreenTrack(", "data class CapturedVideo");
const checks = [
  ["Camera source allocation is inside guarded cleanup scope", camera.indexOf("try {") >= 0 && camera.indexOf("try {") < camera.indexOf("factory.createVideoSource(")],
  ["Camera helper allocation is inside guarded cleanup scope", camera.indexOf("try {") >= 0 && camera.indexOf("try {") < camera.indexOf("SurfaceTextureHelper.create(")],
  ["Camera failure disposes partial capturer/source/helper/track", ["capturer.dispose()", "source?.dispose()", "helper?.dispose()", "track?.dispose()"].every(value => camera.includes(value))],
  ["Screen source allocation is inside guarded cleanup scope", screen.indexOf("try {") >= 0 && screen.indexOf("try {") < screen.indexOf("factory.createVideoSource(")],
  ["Screen helper allocation is inside guarded cleanup scope", screen.indexOf("try {") >= 0 && screen.indexOf("try {") < screen.indexOf("SurfaceTextureHelper.create(")],
  ["Screen failure disposes partial capturer/source/helper/track", ["capturer.dispose()", "source?.dispose()", "helper?.dispose()", "track?.dispose()"].every(value => screen.includes(value))],
  ["Successful capture close disposes track and native capture resources", [camera, screen].every(value => ["createdTrack.dispose()", "capturer.stopCapture()", "createdHelper.dispose()", "createdSource.dispose()"].every(token => value.includes(token)))]
];
for (const [name, passed] of checks) console.log((passed ? "PASS " : "FAIL ") + name);
if (checks.some(([, passed]) => !passed)) {
  console.error("WEBRTC_CAPTURE_CLEANUP_VERIFY=FAILED");
  process.exit(1);
}
console.log("WEBRTC_CAPTURE_CLEANUP_VERIFY=STATIC_PASS");
