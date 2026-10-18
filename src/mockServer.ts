import http from 'node:http';
import { AddressInfo } from 'node:net';
import { calculateHeatmap, calculateProjectStats, calculateLanguageStats, calculateLeaderboard } from './analytics';
import { OperationType } from './tracker';

export interface IMockReceivedEvent {
  id?: string;
  project?: string;
  language?: string;
  relativeFile?: string;
  eventTime?: number;
  operationType?: string;
  [key: string]: unknown;
}

export class MockCodeTrackServer {
  private server?: http.Server;
  private port = 0;
  private simulatedStatus: number | null = null;
  private retryAfterSeconds = 10;
  private mockMinutes = 185; // Default 3h 5m
  private receivedEvents: IMockReceivedEvent[] = [];
  public validToken = 'valid-test-token';

  public setSimulatedStatus(code: number | null, retryAfter = 10): void {
    this.simulatedStatus = code;
    this.retryAfterSeconds = retryAfter;
  }

  public setMockMinutes(minutes: number): void {
    this.mockMinutes = minutes;
  }

  public getReceivedEvents(): IMockReceivedEvent[] {
    return [...this.receivedEvents];
  }

  public clearReceivedEvents(): void {
    this.receivedEvents = [];
  }

  public async start(desiredPort = 0): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const auth = req.headers['authorization'] || '';
        const token = auth.replace(/^Bearer\s+/i, '').trim();

        // Check simulated status
        if (this.simulatedStatus !== null) {
          const status = this.simulatedStatus;
          if (status === 429) {
            res.writeHead(429, {
              'Content-Type': 'application/json',
              'Retry-After': String(this.retryAfterSeconds),
            });
            res.end(JSON.stringify({ error: 'Too Many Requests' }));
            return;
          }
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Simulated HTTP ${status}` }));
          return;
        }

        // Validate token
        if (!token || (this.validToken && token !== this.validToken)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }

        if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/ingest_coding_events') {
          const chunks: Buffer[] = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              const events = body?.p_events;
              if (!Array.isArray(events) || events.length < 1 || events.length > 50) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Expected between 1 and 50 events.' }));
                return;
              }
              if (events.some((event: unknown) => !event || typeof event !== 'object' || Array.isArray(event))) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Each event must be an object.' }));
                return;
              }

              const acceptedEventIds: string[] = [];
              for (const event of events) {
                acceptedEventIds.push(String(event.id));
                this.receivedEvents.push({
                  ...event,
                  eventTime: Date.parse(String(event.event_time || '')) || Date.now(),
                  relativeFile: event.relative_file,
                  operationType: event.operation_type,
                  platformArch: event.platform_arch,
                });
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, statusCode: 200, acceptedEventIds }));
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            }
          });
          return;
        }

        if (req.method === 'POST' && url.pathname === '/v3/users/event-log') {
          const chunks: Buffer[] = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              if (Array.isArray(body)) {
                this.receivedEvents.push(...body);
              } else if (body && typeof body === 'object') {
                this.receivedEvents.push(body);
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, count: this.receivedEvents.length }));
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            }
          });
          return;
        }

        if (req.method === 'GET' && url.pathname === '/v3/users/self/minutes') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ minutes: this.mockMinutes }));
          return;
        }

        if (req.method === 'GET' && url.pathname === '/v3/users/self/heatmap') {
          const events = this.receivedEvents.map((e) => ({
            id: String(e.id || ''),
            timestamp: Number(e.eventTime || Date.now()),
            project: String(e.project || 'Unknown'),
            language: String(e.language || 'plaintext'),
            file: String(e.relativeFile || ''),
            platform: String(e.platform || 'macOS'),
            platformArch: String(e.platformArch || 'arm64'),
            editor: String(e.editor || 'vscode'),
            operationType: (e.operationType || 'write') as OperationType,
          }));
          const summary = calculateHeatmap(events);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(summary));
          return;
        }

        if (req.method === 'GET' && url.pathname === '/v3/users/self/projects') {
          const events = this.receivedEvents.map((e) => ({
            id: String(e.id || ''),
            timestamp: Number(e.eventTime || Date.now()),
            project: String(e.project || 'Unknown'),
            language: String(e.language || 'plaintext'),
            file: String(e.relativeFile || ''),
            platform: String(e.platform || 'macOS'),
            platformArch: String(e.platformArch || 'arm64'),
            editor: String(e.editor || 'vscode'),
            operationType: (e.operationType || 'write') as OperationType,
          }));
          const projects = calculateProjectStats(events);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ projects }));
          return;
        }

        if (req.method === 'GET' && url.pathname === '/v3/users/self/languages') {
          const events = this.receivedEvents.map((e) => ({
            id: String(e.id || ''),
            timestamp: Number(e.eventTime || Date.now()),
            project: String(e.project || 'Unknown'),
            language: String(e.language || 'plaintext'),
            file: String(e.relativeFile || ''),
            platform: String(e.platform || 'macOS'),
            platformArch: String(e.platformArch || 'arm64'),
            editor: String(e.editor || 'vscode'),
            operationType: (e.operationType || 'write') as OperationType,
          }));
          const languages = calculateLanguageStats(events);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ languages }));
          return;
        }

        if (req.method === 'GET' && url.pathname === '/v3/users/leaderboard') {
          const leaderboard = calculateLeaderboard([
            { name: 'You (Active Session)', minutes: this.mockMinutes },
            { name: 'Alex Rivers', minutes: 420 },
            { name: 'Sarah Chen', minutes: 360 },
            { name: 'Elena Rostova', minutes: 295 },
            { name: 'Marcus Vance', minutes: 180 },
          ]);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ leaderboard }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      });

      this.server.listen(desiredPort, '127.0.0.1', () => {
        const addr = this.server?.address() as AddressInfo;
        this.port = addr.port;
        resolve(`http://127.0.0.1:${this.port}`);
      });

      this.server.on('error', (err) => reject(err));
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        this.server = undefined;
        resolve();
      });
    });
  }

  public getPort(): number {
    return this.port;
  }
}
