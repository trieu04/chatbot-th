# AI4LIFE Stream Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI4LIFE provider stream only short answer tokens in realtime, persist the canonical `final.answer` as assistant content, and save `thread_id` plus tool messages from `final.messages` into assistant metadata.

**Architecture:** Keep the change local to the AI4LIFE boundary and message persistence flow. Extend the provider stream response with a final payload promise so `MessageService` can save canonical final data after the stream finishes without changing the controller streaming contract.

**Tech Stack:** NestJS, TypeScript, Jest, TypeORM-style entities, SSE over `fetch`

---

## File Map

- Modify: `api/src/modules/chat/services/ai-provider.interface.ts`
  - Add types for normalized final payload data returned alongside a stream.
- Modify: `api/src/modules/chat/services/ai4life-ai.provider.ts`
  - Parse `meta`, `token`, `final`, and `done` explicitly.
  - Emit only short token deltas as realtime `text` chunks.
  - Capture final answer and tool metadata for persistence.
- Modify: `api/src/modules/chat/services/message.service.ts`
  - Preserve existing thinking metadata behavior.
  - Save canonical final answer and AI4LIFE metadata after stream completion.
- Modify: `api/src/modules/chat/services/ai4life-ai.provider.spec.ts`
  - Add provider tests for short-token streaming, final-answer persistence source, and final tool metadata extraction.
- Modify: `api/src/modules/chat/services/message.service.spec.ts`
  - Add service tests for persisting final answer and metadata from the provider final payload.

### Task 1: Extend Provider Contract For Final Payload Data

**Files:**
- Modify: `api/src/modules/chat/services/ai-provider.interface.ts`
- Test: `api/src/modules/chat/services/message.service.spec.ts`

- [ ] **Step 1: Write the failing service test for final payload persistence**

Add a new test in `api/src/modules/chat/services/message.service.spec.ts` that proves `MessageService` must prefer the provider final payload over streamed text.

```ts
it("persists final answer and AI4LIFE tool metadata after streaming completes", async () => {
  const save = jest.fn(async (entity) => entity);
  const create = jest.fn((payload) => payload);

  const finalResult = Promise.resolve({
    answer: "Final canonical answer",
    threadId: "thread-1",
    toolMessages: [
      {
        messageId: "tool-1",
        name: "write_todos",
        role: "tool",
        rawType: "tool",
        content: "Updated todo list to [...]",
      },
    ],
  });

  const service = new MessageService(
    {
      create,
      save,
    } as any,
    {} as any,
    {
      generateResponse: jest.fn().mockResolvedValue({
        stream: (async function* () {
          yield { type: "text", text: "Theo " };
          yield { type: "text", text: "tam thoi" };
        })(),
        finalResult,
      }),
      countTokens: jest.fn().mockImplementation((text: string) => text.length),
    } as any,
    {
      getConversationById: jest.fn().mockResolvedValue({ maxTokens: 1000 }),
      getRecentMessagesForContext: jest.fn().mockResolvedValue([]),
      updateConversationTokens: jest.fn().mockResolvedValue(undefined),
    } as any,
  );

  const result = await service.sendMessageStreaming(
    "conversation-1",
    "user-1",
    { content: "Hello" } as any,
  );

  for await (const _chunk of result.stream) {
    // consume stream fully so persistence runs
  }

  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      conversationId: "conversation-1",
      role: MessageRole.ASSISTANT,
      content: "Final canonical answer",
      metadata: {
        stream: {
          provider: "ai4life",
          threadId: "thread-1",
          toolMessages: [
            {
              messageId: "tool-1",
              name: "write_todos",
              role: "tool",
              rawType: "tool",
              content: "Updated todo list to [...]",
            },
          ],
        },
      },
    }),
  );
});
```

- [ ] **Step 2: Run the service test to verify it fails**

Run: `npm test -- --runInBand api/src/modules/chat/services/message.service.spec.ts`

Expected: FAIL because `AiStreamResponse` does not expose `finalResult` and `MessageService` still saves accumulated stream text only.

- [ ] **Step 3: Extend the provider interface with final payload types**

Update `api/src/modules/chat/services/ai-provider.interface.ts` with explicit types for the saved AI4LIFE final data.

```ts
export interface AiToolMessage {
  messageId: string;
  name: string | null;
  role: string;
  rawType: string | null;
  content: string;
}

export interface AiStreamFinalResult {
  answer?: string;
  threadId?: string;
  toolMessages: AiToolMessage[];
}

export interface AiStreamResponse {
  stream: AsyncIterable<AiStreamChunk>;
  totalTokens: number;
  finalResult?: Promise<AiStreamFinalResult | undefined>;
}
```

- [ ] **Step 4: Run the service test again to confirm the interface change alone is not enough**

Run: `npm test -- --runInBand api/src/modules/chat/services/message.service.spec.ts`

Expected: FAIL because `MessageService` still ignores `finalResult`.

- [ ] **Step 5: Commit the contract change**

```bash
git add api/src/modules/chat/services/ai-provider.interface.ts api/src/modules/chat/services/message.service.spec.ts
git commit -m "refactor: add final stream payload contract"
```

### Task 2: Normalize AI4LIFE SSE Events In The Provider

**Files:**
- Modify: `api/src/modules/chat/services/ai4life-ai.provider.ts`
- Test: `api/src/modules/chat/services/ai4life-ai.provider.spec.ts`

- [ ] **Step 1: Write the failing provider tests for short token streaming and final payload capture**

Add the following tests to `api/src/modules/chat/services/ai4life-ai.provider.spec.ts`.

```ts
it("streams only short token deltas and ignores longer token payloads", async () => {
  global.fetch = jest.fn().mockResolvedValue(
    createStreamResponse([
      'event: token\ndata: {"thread_id":"thread-1","delta":"Theo"}\n\n',
      'event: token\ndata: {"thread_id":"thread-1","delta":" Luat"}\n\n',
      'event: token\ndata: {"thread_id":"thread-1","delta":"Updated todo list to [...]"}\n\n',
      'event: final\ndata: {"thread_id":"thread-1","answer":"Theo Luat day la cau tra loi cuoi","messages":[]}\n\n',
    ]) as unknown as Response,
  );

  const provider = new Ai4lifeAiProvider({
    get: jest.fn().mockReturnValue("http://example.test"),
  } as unknown as ConfigService);

  const chunks = await collectStreamTexts(provider);

  expect(chunks).toEqual([
    { type: "text", text: "Theo" },
    { type: "text", text: " Luat" },
  ]);
});

it("returns final.answer in non-streaming mode when upstream sends final payload", async () => {
  global.fetch = jest.fn().mockResolvedValue(
    createStreamResponse([
      'event: token\ndata: {"thread_id":"thread-1","delta":"Theo"}\n\n',
      'event: final\ndata: {"thread_id":"thread-1","answer":"Final canonical answer","messages":[]}\n\n',
    ]) as unknown as Response,
  );

  const provider = new Ai4lifeAiProvider({
    get: jest.fn().mockReturnValue("http://example.test"),
  } as unknown as ConfigService);

  const result = await provider.generateResponse([
    { role: "user", content: "Hi" },
  ], false);

  expect("content" in result && result.content).toBe("Final canonical answer");
});

it("captures final thread id and tool messages for persistence", async () => {
  global.fetch = jest.fn().mockResolvedValue(
    createStreamResponse([
      'event: meta\ndata: {"thread_id":"thread-1"}\n\n',
      'event: token\ndata: {"thread_id":"thread-1","delta":"Theo"}\n\n',
      'event: final\ndata: {"thread_id":"thread-1","answer":"Final canonical answer","messages":[{"role":"tool","content":"Updated todo list to [...]","message_id":"tool-1","name":"write_todos","raw_type":"tool"},{"role":"assistant","content":"Final canonical answer","message_id":"assistant-1","name":null,"raw_type":"ai"}]}\n\n',
    ]) as unknown as Response,
  );

  const provider = new Ai4lifeAiProvider({
    get: jest.fn().mockReturnValue("http://example.test"),
  } as unknown as ConfigService);

  const result = await provider.generateResponse([
    { role: "user", content: "Hi" },
  ], true);

  if (!("stream" in result)) {
    throw new Error("Expected streaming response");
  }

  for await (const _chunk of result.stream) {
    // fully consume stream
  }

  await expect(result.finalResult).resolves.toEqual({
    answer: "Final canonical answer",
    threadId: "thread-1",
    toolMessages: [
      {
        messageId: "tool-1",
        name: "write_todos",
        role: "tool",
        rawType: "tool",
        content: "Updated todo list to [...]",
      },
    ],
  });
});
```

- [ ] **Step 2: Run the provider spec to verify it fails**

Run: `npm test -- --runInBand api/src/modules/chat/services/ai4life-ai.provider.spec.ts`

Expected: FAIL because the provider still emits long token payloads, does not prefer `final.answer`, and does not expose normalized `finalResult`.

- [ ] **Step 3: Implement minimal provider normalization and final payload capture**

Update `api/src/modules/chat/services/ai4life-ai.provider.ts` with a minimal AI4LIFE-specific normalization path.

Key implementation pieces:

```ts
interface Ai4lifeFinalPayload {
  thread_id?: unknown;
  answer?: unknown;
  messages?: Array<{
    role?: unknown;
    content?: unknown;
    message_id?: unknown;
    name?: unknown;
    raw_type?: unknown;
  }>;
}

private normalizeToolMessages(messages: Ai4lifeFinalPayload["messages"]): AiToolMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message?.raw_type === "tool" || message?.role === "tool")
    .map((message) => ({
      messageId: typeof message?.message_id === "string" ? message.message_id : "",
      name: typeof message?.name === "string" ? message.name : null,
      role: typeof message?.role === "string" ? message.role : "tool",
      rawType: typeof message?.raw_type === "string" ? message.raw_type : null,
      content: typeof message?.content === "string" ? message.content : "",
    }))
    .filter((message) => message.messageId || message.content);
}
```

```ts
const finalState: AiStreamFinalResult = {
  toolMessages: [],
};

if (message.event === "meta") {
  const payload = this.parseStreamPayload(message.data);
  if (typeof payload?.thread_id === "string") {
    finalState.threadId = payload.thread_id;
  }
  return { shouldStop: false, chunks: [], fullText: "" };
}

if (message.event === "token") {
  const payload = this.parseStreamPayload(message.data);
  const delta = typeof payload?.delta === "string" ? payload.delta : "";

  if (delta && delta.length <= 10) {
    return {
      shouldStop: false,
      chunks: [{ type: "text", text: delta }],
      fullText: delta,
    };
  }

  return { shouldStop: false, chunks: [], fullText: "" };
}

if (message.event === "final") {
  const payload = this.parseFinalPayload(message.data);
  if (typeof payload?.thread_id === "string") {
    finalState.threadId = payload.thread_id;
  }
  if (typeof payload?.answer === "string") {
    finalState.answer = payload.answer;
  }
  finalState.toolMessages = this.normalizeToolMessages(payload?.messages);

  return {
    shouldStop: true,
    chunks: [],
    fullText: typeof payload?.answer === "string" ? payload.answer : "",
  };
}
```

Return `finalResult: Promise.resolve(finalState)` from `generateStreamingResponse`, but only after the internal stream has finished populating it. Use a deferred promise if needed:

```ts
let resolveFinalResult: (value: AiStreamFinalResult | undefined) => void;
const finalResult = new Promise<AiStreamFinalResult | undefined>((resolve) => {
  resolveFinalResult = resolve;
});
```

Resolve it in the streaming generator `finally` block after all messages are processed.

- [ ] **Step 4: Run the provider spec to verify it passes**

Run: `npm test -- --runInBand api/src/modules/chat/services/ai4life-ai.provider.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit the provider normalization**

```bash
git add api/src/modules/chat/services/ai4life-ai.provider.ts api/src/modules/chat/services/ai4life-ai.provider.spec.ts
git commit -m "refactor: normalize ai4life stream payloads"
```

### Task 3: Persist Canonical Final Answer And Tool Metadata

**Files:**
- Modify: `api/src/modules/chat/services/message.service.ts`
- Modify: `api/src/modules/chat/services/message.service.spec.ts`

- [ ] **Step 1: Add the failing assertions for merged metadata behavior**

Extend `api/src/modules/chat/services/message.service.spec.ts` so the existing thinking test still proves traces are preserved, while the new AI4LIFE final-result test proves stream metadata is merged correctly.

Expected saved metadata shape:

```ts
{
  thinking: [
    "Routing: analyzing intent",
    "Retrieval: searching references",
  ],
  stream: {
    provider: "ai4life",
    threadId: "thread-1",
    toolMessages: [
      {
        messageId: "tool-1",
        name: "write_todos",
        role: "tool",
        rawType: "tool",
        content: "Updated todo list to [...]",
      },
    ],
  },
}
```

- [ ] **Step 2: Run the service spec to verify it fails**

Run: `npm test -- --runInBand api/src/modules/chat/services/message.service.spec.ts`

Expected: FAIL because `wrapStreamWithSave` still saves only accumulated text plus thinking metadata.

- [ ] **Step 3: Implement final-result-aware save logic in `MessageService`**

Update `api/src/modules/chat/services/message.service.ts` with a small metadata merge helper and a final-result-aware save path.

```ts
function mergeAssistantMetadata(
  metadata: Record<string, unknown> | undefined,
  thinking: string[],
  finalResult?: AiStreamFinalResult,
): Record<string, unknown> | undefined {
  const withThinking = mergeThinkingMetadata(metadata, thinking);

  if (!finalResult?.threadId && (!finalResult?.toolMessages || finalResult.toolMessages.length === 0)) {
    return withThinking;
  }

  return {
    ...(withThinking ?? {}),
    stream: {
      provider: "ai4life",
      ...(finalResult.threadId ? { threadId: finalResult.threadId } : {}),
      toolMessages: finalResult.toolMessages,
    },
  };
}
```

```ts
private async* wrapStreamWithSave(
  stream: AsyncIterable<AiStreamChunk>,
  conversationId: string,
  finalResultPromise?: Promise<AiStreamFinalResult | undefined>,
): AsyncIterable<AiStreamChunk> {
  let fullContent = "";
  const thinkingSteps: string[] = [];

  for await (const chunk of stream) {
    if (chunk.type === "text") {
      fullContent += chunk.text;
    } else if (chunk.type === "trace") {
      const nextTrace = chunk.trace.trim();
      if (nextTrace && thinkingSteps.at(-1) !== nextTrace) {
        thinkingSteps.push(nextTrace);
      }
    }

    yield chunk;
  }

  const finalResult = await finalResultPromise;
  const contentToSave = finalResult?.answer || fullContent;
  const tokenCount = this.aiService.countTokens(contentToSave);

  const assistantMessage = this.messageRepository.create({
    conversationId,
    role: MessageRole.ASSISTANT,
    content: contentToSave,
    tokenCount,
    metadata: mergeAssistantMetadata(undefined, thinkingSteps, finalResult),
  });

  await this.messageRepository.save(assistantMessage);
  await this.chatService.updateConversationTokens(conversationId);
}
```

Pass `aiResponse.finalResult` into both `sendMessageStreaming(...)` and `sendFirstMessageStreaming(...)`.

- [ ] **Step 4: Run the service spec to verify it passes**

Run: `npm test -- --runInBand api/src/modules/chat/services/message.service.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit the service persistence update**

```bash
git add api/src/modules/chat/services/message.service.ts api/src/modules/chat/services/message.service.spec.ts
git commit -m "feat: persist ai4life final metadata"
```

### Task 4: Verify The End State

**Files:**
- Modify: none
- Test: `api/src/modules/chat/services/ai4life-ai.provider.spec.ts`
- Test: `api/src/modules/chat/services/message.service.spec.ts`

- [ ] **Step 1: Run both focused specs together**

Run: `npm test -- --runInBand api/src/modules/chat/services/ai4life-ai.provider.spec.ts api/src/modules/chat/services/message.service.spec.ts`

Expected: PASS

- [ ] **Step 2: Run the chat streaming contract spec as a regression check**

Run: `npm test -- --runInBand api/src/modules/chat/controllers/streaming-contract.spec.ts`

Expected: PASS, confirming controller SSE output remains unchanged and still emits only serialized stream chunks.

- [ ] **Step 3: Review git diff before handoff**

Run: `git diff -- api/src/modules/chat/services/ai-provider.interface.ts api/src/modules/chat/services/ai4life-ai.provider.ts api/src/modules/chat/services/ai4life-ai.provider.spec.ts api/src/modules/chat/services/message.service.ts api/src/modules/chat/services/message.service.spec.ts`

Expected: only the planned provider contract, normalization, persistence, and test changes are present.

- [ ] **Step 4: Commit the verification checkpoint if needed**

```bash
git add api/src/modules/chat/services/ai-provider.interface.ts api/src/modules/chat/services/ai4life-ai.provider.ts api/src/modules/chat/services/ai4life-ai.provider.spec.ts api/src/modules/chat/services/message.service.ts api/src/modules/chat/services/message.service.spec.ts
git commit -m "test: verify ai4life stream normalization"
```

## Self-Review

- Spec coverage: covered token filtering, final answer canonical persistence, thread id persistence, tool message persistence, and focused regression tests.
- Placeholder scan: no TBD/TODO markers or vague “handle later” steps remain.
- Type consistency: the same names are used throughout the plan: `AiToolMessage`, `AiStreamFinalResult`, `finalResult`, `threadId`, and `toolMessages`.
