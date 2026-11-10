# 開発とテスト

Node.js 22を使用します。

```sh
npm ci
npm run check
npx --no-install playwright install --with-deps --only-shell chromium
npm run test:browser
```

月別JSONが正本です。変更後は `npm run data:sync` で索引と集約を生成します。MC・出演者・進出結果は別の情報であり、推測で追加しません。出演部未定は個別公演への出演確定として扱いません。

`npm run check` は同期確認とNode標準テスト、`npm run test:browser` はChromiumで検索・URL復元・お気に入り・バックアップ・MC・4画面幅を確認します。ブラウザテストに外部サービスへの接続は不要です。必要な画像は `TEST_SCREENSHOT_DIR` でリポジトリ外へ保存してください。

PRで既存の `Data integrity and Node tests` が成功してからマージします。無料Public標準Ubuntuランナーのみを使用し、Privateではジョブを停止します。キャッシュ・artifact・matrix・有料サービスは使いません。実機Safari・実際のスクリーンリーダー読み上げは別途確認が必要です。
