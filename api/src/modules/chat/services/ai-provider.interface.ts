export interface AiMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface Citation {
  chuong?: number;
  dieu?: number;
  khoan?: number;
  phu_luc?: number;
  noi_dung_da_su_dung?: string;
  start_char: number;
  end_char: number;
  resource_type?: string;
  resource_content?: string;
}

export interface AiResponse {
  content: string;
  tokenCount: number;
}

export type AiStreamChunk =
  | { type: "text"; text: string }
  | { type: "trace"; trace: string };

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

export abstract class AiProvider {
  abstract generateResponse(
    messages: AiMessage[],
    streaming?: boolean,
    role?: string,
  ): Promise<AiResponse | AiStreamResponse>;

  abstract countTokens(text: string): number;
}
