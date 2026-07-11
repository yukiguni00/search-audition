# イベントデータの更新方法

`data/events/YYYY-MM.json` がイベントデータの正本です。

月別JSONを追加・更新した後は、公開前に次を実行してください。

```sh
npm run data:sync
npm run data:check
```

`data:sync` は次のファイルを月別JSONから自動生成します。

- `data/events-index.json`
- `data/events.json`（月別JSONを取得できなかった場合のフォールバック）

`data/events.json` と `data/events-index.json` は直接編集しないでください。
