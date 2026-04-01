# AI4LIFE Stream Normalization Design

## Goal

Refactor the AI4LIFE provider integration so that chat streaming and persistence handle the provider's SSE payloads correctly.

The current integration incorrectly treats many streamed `token` payloads as user-visible answer text. In practice, the AI4LIFE stream includes:

- `meta` events with identifiers such as `thread_id`
- `token` events with small answer fragments
- `token` events containing tool output, todo updates, and debug text
- `final` events containing the canonical `answer` and a structured `messages` array
- `done` events marking stream completion

The updated behavior must keep realtime answer streaming usable while ensuring the database stores the canonical final answer and preserves tool/todo details for post-stream display.

## Constraints

- Keep the change minimal and local to the AI4LIFE integration boundary when possible.
- Do not rely on heuristics to extract tool/todo content from free-form text when the structured `final` payload already provides it.
- Realtime stream output should remain simple for the existing chat UI.
- Tool and todo information only needs to be shown after streaming completes.

## Recommended Approach

Implement the normalization directly inside `api/src/modules/chat/services/ai4life-ai.provider.ts` and extend the message save path in `message.service.ts` to use final payload metadata.

This is preferred over introducing a new parser abstraction because the AI4LIFE-specific handling is currently limited to a single provider and the required behavior is straightforward.

## Streaming Behavior

### Token Events

For `event: token` payloads:

- Read `delta` when present.
- If `delta` is a string and `delta.length <= 10`, emit it as a `text` stream chunk.
- If `delta.length > 10`, ignore it for realtime streaming.

This temporary rule intentionally filters out most tool/debug/todo payloads, which are typically much longer than actual token fragments.

### Meta Events

For `event: meta` payloads:

- Parse and retain `thread_id`.
- Do not emit the payload as user-visible chat text.
- Preserve `thread_id` for final message metadata.

### Final Events

For `event: final` payloads:

- Parse the full JSON object.
- Read `thread_id`, `answer`, and `messages`.
- Treat `answer` as the canonical final assistant response.
- Treat `messages` as the canonical structured source for tool/todo data.
- Stop stream processing after the final payload is captured.

### Done Events

For `event: done` payloads:

- Treat the stream as complete.
- Do not emit text.

## Persistence Rules

### Message Content

For streaming requests, save assistant content using:

1. `final.answer` when present
2. accumulated streamed text as a fallback only if `final.answer` is missing

For non-streaming requests, return `final.answer` directly.

### Message Metadata

Persist metadata extracted from the final payload in the saved assistant message.

Recommended shape:

```json
{
  "stream": {
    "provider": "ai4life",
    "threadId": "5a16a50c-46bd-4e7b-951c-9a56fc65d7c9",
    "toolMessages": [
      {
        "messageId": "927ab2d1-8ac2-48d3-9a41-e4c89a41d04b",
        "name": "write_todos",
        "role": "tool",
        "rawType": "tool",
        "content": "Updated todo list to [...]"
      }
    ]
  }
}
```

`toolMessages` should be derived from `final.messages` by keeping entries where either of the following is true:

- `raw_type === "tool"`
- `role === "tool"`

Each stored entry should include only the fields needed for later rendering:

- `messageId`
- `name`
- `role`
- `rawType`
- `content`

This keeps the stored metadata compact while preserving enough information for the client to render tool/todo blocks after streaming completes.

## Client-Facing Behavior

### During Streaming

The client receives only `text` chunks derived from short token fragments.

This keeps the current UI behavior simple and avoids mixing tool/debug output into the assistant text area.

### After Streaming Completes

The saved assistant message includes metadata with `toolMessages` and `threadId`.

The client can use that metadata after the stream finishes or when reloading conversation history to render:

- todo updates, such as `write_todos`
- tool logs, such as `grep`, `task`, or `parent_to_child_tool`

The provider does not need to split todo messages into a separate schema at this stage. The client can differentiate using the stored `name` field.

## Implementation Notes

### Provider Changes

Update `Ai4lifeAiProvider` so that it:

- parses `meta`, `token`, `final`, and `done` events explicitly
- emits realtime text only for short token deltas
- captures final payload fields for both streaming and non-streaming flows
- exposes final payload data needed by the service layer for persistence

### Service Changes

Update the stream save flow in `message.service.ts` so that it accumulates:

- streamed text
- final answer
- final thread id
- final tool messages

When the stream completes, save:

- `content = final.answer || streamedText`
- `metadata.stream.provider = "ai4life"`
- `metadata.stream.threadId = final.thread_id` when present
- `metadata.stream.toolMessages = normalized tool messages from final.messages`

## Testing

Add or update tests to verify:

1. non-streaming requests return `final.answer`
2. streaming requests emit `text` only for short token deltas
3. long token deltas are ignored during streaming
4. streaming persistence prefers `final.answer` over accumulated token text
5. tool messages from `final.messages` are persisted into assistant metadata
6. `thread_id` from the final or meta payload is persisted into assistant metadata

## Out of Scope

- emitting dedicated `tool`, `todo`, or `meta` stream chunks to the client during realtime streaming
- advanced heuristics for reconstructing answer text from noisy token streams
- introducing a separate AI4LIFE parser module unless the provider format grows more complex later
