import http from 'node:http';
import { AddressInfo } from 'node:net';

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
