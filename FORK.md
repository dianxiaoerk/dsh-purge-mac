# dsh-purge-mac — 本仓库的改动说明

这是 [`kingcharleslzy-ai/dsh-purge`](https://github.com/kingcharleslzy-ai/dsh-purge) 的 fork，只做一件事：
**让「官方客户端换包之后自动把补丁打回去」在 macOS 上真的能跑**。

上游那套判定是为 Windows 写的（安装器用 `wscript` 写一个 marker 文件）。macOS 走 Squirrel/ShipIt
整包替换，没有任何人写那个 marker，所以上游在 mac 上永远不会触发重打，官方一更新就静默跑回原版。

## 改了哪四处

| # | 位置 | 上游行为 | 本 fork |
|---|---|---|---|
| 1 | `lib/official-update.js` `harnessExeName()` | 只认 `.exe` 结尾的 Windows 可执行名 | 额外认 macOS 的 `DeepSeek Harness` / `deepseek-harness`（无扩展名） |
| 2 | `lib/official-update.js` `resourcesDirFor()` | 拼 `<exe 目录>/resources` | macOS 拼 `Foo.app/Contents/Resources`（大写 R），Windows 保持原样 |
| 3 | `lib/official-update.js` `macUpgradeReason()` 等 | 无 | 用 handoff 记录里现成的 `archive_reappeared` 相位 + 新 `app.asar` 的 sha256 判定「官方换包了」，并把修过的摘要记到 `<DSH_HOME>/dsh-purge/mac-archive-sha256.json`，同一份 asar 不重复修 |
| 4 | `lib/index.js` `settleInstalledPatches()` | 升级重打排在 `autoApplyOnStart` 与「密封包」两道门之后，mac 上必然被拦 | 把升级自救提到两道门之前；修完记账新摘要，再走原有的重启调度 |

上游的 Windows 路径完全保留：marker 存在时行为与原来一致。

## 已知边界

- 只处理「已经用 asar handoff 解过包」的机器。首次解包仍然要点一次「应用」（上游设计如此）。
- 判定依赖 `app.asar.purge-handoff.json`。手工删掉它，就等于关掉自动重打。
- 修完之后的第一次重启由插件自己调度；不想重启就把日志里的 `official upgrade reapplied` 当作已修。

## 同步上游

```bash
git fetch upstream
git merge upstream/master      # 改动集中在两个文件，冲突面很小
node --test test/mac-upgrade-detect.test.mjs
```

插件自带的更新检查通过 `lib/community.js` 的 `REPOSITORY` 指向本 fork，所以不会出现「点一次更新就把
mac 补丁换回上游版本」这种情况；上游的版本变化靠上面的 `git merge` 手动跟进。

## 构建与安装

```bash
npm install
npm pack                        # 产出 dsh-purge-community-<version>.tgz
shasum -a 256 dsh-purge-community-<version>.tgz
```

桌面 profile 归 Electron 独占，命令行 `dsh plugin --profile desktop add` 会被拒；装法是用宿主内的
插件管理器 `install_bundle` 指向这个 tgz 的 `file:` 路径，然后重启宿主。

## 许可

与上游一致，MIT。原作者署名与版权见 `NOTICE.md`、`README.md` 的「原项目与作者」章节。
本 fork 不是官方发行，也不代表原作者或上游社区。
