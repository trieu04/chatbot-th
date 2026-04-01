import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createMockSseServer } from './mock-sse-server.js';

function normalizeTrailingNewlines(value) {
  return value.replace(/\n+$/g, '');
}

async function startServer(server) {
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function stopServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

test('GET /sse returns see.txt with SSE headers', async () => {
  const expectedBody = await readFile(new URL('./see.txt', import.meta.url), 'utf8');
  const server = createMockSseServer({ eventDelayMs: 0 });

  try {
    const baseUrl = await startServer(server);
    const response = await fetch(`${baseUrl}/sse`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.equal(normalizeTrailingNewlines(body), normalizeTrailingNewlines(expectedBody));
  } finally {
    await stopServer(server);
  }
});

test('GET /sse streams SSE blocks over time', async () => {
  const expectedBody = await readFile(new URL('./see-small.txt', import.meta.url), 'utf8');
  const server = createMockSseServer({
    sseFilePath: new URL('./see-small.txt', import.meta.url),
  });

  try {
    const baseUrl = await startServer(server);
    const start = Date.now();
    const response = await fetch(`${baseUrl}/sse`);
    const body = await response.text();
    const elapsedMs = Date.now() - start;

    assert.equal(normalizeTrailingNewlines(body), normalizeTrailingNewlines(expectedBody));
    assert.ok(elapsedMs >= 550, `expected streamed response to take at least 550ms, got ${elapsedMs}ms`);
  } finally {
    await stopServer(server);
  }
});

test('unknown route returns 404', async () => {
  const server = createMockSseServer();

  try {
    const baseUrl = await startServer(server);
    const response = await fetch(`${baseUrl}/missing`);

    assert.equal(response.status, 404);
  } finally {
    await stopServer(server);
  }
});
