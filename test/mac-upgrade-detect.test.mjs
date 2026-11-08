// macOS 官方换包判定：marker 只有 Windows 安装器会写，mac 只能看 app.asar 是否带着新摘要回来。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  macArchiveDigest,
  macUpgradeReason,
  rememberMacArchive,
  resourcesDirFor,
  upgradeMarkerPath,
} from "../lib/official-update.js";

const MAC_EXE = "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "purge-mac-upgrade-"));
  const home = path.join(root, "dsh-home");
  const resources = path.join(root, "Fake.app", "Contents", "Resources");
  fs.mkdirSync(resources, { recursive: true });
  const asar = path.join(resources, "app.asar");
  return { root, home, resources, asar };
}

test("marker 路径按 mac 布局解析到 Contents/Resources", () => {
  const got = upgradeMarkerPath(MAC_EXE);
  assert.equal(
    got,
    "/Applications/DeepSeek Harness.app/Contents/Resources/dsh-purge-reapply-asar",
  );
});

test("resourcesDirFor 对 mac exe 指向 Contents/Resources", () => {
  assert.equal(
    resourcesDirFor(MAC_EXE),
    "/Applications/DeepSeek Harness.app/Contents/Resources",
  );
});

test("asar 带着新摘要回来时判定为官方换包，记账后不再重复触发", () => {
  const { home, asar } = fixture();
  fs.writeFileSync(asar, "new-archive-bytes");
  fs.writeFileSync(
    asar + ".purge-handoff.json",
    JSON.stringify({ token: "t", phase: "complete", updated_at: new Date().toISOString() }),
  );

  assert.equal(macUpgradeReason(asar, home), "mac:archive_reappeared");

  const digest = macArchiveDigest(asar);
  assert.ok(digest);
  assert.equal(rememberMacArchive(home, digest), true);
  assert.equal(macUpgradeReason(asar, home), "");
});

test("asar 不存在时不算换包", () => {
  const { home, asar } = fixture();
  fs.writeFileSync(
    asar + ".purge-handoff.json",
    JSON.stringify({ token: "t", phase: "complete" }),
  );
  assert.equal(macUpgradeReason(asar, home), "");
});
