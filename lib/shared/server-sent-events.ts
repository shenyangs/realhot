export interface ServerSentEventMessage {
  event?: string;
  data: string;
}

export function formatServerSentEvent(input: ServerSentEventMessage): string {
  const eventLine = input.event ? `event: ${input.event}\n` : "";
  const dataLines = input.data
    .split(/\n/)
    .map((line) => `data: ${line}`)
    .join("\n");

  return `${eventLine}${dataLines}\n\n`;
}

export async function* parseServerSentEvents(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<ServerSentEventMessage> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const boundaryIndex = buffer.search(/\r?\n\r?\n/);

        if (boundaryIndex === -1) {
          break;
        }

        const rawEvent = buffer.slice(0, boundaryIndex);
        const boundaryLength = buffer.slice(boundaryIndex).startsWith("\r\n\r\n") ? 4 : 2;
        buffer = buffer.slice(boundaryIndex + boundaryLength);

        const parsed = parseRawEvent(rawEvent);

        if (parsed) {
          yield parsed;
        }
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      const parsed = parseRawEvent(buffer);

      if (parsed) {
        yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseRawEvent(rawEvent: string): ServerSentEventMessage | null {
  const lines = rawEvent.split(/\r?\n/);
  let eventName: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event: eventName,
    data: dataLines.join("\n")
  };
}
