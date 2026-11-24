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

## 日常のデータ更新

1. 公式発表を確認し、該当する `data/events/YYYY-MM.json` を更新します。MC・事前香盤・発表結果を区別し、出演部や時刻が未発表なら推測で埋めません。
2. 同じ発表を読み直し、`tests/audit/announcements.json` の `events` に公演IDで期待値を記録します。本番JSONからの自動生成や一括コピーは行いません。公に参照できる発表元はPRに記載します。
3. `npm run data:sync` で索引と集約を生成し、`npm run check`、`npm run test:browser` の順に実行します。PRでは月別・監査・生成差分を確認します。

| 発表 | 監査JSONの更新 |
|---|---|
| 1st合格・追加合格 | 該当IDに `qualifiedPerformers`、必要に応じて `additionalQualifiedPerformers` を記録。進出日が判明したら `qualifiedNextStageDate` を追加します。 |
| アガり！の順位 | `"ranks": [["甲"], ["乙"], ["丙", "丁"]]` のように順位ごとの配列で記録します。最優秀者が出場権を獲得します。 |
| 進出日時の確定 | `schedules` に公表済みの日付・時刻・会場等を1回記録し、対象の順位行の `schedule` から参照します。同じ進出先を共有する場合は同じキーを使います。 |
| 新規公演・新しい月 | 新しい公演IDに `show` を追加し、種別・日付・開演時刻・タイトルをそれぞれ `eventType`、`date`、`time`、`title` に記録します。会場や香盤なども照合対象に加えられます。新規公演は結果の発表前から欠落を検出します。 |

2026年11月24日時点で掲載済みの公演IDと表示シナリオは `tests/fixtures/` に固定しています。日常の追記ではここを編集しません。冬期1st・アガり！の監査行がない公演は未発表として検証し、過去の確定済みオーディション経路は従来の公式資料・チェックサムでも保護します。

実データの全公演・進出カードをChromiumで照合し、過去の特定の検索・お気に入り操作は発表時点の結果を使って再現します。NodeのVMから返った配列やオブジェクトは `assertVMEqual(actual, expected)` で入れ子まで厳密に比較します。

`npm run check` は同期確認とNode標準テスト、`npm run test:browser` はChromiumで検索・URL復元・お気に入り・バックアップ・MC・4画面幅を確認します。ブラウザテストに外部サービスへの接続は不要です。必要な画像は `TEST_SCREENSHOT_DIR` でリポジトリ外へ保存してください。

PRで既存の `Data integrity and Node tests` が成功してからマージします。無料Public標準Ubuntuランナーのみを使用し、Privateではジョブを停止します。キャッシュ・artifact・matrix・有料サービスは使いません。実機Safari・実際のスクリーンリーダー読み上げは別途確認が必要です。
