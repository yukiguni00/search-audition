# 開発とテスト

## PR作成前の検証

Node.js 22の最新パッチを使用します。初回とロックファイル変更時には、次の順に準備します。

```sh
npm ci
npx --no-install playwright install --only-shell chromium
```

Linuxでシステム依存も必要な場合は、CIと同じ `npx --no-install playwright install --with-deps --only-shell chromium` を使用します。

PRに含める最終差分で次の2つを順に実行します。各コマンドの終了コードが0であることを確認してから進み、修正後は両方を再実行します。

```sh
npm run check
npm run test:browser
```

PRの報告は成功時は「`npm run check` PASS、`npm run test:browser` PASS」の1行で十分です。失敗時はコマンド・失敗したテスト名（画面幅や公演IDを含む）・期待値と実値の差・判明した原因を記載します。原因が未確定ならその旨を明記し、ログは該当するエラー行だけを添えます。

## 監査の期待値

公式発表の出演者・香盤・進出先・日時や、対象期間の掲載件数は独立した期待値で照合します。掲載データが変わったら、その事実を検証する監査を確認します。画面全体の件数やお気に入りは掲載データとテストの基準日から期待する公演IDを求め、表示と照合します。VMから返った配列の要素をNode側の配列と比較するときは、`Array.from` で取り出してから厳密に比較します。

月別JSONが正本です。変更後は `npm run data:sync` で索引と集約を生成します。MC・出演者・進出結果は別の情報であり、推測で追加しません。出演部未定は個別公演への出演確定として扱いません。

`npm run check` は同期確認とNode標準テスト、`npm run test:browser` はChromiumで検索・URL復元・お気に入り・バックアップ・MC・4画面幅を確認します。ブラウザテストに外部サービスへの接続は不要です。必要な画像は `TEST_SCREENSHOT_DIR` でリポジトリ外へ保存してください。

PRで既存の `Data integrity and Node tests` が成功してからマージします。無料Public標準Ubuntuランナーのみを使用し、Privateではジョブを停止します。キャッシュ・artifact・matrix・有料サービスは使いません。実機Safari・実際のスクリーンリーダー読み上げは別途確認が必要です。
