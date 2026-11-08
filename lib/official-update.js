import { removeTreeNoFollowSync } from "./remove-tree.js";
// 官方客户端升级后的补丁回写标记。wscript 字面量给重启脚本用。
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import fsDirect from "node:fs";
import { hostFs as fs } from "./extract-asar.js";
import { readMacAsarHandoff } from "./macos-asar-handoff.js";

const MARKER_NAME = "dsh-purge-reapply-asar";
const MAC_SEEN_NAME = "mac-archive-sha256.json";

function harnessExeName(exe) {
  const base = path.basename(String(exe || "")).toLowerCase();
  if (base === "deepseek harness.exe" || base === "deepseek-harness.exe") return true;
  // macOS 的 bundle 可执行文件没有扩展名：Contents/MacOS/DeepSeek Harness。
  return (
    process.platform === "darwin" &&
    (base === "deepseek harness" || base === "deepseek-harness")
  );
}

/** Windows 是 <安装根>/resources；macOS 是 Foo.app/Contents/Resources。 */
export function resourcesDirFor(exe) {
  const exeDir = path.dirname(path.normalize(String(exe || "")));
  if (!exeDir) return "";
  return process.platform === "darwin"
    ? path.join(path.dirname(exeDir), "Resources")
    : path.join(exeDir, "resources");
}

export function upgradeMarkerPath(exe) {
  if (!harnessExeName(exe)) return "";
  return path.join(resourcesDirFor(exe), MARKER_NAME);
}

export function upgradeMarkerExists(exe) {
  const marker = upgradeMarkerPath(exe);
  return Boolean(marker && fs.existsSync(marker));
}

export function clearUpgradeMarker(exe) {
  const marker = upgradeMarkerPath(exe);
  if (!marker) return;
  try { fs.rmSync(marker, { force: true }); } catch { /* 下次启动再试 */ }
}

export function clearStaleExtractedApps(exe) {
  if (!harnessExeName(exe)) return;
  const resources = resourcesDirFor(exe);
  if (!resources) return;
  let names = [];
  try { names = fs.readdirSync(resources); } catch { return; }
  for (const name of names) {
    if (!name.startsWith("app.dshpurge-prev")) continue;
    try { removeTreeNoFollowSync(path.join(resources, name), { fs }); } catch { /* 旧目录删不掉不影响新版本 */ }
  }
}

/* ── macOS：没有安装器写 marker，改用「app.asar 又出现、且不是上次修过的那份」判定官方换包 ── */

function macSeenPath(dshHome) {
  const home = dshHome || path.join(os.homedir(), ".dsh");
  return path.join(home, "dsh-purge", MAC_SEEN_NAME);
}

export function macArchiveDigest(asar) {
  try {
    return createHash("sha256").update(fsDirect.readFileSync(asar)).digest("hex");
  } catch {
    return "";
  }
}

export function readMacArchiveSeen(dshHome) {
  try {
    const parsed = JSON.parse(fsDirect.readFileSync(macSeenPath(dshHome), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberMacArchive(dshHome, digest) {
  const fp = macSeenPath(dshHome);
  try {
    fsDirect.mkdirSync(path.dirname(fp), { recursive: true });
    fsDirect.writeFileSync(
      fp,
      JSON.stringify({ sha256: String(digest || ""), at: new Date().toISOString() }, null, 2) + "\n",
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 官方换包后的判定（macOS）。"" = 没有待修，否则返回原因串。
 * 复用 handoff 记录里现成的 archive_reappeared 相位，再用归档摘要去重，
 * 避免修好之后每次启动都重打一遍。
 */
export function macUpgradeReason(asar, dshHome) {
  if (process.platform !== "darwin" || !asar) return "";
  try {
    if (!fsDirect.existsSync(asar)) return "";
    const state = readMacAsarHandoff(asar);
    if (!state || state.phase !== "archive_reappeared") return "";
    const digest = macArchiveDigest(asar);
    if (!digest) return "";
    return readMacArchiveSeen(dshHome).sha256 === digest ? "" : "mac:archive_reappeared";
  } catch {
    return "";
  }
}

/** Windows Script Host 无 BOM 时按系统 ANSI 读文件。中文路径写成 \uXXXX，整份脚本保持 ASCII。 */
export function wshLiteral(value) {
  return JSON.stringify(String(value ?? "")).replace(/[\u007f-\uffff]/g, (ch) => {
    return "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
  });
}

export function isWshAscii(source) {
  const text = String(source || "");
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}
