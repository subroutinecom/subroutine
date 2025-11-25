/**
 * Adapter to make Web Standard Response compatible with Node.js HTTP ServerResponse
 * The MCP SDK expects Node.js-style response objects
 */
export class NodeResponseAdapter {
  private _statusCode = 200;
  private _statusMessage = "";
  private headers: Record<string, string> = {};
  private chunks: Uint8Array[] = [];
  private _writableEnded = false;
  private _headersSent = false;
  private eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

  writeHead(
    statusCode: number,
    statusMessageOrHeaders?: string | Record<string, string | string[]>,
    headers?: Record<string, string | string[]>
  ): this {
    this._statusCode = statusCode;

    if (typeof statusMessageOrHeaders === "string") {
      this._statusMessage = statusMessageOrHeaders;
      if (headers) {
        this._assignHeaders(headers);
      }
    } else if (statusMessageOrHeaders) {
      this._assignHeaders(statusMessageOrHeaders);
    }

    this._headersSent = true;
    return this;
  }

  private _assignHeaders(headers: Record<string, string | string[]>): void {
    for (const [name, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        this.headers[name] = value.join(", ");
      } else {
        this.headers[name] = value;
      }
    }
  }

  setHeader(name: string, value: string | string[]): this {
    if (Array.isArray(value)) {
      this.headers[name] = value.join(", ");
    } else {
      this.headers[name] = value;
    }
    return this;
  }

  getHeader(name: string): string | undefined {
    return this.headers[name];
  }

  getHeaders(): Record<string, string> {
    return { ...this.headers };
  }

  hasHeader(name: string): boolean {
    return name in this.headers;
  }

  removeHeader(name: string): void {
    delete this.headers[name];
  }

  write(chunk: string | Uint8Array, _encoding?: string): boolean {
    if (typeof chunk === "string") {
      this.chunks.push(new TextEncoder().encode(chunk));
    } else {
      this.chunks.push(chunk);
    }
    return true;
  }

  end(chunk?: string | Uint8Array | (() => void), encoding?: string, callback?: () => void): void {
    if (typeof chunk === "function") {
      callback = chunk;
      chunk = undefined;
    } else if (typeof encoding === "function") {
      callback = encoding;
      encoding = undefined;
    }

    if (chunk) {
      this.write(chunk as string | Uint8Array, encoding);
    }
    this._writableEnded = true;

    if (callback) {
      callback();
    }

    // Emit 'close' to signal completion to listeners
    const handlers = this.eventHandlers["close"] ?? [];
    for (const handler of handlers) {
      handler();
    }
  }

  toResponse(): Response {
    const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }

    return new Response(body.length > 0 ? body : null, {
      status: this._statusCode,
      statusText: this._statusMessage,
      headers: this.headers,
    });
  }

  getBodyText(): string {
    try {
      const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const body = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of this.chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
      return new TextDecoder().decode(body);
    } catch (_e) {
      return "";
    }
  }

  get writableEnded(): boolean {
    return this._writableEnded;
  }

  get headersSent(): boolean {
    return this._headersSent;
  }

  get statusCode(): number {
    return this._statusCode;
  }

  set statusCode(code: number) {
    this._statusCode = code;
  }

  // Minimal EventEmitter-like API expected by MCP SDK
  on(event: string, handler: (...args: unknown[]) => void): this {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
    return this;
  }

  once(event: string, handler: (...args: unknown[]) => void): this {
    // For our usage, once behaves same as on; SDK typically listens for 'close'
    return this.on(event, handler);
  }

  removeListener(event: string, handler: (...args: unknown[]) => void): this {
    const arr = this.eventHandlers[event];
    if (arr) {
      this.eventHandlers[event] = arr.filter((h) => h !== handler);
    }
    return this;
  }

  flushHeaders(): void {
    // No-op in fetch Response world; present for compatibility
  }
}
