import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function filterOutDebugEvents(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const endsWithBlankLine = normalized.endsWith('\n\n');
  const blocks = normalized.split(/\n\n+/);

  const keptBlocks = blocks.filter((block) => {
    const firstLine = block.split('\n', 1)[0]?.trim();
    return firstLine !== 'event: debug' && block.trim() !== '';
  });

  const output = keptBlocks.join('\n\n');
  return endsWithBlankLine && output ? `${output}\n\n` : output;
}

async function main() {
  const inputArg = process.argv[2] ?? 'sse.txt';
  const outputArg = process.argv[3];

  const inputPath = path.resolve(inputArg);
  const parsed = path.parse(inputPath);
  const outputPath = outputArg
    ? path.resolve(outputArg)
    : path.join(parsed.dir, `${parsed.name}.cleaned${parsed.ext || '.txt'}`);

  const content = await readFile(inputPath, 'utf8');
  const cleaned = filterOutDebugEvents(content);

  await writeFile(outputPath, cleaned, 'utf8');
  console.log(`Wrote cleaned SSE to ${outputPath}`);
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
