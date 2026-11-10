const { readFile, readdir, writeFile } = require("node:fs/promises");
const path = require("node:path");

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const dataDir = path.join(rootDir, "data");
  const monthlyDir = path.join(dataDir, "events");
  const checkOnly = process.argv.includes("--check");

  const monthlyNames = (await readdir(monthlyDir))
    .filter((name) => /^\d{4}-\d{2}\.json$/.test(name))
    .sort();

  if (!monthlyNames.length) {
    throw new Error("data/events に月別JSONがありません");
  }

  const events = [];
  const ids = new Set();

  for (const name of monthlyNames) {
    const filePath = path.join(monthlyDir, name);
    const monthlyEvents = JSON.parse(await readFile(filePath, "utf8"));
    if (!Array.isArray(monthlyEvents)) throw new Error(`${name} は配列ではありません`);

    for (const event of monthlyEvents) {
      if (!event || typeof event.id !== "string" || !event.id) {
        throw new Error(`${name} にIDのないイベントがあります`);
      }
      if (ids.has(event.id)) throw new Error(`イベントIDが重複しています: ${event.id}`);
      ids.add(event.id);
      events.push(event);
    }
  }

  const indexData = {
    files: monthlyNames.map((name) => `events/${name}`),
  };
  const outputs = [
    [path.join(dataDir, "events-index.json"), `${JSON.stringify(indexData, null, 2)}\n`],
    [path.join(dataDir, "events.json"), `${JSON.stringify(events, null, 2)}\n`],
  ];

  if (checkOnly) {
    const mismatches = [];
    for (const [filePath, expected] of outputs) {
      const actual = await readFile(filePath, "utf8");
      if (actual !== expected) mismatches.push(path.relative(rootDir, filePath));
    }
    if (mismatches.length) {
      throw new Error(`月別JSONと同期していません: ${mismatches.join(", ")}\nnpm run data:sync を実行してください`);
    }
    console.log(`データ同期確認OK: ${monthlyNames.length}ファイル / ${events.length}イベント`);
  } else {
    await Promise.all(outputs.map(([filePath, content]) => writeFile(filePath, content)));
    console.log(`データ同期完了: ${monthlyNames.length}ファイル / ${events.length}イベント`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
