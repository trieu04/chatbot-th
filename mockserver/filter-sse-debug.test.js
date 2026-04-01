import test from 'node:test';
import assert from 'node:assert/strict';

import { filterOutDebugEvents } from './filter-sse-debug.js';

test('removes debug SSE blocks and preserves other events', () => {
  const input = [
    'event: meta',
    'data: {"ok":true}',
    '',
    'event: debug',
    'data: {"hidden":true}',
    '',
    'event: message',
    'data: {"text":"hello"}',
    '',
  ].join('\n');

  const output = filterOutDebugEvents(input);

  assert.equal(
    output,
    [
      'event: meta',
      'data: {"ok":true}',
      '',
      'event: message',
      'data: {"text":"hello"}',
      '',
    ].join('\n'),
  );
});

test('removes consecutive debug SSE blocks', () => {
  const input = [
    'event: debug',
    'data: {"a":1}',
    '',
    'event: debug',
    'data: {"b":2}',
    '',
    'event: done',
    'data: [DONE]',
    '',
  ].join('\n');

  const output = filterOutDebugEvents(input);

  assert.equal(
    output,
    [
      'event: done',
      'data: [DONE]',
      '',
    ].join('\n'),
  );
});
