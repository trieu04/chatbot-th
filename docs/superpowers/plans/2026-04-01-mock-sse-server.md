# Mock SSE Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Node.js mock server that serves the contents of `see.txt` at `GET /sse` using SSE headers.

**Architecture:** Use Node's built-in `http` module for a tiny root-level server and export a `createMockSseServer` helper so the endpoint can be tested without shelling out to a separate process. The server reads `see.txt` per request, returns the file contents unchanged, returns `404` for unknown routes, and returns `500` if reading the file fails.

**Tech Stack:** Node.js built-in `http`, `fs/promises`, `node:test`, `fetch`

---

### Task 1: Add failing tests for the mock SSE endpoint

**Files:**
- Create: `mock-sse-server.test.js`
- Test: `mock-sse-server.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createMockSseServer } from './mock-sse-server.js';

async function startServer(server) {
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test('GET /sse returns see.txt with SSE headers', async () => {
  const expectedBody = await readFile(new URL('./see.txt', import.meta.url), 'utf8');
  const server = createMockSseServer();

  try {
    const baseUrl = await startServer(server);
    const response = await fetch(`${baseUrl}/sse`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.equal(body, expectedBody);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('unknown route returns 404', async () => {
  const server = createMockSseServer();

  try {
    const baseUrl = await startServer(server);
    const response = await fetch(`${baseUrl}/missing`);

    assert.equal(response.status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mock-sse-server.test.js`
Expected: FAIL because `./mock-sse-server.js` does not exist yet.

- [ ] **Step 3: Commit**

```bash
git add mock-sse-server.test.js
git commit -m "test: add mock SSE server coverage"
```

### Task 2: Implement the standalone mock SSE server

**Files:**
- Create: `mock-sse-server.js`
- Modify: `mock-sse-server.test.js`
- Test: `mock-sse-server.test.js`

- [ ] **Step 1: Write minimal implementation**

```js
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSseFilePath = path.join(rootDir, 'see.txt');

export function createMockSseServer({ sseFilePath = defaultSseFilePath } = {}) {
  return http.createServer(async (request, response) => {
    if (request.method !== 'GET' || request.url !== '/sse') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not Found');
      return;
    }

    try {
      const body = await readFile(sseFilePath, 'utf8');

      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      response.end(body);
    } catch {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test mock-sse-server.test.js`
Expected: PASS with 2 passing tests.

- [ ] **Step 3: Commit**

```bash
git add mock-sse-server.js mock-sse-server.test.js
git commit -m "feat: add standalone mock SSE server"
```

### Task 3: Verify direct-run usage

**Files:**
- Modify: `mock-sse-server.js`
- Test: `mock-sse-server.test.js`

- [ ] **Step 1: Start the server manually**

Run: `node mock-sse-server.js`
Expected: Console prints `Mock SSE server listening on http://localhost:3001/sse`

- [ ] **Step 2: Verify the endpoint manually**

Run: `curl http://localhost:3001/sse`
Expected: Output matches the contents of `see.txt`

- [ ] **Step 3: Re-run automated verification**

Run: `node --test mock-sse-server.test.js`
Expected: PASS with 2 passing tests after the manual check.

- [ ] **Step 4: Commit**

```bash
git add mock-sse-server.js mock-sse-server.test.js
git commit -m "chore: verify mock SSE server usage"
```
