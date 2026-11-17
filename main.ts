// 台積電 2330 式 Token Launch Radar
// 由 AI 代理程式生成，針對 make.fun token-radar-01 競賽
//
// 這個版本增加了中文註解，讓提交者更容易理解模型邏輯。
// 模型基於 DefiLlama 封存快照，計算每個預令代幣協議的隱含價值。
//
// 執行方式：
//   mkdir -p out
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** 文字上限（參考/閘門.json）：文字上限形塑bytes，其餘拒絕。 */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** 從參數取得 --name 值，若無則用預設。 */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: 找不到快照 ${inputFile}: 請提供 --input <snapshot.json|目錄> 或掛載 /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: 模型產出的看板被閘門拒絕：${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** 複製一個目錄的常規檔案到目標，跳過以點開頭的檔名。 */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ 只有 ${shots.length} 張圖片：需要 3 張，分別為看板、細節、過濾後視圖\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}：檔名只能有字母、數字和 . _ -，長度 1 到 128 字元\n`);
    process.exit(1);
  }
}

// dossier 最後寫入：評分器從 /output 重新建構，並比較 bytes。
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} 個協議，${snapshot.watchlist.length} 個在看盤列表，${board.length} 個評分後 (${radar.early_size} 早期，${radar.live_size} 現貨)\n` +
    `token radar: 寫入 ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 檔), ${join(out, 'screenshots')} (${shots.length} 張圖) 與 ${join(out, 'dossier.json')}\n`,
);
