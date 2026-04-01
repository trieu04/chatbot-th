# Mock SSE Server Design

## Goal

Create a minimal standalone Node.js mock server in the repository root that serves Server-Sent Events from the existing `see.txt` file.

## Scope

- Add a standalone script `mock-sse-server.js`
- Serve `GET /sse`
- Read `see.txt` from the repository root
- Return the file contents with SSE response headers
- Add a small automated test for the endpoint behavior

## Out Of Scope

- Streaming events gradually with timers
- Integrating the endpoint into `api/` or `web/`
- Transforming or validating SSE content
- Authentication, CORS configuration, or multi-route behavior beyond a minimal mock

## Recommended Approach

Use Node's built-in `http` module and `fs/promises` so the mock server can run with `node mock-sse-server.js` and does not depend on any project-specific framework or package.

This is the smallest correct solution for a file-backed SSE mock.

## Server Behavior

- Listen on a configurable port, defaulting to `3001`
- Accept `GET /sse`
- Read `see.txt` as UTF-8 text for each request
- Respond with:
  - `Content-Type: text/event-stream; charset=utf-8`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
- Write the file contents to the response unchanged
- End the response immediately after writing the file contents

For all other paths, return `404`.

For file read failures, return `500` with a short plain-text error.

## Structure

Implementation stays in one small file with two exported pieces:

- `createMockSseServer(...)` to support tests
- a direct-run entrypoint so the server can be started from the command line

## Testing

Add a Node test using `node:test` that:

- starts the server on an ephemeral port
- requests `GET /sse`
- verifies status `200`
- verifies the `content-type` contains `text/event-stream`
- verifies the body matches `see.txt`

Add one small negative-path test for `404` on a different route.

## Usage

Run:

```bash
node mock-sse-server.js
```

Then request:

```bash
curl http://localhost:3001/sse
```
