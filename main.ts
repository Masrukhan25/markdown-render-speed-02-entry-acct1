import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from './parse.js';

const inputDir = process.env.MAKEFUN_INPUT_DIR || '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const cases = JSON.parse(await readFile(join(inputDir, 'cases.json'), 'utf8'));
// Preserve input ordering and keep each rendering independent.
const html = cases.map((item: { id: string; markdown: string }) => parse(item.markdown));
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, 'html.json'), JSON.stringify(html));
