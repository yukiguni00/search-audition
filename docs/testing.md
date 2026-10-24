# 自動テストと更新手順

Node.js 22で検証。基本チェックはNode標準の `node:test` を使い、`npm install` は不要。
ブラウザテストはdevDependencyの `playwright: 1.62.1` を使用し、`package-lock.json` で推移的依存まで固定する。テストランナーは引き続きNode標準の `node:test`。`@playwright/test` は追加せず、ブラウザバイナリをGitへ保存しない。

## コマンドと役割分担

リポジトリのルートで実行する。

```sh
npm run data:check
npm test
npm run check
```

| コマンド | 責務 |
| --- | --- |
| `npm run data:check`（既存） | 月別JSONの配列/ID検証、ID重複、集約JSONと索引の生成結果とのバイト単位一致 |
| `npm test` | 月別・集約・索引の意味的一致、対象月、出演者名の重複、合格区分、既知例外、10/30固有の条件、描画・検索ロジック |
| `npm run check` | `data:check` → `npm test`。前者が失敗したら停止 |
| `npm run test:browser` | 実DOM・表示回帰・保存、4画面幅のレイアウトと44px操作領域、1280/390pxのバックアップ生成・復元と異常系 |

テストはJSONを書き換えない。`data:sync` は生成物を書き換えるため自動では呼ばない。
データ更新時は月別JSONを編集し、既存の `npm run data:sync` で生成物を更新してからチェックする。
同期のPASSだけで出演者や表示の正しさが保証されるわけではないため、`npm test` も実行する。

## GitHub Actions（PRの自動チェック・ゼロコスト設計）

`.github/workflows/pr-check.yml` は、`main` 宛てPRの作成・コミット追加・再オープン・Draft解除時に、既存ジョブ内で以下を順に実行する。

1. GitHub標準 `ubuntu-24.04` runner / Node.js 22を準備。
2. `npm ci` で開発依存をlockfileどおりに導入。
3. `npm run check` でデータ同期とNodeテスト13件を確認。
4. `npx --no-install playwright install --with-deps --only-shell chromium` でChromium headless shellと必要なOSライブラリを導入。Firefox/WebKit・通常のGUI版Chromiumは導入しない。
5. `npm run test:browser` でブラウザテスト45件を実行。

ジョブ名 **`Data integrity and Node tests`** とジョブID `check` を維持する。
既存の有効なRuleset `main-ci-guard` がこのチェック名を必須にしているため、Node・ブラウザのどちらかが失敗すれば同じ必須チェックがFAILとなる。
依存導入・ブラウザ導入の失敗や10分のジョブタイムアウトも成功扱いにしない。`continue-on-error`、テストスキップ、失敗を無視する処理は追加しない。
Ruleset自体の設定変更やマージ操作は行わない。チェック名を変える場合は必須ルールとの不一致に注意すること。

権限は `contents: read` のみ、チェックアウト後にGitHub認証情報を残さない。更新が続いた同じPRの古い実行はキャンセルする。
Actionsキャッシュ、artifact保存、マトリクス、定期実行、デプロイは追加しない。setup-nodeの `package-manager-cache: false` も維持。
ブラウザは `PLAYWRIGHT_BROWSERS_PATH=${{ runner.temp }}/playwright-browsers` の一時領域へ置き、ジョブ終了後に永続化しない。スクリーンショット保存の環境変数もCIでは設定しない。

**費用上の前提と停止条件**：GitHub公式の現行ルールで、Publicリポジトリの標準GitHub-hosted runnerは無料。ジョブに `github.event.repository.private == false` を維持し、Privateになった場合はランナーを起動しない（SKIPPEDであり、テスト済みのPASSではない）。
大型・有料ランナー、課金設定、成果物・キャッシュ保存、外部有料CIは導入しない。
リポジトリの公開状態、課金規約、ワークフローの変更時には再確認すること。Actions無効・承認待ち・通信/環境エラー等もテスト成功と報告しない。
参考：[GitHub Actionsの課金](https://docs.github.com/en/billing/concepts/product-billing/github-actions)、[PlaywrightのCI](https://playwright.dev/docs/ci)、[Chromium headless shell](https://playwright.dev/docs/browsers#chromium-headless-shell)。

## ブラウザテスト

CIと同じバージョンでローカル再現する場合は、Node.js 22で以下を実行する（LinuxではOSライブラリ導入に管理者権限が必要な場合がある）。

```sh
npm ci
npm run check
npx --no-install playwright install --with-deps --only-shell chromium
npm run test:browser
```

`npm run test:browser` の実体は `node --test tests/browser/*.test.cjs`。`npx playwright test` へ置き換えない。
基本の `npm run check` だけなら依存導入は不要。ブラウザテストには上記の依存・ブラウザ導入が必要。
固定版更新時はpackage.jsonとlockfileを一緒に更新し、Chromiumも再導入して両テストを実行する。
推移的依存は `playwright-core: 1.62.1` と、macOSのみのoptional依存 `fsevents: 2.3.2`。Ubuntuではfseventsは導入されない。

別ディレクトリのPlaywrightや既存Chromeを使う場合は指定できる。

```sh
NODE_PATH=/absolute/path/to/existing/node_modules \
BROWSER_EXECUTABLE_PATH='/absolute/path/to/Chrome' \
TEST_SCREENSHOT_DIR=/absolute/path/outside/repository/screenshots \
npm run test:browser
```

`BROWSER_EXECUTABLE_PATH` と `TEST_SCREENSHOT_DIR` は省略可。未指定なら画像保存は行わない。
ブラウザやPlaywrightが使えない場合はエラーで終了するので、「未検証 / ENV BLOCKED」と記録する。自動ダウンロードもPASS扱いもしない。

ローカル127.0.0.1の空きポートでチェックアウトを配信し、各テストで一時ブラウザコンテキストを使用する。
`?noanalytics=1` でアクセス解析を無効化し、ページからの外部通信を遮断する。
FANYやプロフィールの外部ページは開かない。終了時にブラウザ・ローカルサーバーを閉じる。

画像・ログはリポジトリ外へ保存する。`node_modules/`、`test-results/`、`playwright-report/`、`blob-report/`、`coverage/`、`.test-artifacts/` も `.gitignore` で除外する。
`.gitignore` は任意の出力先すべてを保護するものではないため、コミット前に `git status --short` と `git diff --cached --name-only` も確認する。

## テスト構成

- `tests/data.test.cjs`: 月別・集約・索引、ID、各公演/セッション/結果リスト内の名前重複、通常/追加の排他性、合格者の包含関係、既知例外と負のテスト。
- `tests/render.test.cjs`: 本番 `script.js` をVMで直接評価し、最終行の `init()` だけ抑止する。描画・検索関数をコピーせず実際の関数を検証する。
- `tests/browser/ui.test.cjs`: 実DOM・CSS・イベント配線・localStorageを検証。会場フォールバックはテストのHTTP応答だけを加工する。
- `tests/fixtures/known-qualifier-exceptions.json`: 公演ID＋元表記の名前＋合格区分の完全一致で限定する3例外。理由・確認根拠も記録。

日付判定は2026-10-24（JST）に固定し、実行日が進んでも同じ回帰を検証する。
10/30の23/24/23組・計70組・通常53/追加17組は、2026-10-30の2nd公演だけの条件であり、次回公演には適用しない。
会場共通表示・フォールバック、追加ラベル、開場非表示と元時刻保持、発売情報とFANYリンク、検索・お気に入りを検証する。
名前はNFKC、空白、大小文字、波ダッシュ、登録済み改名を考慮する。同じ芸人の別公演・別セッションへの出演は許容する。
空の出演者リストは既存の「未確認」データがあるため包含判定の対象外。非空リストの不一致は限定した既知例外以外FAIL。

レイアウトは横スクロール・主要テキストコンテナの幅・可視button/select/inputの24px最低領域を確認する。
バックアップ入口と「閉じる」は別途縦横44px以上、下線・透明背景、移動前後のクリックと開閉・コード生成も検証する。

## バックアップ・復元のブラウザ回帰テスト

`tests/browser/ui.test.cjs` 内で、1280×844pxと390×844px（後者はタッチ設定あり）で以下を実行する。従来の4画面幅の表示テストも保持する。

- UIの星で2組を登録 → コード生成 → 別の1組に登録を変更 → 生成したコードを入力 → 確認ダイアログを承認 → 元の2組に上書き復元。
- 生成コードを独立したUTF-8/Base64復号で確認し、v:1、favorites、createdAtを検証。入力前後の空白は許容する既存仕様も確認。
- 復元確認を取り消すと、保存内容・お気に入り表示が維持される。
- 重複、全角/半角・大小文字、名前の前後空白を正規化して統合し、空の名前を除外する。
- 有効な `favorites: []` は承認後に0組へ復元する。空の入力コードとは区別する。0組の状態ではコード生成時に既存のエラーを表示する。
- 空文字・空白のみ・非Base64・切れたBase64・Base64内の不正JSON・未対応バージョン・バージョン欠落・favorites欠落・非配列・nullペイロード・配列内の不正な数値/オブジェクトを拒否する。

各ケースを独立したコンテキストで開始し、保存キー `favoritePerformers`、お気に入り欄、検索結果の星、再読み込み後の保持を確認する。
拒否・取消ではlocalStorage全体のスナップショットが一致し、無関係なテスト用キーも維持されることを確認する。
不正コードで確認ダイアログを出さないことも検証。ブラウザ由来のatob/JSON/TypeError文言は固定せず、アプリ独自のエラー文言とエラー表示を検証する。
異常系のコードはNodeのBufferで独立に作成し、アプリのエンコーダーを使って期待値を生成しない。正常系だけは実UIから生成したコードを復元する。

実装のデコーダーにはチェックサム/署名がないため、破損後も有効なv:1形式として解釈できるコードの改変を一律に検知する仕様ではない。このテストはその仕様を変更しない。
本番コード、保存キー、バックアップ形式、出演者JSONは変更しない。

## 架空不一致を拒否する確認

通常の `npm test` は `assert.throws` で未知の不一致が拒否されることも検証し、成功時は終了コード0になる。
独立プロセスで実際の失敗を確認する場合は以下を使う。

```sh
node tests/helpers/unknown-qualifier-probe.cjs
# 期待: 「架空の未登録合格者_TEST_ONLY」を含むエラー、終了コード1
```

これは意図的に失敗するため、通常の成功チェックとは別に実行する。
本番JSONをメモリ上で複製して変更し、ディスクには書き込まない。
例外管理の理由と確認結果は [検証記録](testing-followup.md) を参照。

## 検証の限界

- 実機iPhone / Safari / VoiceOver、指での操作、クリップボードは未検証。コード復元の承認・取消はChromeで検証する。
- コンテナ幅・操作領域の検査は完全なアクセシビリティ適合、すべての重なり、画像比較を保証しない。画像の基準比較は導入していない。
- 10/30の人数は依頼の検証値、URL・時刻は既存データと表示ガイドが基準。公式香盤全順序や販売可否を外部ページで再確認していない。
- テスト用の簡易DOMは描画出力の確認用。CSS・イベント配線はブラウザテストが担当する。
- GitHub Actionsでは両テストを実行するが、Ubuntu/Chromiumの結果は実機iPhone/Safariの動作保証ではない。ネットワーク・npm/CDN・OSライブラリ供給やrunner更新により環境要因で失敗する場合がある。失敗を隠さずログから原因を確認する。
- HTMLのCSS読み込みは `style.css?v=20261024-1`。ブラウザテストでも読み込み先のバージョンを確認する。今後CSSを更新した際は公開前にバージョンも更新する。
