# 自動テストと更新手順

Node.js 22で検証。基本チェックはNode標準の `node:test` を使い、`npm install` は不要。
ブラウザテストは任意の既存Playwright / Chrome環境を使う。依存パッケージやブラウザは本リポジトリに追加していない。

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
| `npm run test:browser` | 実DOM、クリック・検索・保存・解除、表示回帰、幅1280/390/375/320pxのレイアウト・44px操作領域 |

テストはJSONを書き換えない。`data:sync` は生成物を書き換えるため自動では呼ばない。
データ更新時は月別JSONを編集し、既存の `npm run data:sync` で生成物を更新してからチェックする。
同期のPASSだけで出演者や表示の正しさが保証されるわけではないため、`npm test` も実行する。

## GitHub Actions（PRの自動チェック・ゼロコスト設計）

`.github/workflows/pr-check.yml` は、`main` 宛てPRの作成・コミット追加・再オープン・Draft解除時に `npm run check` を実行する。
GitHub標準の `ubuntu-24.04` runner と Node.js 22を使用する。追加の `npm install`、ブラウザのダウンロード、成果物アップロード、キャッシュ保存は行わない。
権限は `contents: read` のみ、チェックアウト後にGitHub認証情報を残さない。更新が続いた同じPRの古い実行はキャンセルする。
`npm run test:browser` はCIに含めず、Playwrightを使用できる環境で別途確認する。

**費用上の前提と停止条件**：GitHub公式の現行ルールで、Publicリポジトリの標準GitHub-hosted runnerは無料。ジョブに `github.event.repository.private == false` を設定し、Privateになった場合はランナーを起動しない（チェックはSKIPPEDでありPASSではない）。
大型の有料ランナー、成果物・キャッシュ保存、外部の有料CIは導入しない。
リポジトリの公開状態、課金規約、ワークフローの変更時には再確認すること。GitHub Actionsが無効・承認待ち・環境エラー等で実行されなかった場合もPASS扱いにはしない。
参考：[GitHub Actionsの課金](https://docs.github.com/en/billing/concepts/product-billing/github-actions)、[ランナーの種類](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job)。

## ブラウザテスト

Playwrightとそのブラウザがすでに使える環境なら以下で実行する。

```sh
npm run test:browser
```

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

- 実機iPhone / Safari / VoiceOver、指での操作、クリップボード、コード復元の確定操作は未検証。
- コンテナ幅・操作領域の検査は完全なアクセシビリティ適合、すべての重なり、画像比較を保証しない。画像の基準比較は導入していない。
- 10/30の人数は依頼の検証値、URL・時刻は既存データと表示ガイドが基準。公式香盤全順序や販売可否を外部ページで再確認していない。
- テスト用の簡易DOMは描画出力の確認用。CSS・イベント配線はブラウザテストが担当する。
- GitHub ActionsではPRごとに `npm run check` を実行。ブラウザテストと実機確認は別途実施。
- HTMLのCSS読み込みは `style.css?v=20261024-1`。ブラウザテストでも読み込み先のバージョンを確認する。今後CSSを更新した際は公開前にバージョンも更新する。
