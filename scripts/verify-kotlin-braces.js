const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "app", "src");
const files = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.isFile() && fullPath.endsWith(".kt")) files.push(fullPath);
  }
}

function stripCommentsAndStrings(source) {
  let out = "";
  let state = "code";
  let blockDepth = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1] || "";
    if (state === "code") {
      if (ch === "/" && next === "/") {
        state = "line";
        out += "  ";
        i++;
      } else if (ch === "/" && next === "*") {
        state = "block";
        blockDepth = 1;
        out += "  ";
        i++;
      } else if (ch === '"' && source.slice(i, i + 3) === '"""') {
        state = "raw";
        out += "   ";
        i += 2;
      } else if (ch === '"') {
        state = "string";
        out += " ";
      } else if (ch === "'") {
        state = "char";
        out += " ";
      } else {
        out += ch;
      }
    } else if (state === "line") {
      if (ch === "\n") {
        state = "code";
        out += "\n";
      } else out += " ";
    } else if (state === "block") {
      if (ch === "/" && next === "*") {
        blockDepth++;
        out += "  ";
        i++;
      } else if (ch === "*" && next === "/") {
        blockDepth--;
        out += "  ";
        i++;
        if (blockDepth === 0) state = "code";
      } else out += ch === "\n" ? "\n" : " ";
    } else if (state === "string" || state === "char") {
      if (ch === "\\") {
        out += "  ";
        i++;
      } else if ((state === "string" && ch === '"') || (state === "char" && ch === "'")) {
        state = "code";
        out += " ";
      } else out += ch === "\n" ? "\n" : " ";
    } else if (state === "raw") {
      if (source.slice(i, i + 3) === '"""') {
        state = "code";
        out += "   ";
        i += 2;
      } else out += ch === "\n" ? "\n" : " ";
    }
  }
  return out;
}

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const code = stripCommentsAndStrings(source);
  let depth = 0;
  let badLine = null;
  let line = 1;
  for (const ch of code) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0 && badLine == null) badLine = line;
    }
    if (ch === "\n") line++;
  }
  const ok = depth === 0 && badLine == null;
  console.log((ok ? "PASS " : "FAIL ") + path.relative(root, file) + (ok ? "" : " :: final depth=" + depth + (badLine == null ? "" : ", negative at line " + badLine)));
  if (!ok) failures.push(path.relative(root, file));
}

if (failures.length) {
  console.error("KOTLIN_BRACE_INTEGRITY=FAILED");
  console.error("Files: " + failures.join(", "));
  process.exit(1);
}
console.log("KOTLIN_BRACE_INTEGRITY=STATIC_PASS (" + files.length + " files)");
