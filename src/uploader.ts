import { Buffer } from 'node:buffer';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { URL } from 'node:url';
import * as vscode from 'vscode';
import osName from 'os-name';
import { EventQueue } from './queue';
import { IActivityEvent } from './tracker';
import { TokenManager } from './token';
import { getConfig, getEffectiveProxyUrl, redactUrlForLogging } from './config';

export interface UploadResponse {
  success: boolean;
  statusCode: number;
  retryAfterSeconds?: number;
  error?: string;
}

export interface IBackendClient {
  uploadEvents(events: IActivityEvent[], token: string): Promise<UploadResponse>;
  fetchStats(token: string, minutes: number): Promise<{ minutes: number }>;
}

export class HttpBackendClient implements IBackendClient {
  private readonly outputChannel?: vscode.OutputChannel;

  constructor(outputChannel?: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  private getUserAgent(): string {
    return `Gridly Client/0.1.0 (${osName()}; VSCode ${vscode.version || '1.99.0'})`;
  }

  public async uploadEvents(events: IActivityEvent[], token: string): Promise<UploadResponse> {
    if (events.length === 0) {
      return { success: true, statusCode: 200 };
    }

    const config = getConfig();
    const endpoint = '/v3/users/event-log';

    // The reference server accepts both single event object or list.
    // For single event: sends the object directly; for batch: maps payload to standard format.
    const payload = events.length === 1 ? this.mapEventForServer(events[0]) : events.map(this.mapEventForServer);

    try {
      const serverUrl = config.serverEntrypoint || config.supabaseUrl || 'http://localhost:54321';
      const res = await this.rawRequest('POST', endpoint, token, payload, serverUrl);
      return {
        success: res.statusCode >= 200 && res.statusCode < 300,
        statusCode: res.statusCode,
        retryAfterSeconds: res.retryAfterSeconds,
      };
    } catch (err: unknown) {
      const errorObj = err as { statusCode?: number; retryAfterSeconds?: number; message?: string };
      return {
        success: false,
        statusCode: errorObj.statusCode || 0,
        retryAfterSeconds: errorObj.retryAfterSeconds,
        error: errorObj.message || String(err),
      };
    }
  }

  public async fetchStats(token: string, minutes: number): Promise<{ minutes: number }> {
    const config = getConfig();
    const endpoint = `/v3/users/self/minutes?minutes=${minutes}`;
    const serverUrl = config.serverEntrypoint || config.supabaseUrl || 'http://localhost:54321';
    const res = await this.rawRequest('GET', endpoint, token, undefined, serverUrl);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const parsed = JSON.parse(res.body);
      return { minutes: Number(parsed.minutes ?? 0) };
    }
    const err = new Error(`Failed to fetch stats: HTTP ${res.statusCode}`) as Error & { statusCode: number };
    err.statusCode = res.statusCode;
    throw err;
  }

  private mapEventForServer(e: IActivityEvent) {
    return {
      id: e.id,
      project: e.project,
      language: e.language,
      relativeFile: e.file,
      absoluteFile: e.absoluteFile,
      editor: e.editor,
      platform: e.platform,
      platformArch: e.platformArch,
      eventTime: e.timestamp,
      eventType: e.operationType,
      gitBranch: e.gitBranch,
      gitOrigin: e.gitOrigin,
      operationType: e.operationType === 'save' || e.operationType === 'write' ? 'write' : 'read',
    };
  }

  private rawRequest(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    serverUrl = getConfig().serverEntrypoint || getConfig().supabaseUrl || 'http://localhost:54321'
  ): Promise<{ statusCode: number; body: string; retryAfterSeconds?: number }> {
    const targetUrl = new URL(path, serverUrl);
    const proxy = getEffectiveProxyUrl();
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const isHttpsTarget = targetUrl.protocol === 'https:';
    const targetPort = Number(targetUrl.port) || (isHttpsTarget ? 443 : 80);

    const baseHeaders: Record<string, string> = {
      'User-Agent': this.getUserAgent(),
      'Authorization': `Bearer ${token}`,
    };
    if (payload) {
      baseHeaders['Content-Type'] = 'application/json';
      baseHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    return new Promise((resolve, reject) => {
      if (this.outputChannel) {
        this.outputChannel.appendLine(`[Req] ${method} ${path} proxy=${proxy ? redactUrlForLogging(proxy) : 'none'}`);
      }

      const parseRetryAfter = (val?: string | string[]): number | undefined => {
        if (!val) {
          return undefined;
        }
        const s = Array.isArray(val) ? val[0] : val;
        const num = Number.parseInt(s, 10);
        return Number.isNaN(num) ? undefined : num;
      };

      if (!proxy) {
        const lib = isHttpsTarget ? https : http;
        const req = lib.request(
          {
            method,
            hostname: targetUrl.hostname,
            port: targetPort,
            path: targetUrl.pathname + targetUrl.search,
            timeout: 20_000,
            headers: baseHeaders,
          },
          (res: http.IncomingMessage) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
              const resBody = Buffer.concat(chunks).toString('utf8');
              const statusCode = res.statusCode || 0;
              const retryAfter = parseRetryAfter(res.headers['retry-after']);
              resolve({ statusCode, body: resBody, retryAfterSeconds: retryAfter });
            });
          }
        );

        req.on('error', (e) => reject(e));
        req.on('timeout', () => req.destroy(new Error('Request timeout')));
        if (payload) {
          req.write(payload);
        }
        req.end();
        return;
      }

      // Proxy handling: HTTP absolute request or HTTPS CONNECT tunnel
      let proxyUrlParsed: URL;
      try {
        proxyUrlParsed = new URL(proxy);
      } catch {
        reject(new Error(`Invalid proxy URL: ${proxy}`));
        return;
      }

      const isHttpsProxy = proxyUrlParsed.protocol === 'https:';
      const proxyPort = Number(proxyUrlParsed.port) || (isHttpsProxy ? 443 : 80);
      const proxyHost = proxyUrlParsed.hostname;
      const targetAuthority = `${targetUrl.hostname}:${targetPort}`;

      const socket: net.Socket | tls.TLSSocket = isHttpsProxy
        ? tls.connect({ host: proxyHost, port: proxyPort, servername: proxyHost })
        : net.connect(proxyPort, proxyHost);

      socket.setTimeout(20_000, () => {
        socket.destroy();
        reject(new Error('Proxy connection timeout'));
      });

      socket.on('error', (e) => reject(e));

      const writeDataAndFinish = (s: net.Socket | tls.TLSSocket, requestLine: string) => {
        const lines = [
          requestLine,
          `Host: ${targetUrl.host}`,
          ...Object.entries(baseHeaders).map(([k, v]) => `${k}: ${v}`),
          'Connection: close',
          '',
          payload || '',
        ];
        s.write(lines.join('\r\n'));

        const chunks: Buffer[] = [];
        s.on('data', (c: Buffer) => chunks.push(c));
        s.on('end', () => {
          s.destroy();
          const fullRes = Buffer.concat(chunks).toString('utf8');
          const headerEnd = fullRes.indexOf('\r\n\r\n');
          if (headerEnd === -1) {
            reject(new Error('Malformed HTTP response'));
            return;
          }
          const headerPart = fullRes.slice(0, headerEnd);
          const bodyPart = fullRes.slice(headerEnd + 4);
          const statusMatch = headerPart.split('\r\n')[0].match(/^HTTP\/\d\.\d (\d{3})/);
          const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
          resolve({ statusCode, body: bodyPart });
        });
      };

      socket.on('connect', () => {
        if (!isHttpsTarget) {
          writeDataAndFinish(socket, `${method} ${targetUrl.toString()} HTTP/1.1`);
        } else {
          // Send CONNECT tunnel request
          const connectReq = [`CONNECT ${targetAuthority} HTTP/1.1`, `Host: ${targetAuthority}`, '', ''].join('\r\n');
          socket.write(connectReq);
          let buf = Buffer.alloc(0);
          const onTunnelData = (chunk: Buffer) => {
            buf = Buffer.concat([buf, chunk]);
            const idx = buf.indexOf('\r\n\r\n');
            if (idx === -1) {
              return;
            }
            socket.removeListener('data', onTunnelData);
            const statusLine = buf.slice(0, idx).toString('utf8').split('\r\n')[0];
            if (!statusLine.includes('200')) {
              socket.destroy();
              reject(new Error(`Proxy CONNECT rejected: ${statusLine}`));
              return;
            }
            const tlsSocket = tls.connect({ socket, servername: targetUrl.hostname }, () => {
              writeDataAndFinish(tlsSocket, `${method} ${targetUrl.pathname + targetUrl.search} HTTP/1.1`);
            });
            tlsSocket.on('error', (e) => reject(e));
          };
          socket.on('data', onTunnelData);
        }
      });
    });
  }
}

export const FLUSH_INTERVAL_MS = 60 * 1000;
export const BATCH_THRESHOLD_SIZE = 10;
export const MAX_BATCH_SIZE = 50;
export const MAX_BACKOFF_MS = 5 * 60 * 1000;

export class Uploader {
  private readonly queue: EventQueue;
  private backendClient: IBackendClient;
  private readonly tokenManager: TokenManager;
  private readonly outputChannel?: vscode.OutputChannel;
  private flushTimer?: NodeJS.Timeout;
  private isUploading = false;
  private backoffDelayMs = 0;
  private nextAllowedUploadTime = 0;
  private onFlushSuccessCallback?: () => void;

  constructor(
    queue: EventQueue,
    backendClient: IBackendClient,
    tokenManager: TokenManager,
    outputChannel?: vscode.OutputChannel
  ) {
    this.queue = queue;
    this.backendClient = backendClient;
    this.tokenManager = tokenManager;
    this.outputChannel = outputChannel;
  }

  public setBackendClient(client: IBackendClient): void {
    this.backendClient = client;
  }

  public setOnFlushSuccess(callback: () => void): void {
    this.onFlushSuccessCallback = callback;
  }

  public start(intervalMs = FLUSH_INTERVAL_MS): void {
    this.stop();
    this.flushTimer = setInterval(() => {
      this.flush();
    }, intervalMs);
  }

  public stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  public onEventsAdded(): void {
    if (this.queue.size() >= BATCH_THRESHOLD_SIZE) {
      this.flush();
    }
  }

  public async flush(): Promise<boolean> {
    if (this.isUploading) {
      return false;
    }

    const now = Date.now();
    if (now < this.nextAllowedUploadTime) {
      return false;
    }

    if (!this.tokenManager.hasToken() || this.tokenManager.isInvalid()) {
      return false;
    }

    const batch = this.queue.peek(MAX_BATCH_SIZE);
    if (batch.length === 0) {
      return true;
    }

    this.isUploading = true;
    const token = this.tokenManager.getToken();

    try {
      const result = await this.backendClient.uploadEvents(batch, token);

      if (result.success) {
        // Success: remove batch from queue and reset backoff
        this.queue.remove(batch.map((e) => e.id));
        this.backoffDelayMs = 0;
        this.nextAllowedUploadTime = 0;
        this.tokenManager.markValid();
        if (this.onFlushSuccessCallback) {
          this.onFlushSuccessCallback();
        }
        return true;
      }

      // Handle HTTP status errors
      const status = result.statusCode;
      if (status === 401 || status === 403) {
        // Invalid token: stop uploading, mark token invalid, notify user
        this.tokenManager.markInvalid();
        return false;
      }

      if (status === 429) {
        // Rate limited: honor Retry-After
        const retrySec = result.retryAfterSeconds || 60;
        this.backoffDelayMs = retrySec * 1000;
        this.nextAllowedUploadTime = Date.now() + this.backoffDelayMs;
        if (this.outputChannel) {
          this.outputChannel.appendLine(`[Upload] 429 Rate limited, backing off for ${retrySec}s`);
        }
        return false;
      }

      if (status >= 400 && status < 500) {
        // Unrecoverable client error (e.g. 400 Bad Request): drop batch and log
        if (this.outputChannel) {
          this.outputChannel.appendLine(`[Upload] Client error ${status}, dropping batch of ${batch.length} events`);
        }
        this.queue.remove(batch.map((e) => e.id));
        return false;
      }

      // Server error (5xx) or network failure: exponential backoff with jitter
      this.applyBackoff();
      return false;
    } catch (err: unknown) {
      this.applyBackoff();
      if (this.outputChannel) {
        this.outputChannel.appendLine(`[Upload] Network error: ${err}`);
      }
      return false;
    } finally {
      this.isUploading = false;
    }
  }

  private applyBackoff(): void {
    if (this.backoffDelayMs === 0) {
      this.backoffDelayMs = 2000;
    } else {
      this.backoffDelayMs = Math.min(MAX_BACKOFF_MS, this.backoffDelayMs * 2);
    }
    // Add 10-25% random jitter
    const jitter = Math.floor(this.backoffDelayMs * (0.1 + Math.random() * 0.15));
    const delayWithJitter = this.backoffDelayMs + jitter;
    this.nextAllowedUploadTime = Date.now() + delayWithJitter;
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[Upload] Exponential backoff scheduled in ${delayWithJitter}ms`);
    }
  }

  public getBackoffDelayMs(): number {
    return this.backoffDelayMs;
  }
}
