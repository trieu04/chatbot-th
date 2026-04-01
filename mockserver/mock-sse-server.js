import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const rootDir = path.dirname(currentFilePath);
const defaultSseFilePath = path.join(rootDir, 'sse.txt');
const defaultEventDelayMs = 80;

function splitSseBlocks(body) {
  const normalized = body.replace(/\r\n/g, '\n');
  return normalized
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `${block}\n\n`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockSseServer({
  sseFilePath = defaultSseFilePath,
  eventDelayMs = defaultEventDelayMs,
} = {}) {
  return http.createServer(async (request, response) => {
    try {
      const body = await readFile(sseFilePath, 'utf8');
      const blocks = splitSseBlocks(body);
      let clientClosed = false;

      request.on('close', () => {
        clientClosed = true;
      });

      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      for (let index = 0; index < blocks.length; index += 1) {
        if (clientClosed) {
          return;
        }

        response.write(blocks[index]);

        if (index < blocks.length - 1) {
          await wait(eventDelayMs);
        }
      }

      response.end();
    } catch {
      response.writeHead(500, {
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end('Failed to read SSE file');
    }
  });
}

async function main() {
  const port = Number(process.env.PORT || 3001);
  const server = createMockSseServer();

  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`Mock SSE server listening on http://localhost:${port}/sse`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
