import * as vscode from 'vscode';
import { t } from './i18n';
import { getConfig } from './config';

export const SECRET_STORAGE_TOKEN_KEY = 'gridly.token';
export const LEGACY_SECRET_STORAGE_TOKEN_KEY = 'codetrack.token';

export type TokenValidator = (token: string, serverEntrypoint: string) => Promise<boolean>;

export class TokenManager {
  private cachedToken = '';
  private isTokenInvalid = false;
  private hasShownAuthError = false;
  private readonly secrets: vscode.SecretStorage;
  private readonly customValidator?: TokenValidator;

  constructor(secrets: vscode.SecretStorage, customValidator?: TokenValidator) {
    this.secrets = secrets;
    this.customValidator = customValidator;
  }

  /**
   * Resolves the active token following precedence:
   * 1. Environment variable CODETIME_TOKEN (e.g. GitHub Codespaces)
   * 2. VS Code SecretStorage
   */
  public async resolveToken(): Promise<string> {
    const envToken = process.env.CODETIME_TOKEN ? process.env.CODETIME_TOKEN.trim() : '';
    if (envToken) {
      this.cachedToken = envToken;
      return envToken;
    }

    const secretToken =
      (await this.secrets.get(SECRET_STORAGE_TOKEN_KEY)) ||
      (await this.secrets.get(LEGACY_SECRET_STORAGE_TOKEN_KEY)) ||
      '';
    this.cachedToken = secretToken.trim();
    return this.cachedToken;
  }

  public getToken(): string {
    return this.cachedToken;
  }

  public hasToken(): boolean {
    return this.cachedToken.length > 0;
  }

  public isInvalid(): boolean {
    return this.isTokenInvalid;
  }

  public markValid(): void {
    this.isTokenInvalid = false;
    this.hasShownAuthError = false;
  }

  /**
   * Marks the current token as invalid (e.g. on 401/403),
   * showing an actionable notification only once per invalidation.
   */
  public markInvalid(onStatusUpdate?: () => void): void {
    this.isTokenInvalid = true;
    if (onStatusUpdate) {
      onStatusUpdate();
    }

    if (!this.hasShownAuthError) {
      this.hasShownAuthError = true;
      const enterTokenBtn = t('Enter Token');
      vscode.window
        .showErrorMessage(t('Gridly: Token Invalid'), enterTokenBtn)
        .then((choice) => {
          if (choice === enterTokenBtn) {
            this.promptAndSetToken(onStatusUpdate);
          }
        });
    }
  }

  /**
   * Prompts user for a token via input box, validates it against server,
   * and securely stores it in SecretStorage.
   */
  public async promptAndSetToken(onSuccess?: () => void): Promise<boolean> {
    const input = await vscode.window.showInputBox({
      password: true,
      ignoreFocusOut: true,
      placeHolder: t('Gridly: Input Your Token (from server)'),
      prompt: t('Gridly: Enter Token'),
      validateInput: (val) => {
        if (!val || val.trim().length === 0) {
          return t('Gridly: Cannot Get Token');
        }
        return null;
      },
    });

    if (input === undefined) {
      // User cancelled
      return false;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      vscode.window.showWarningMessage(t('Gridly: Cannot Get Token'));
      return false;
    }

    // Validate token against backend
    const config = getConfig();
    const isValid = await this.validateToken(trimmed, config.serverEntrypoint);
    if (!isValid) {
      vscode.window.showErrorMessage(t('Gridly: Token validation failed'));
      return false;
    }

    await this.secrets.store(SECRET_STORAGE_TOKEN_KEY, trimmed);
    this.cachedToken = trimmed;
    this.markValid();

    vscode.window.showInformationMessage(t('Gridly: Token validation succeeded'));
    if (onSuccess) {
      onSuccess();
    }
    return true;
  }

  /**
   * Validates a token using either the injected validator or standard HTTP request.
   */
  public async validateToken(token: string, serverEntrypoint: string): Promise<boolean> {
    if (!token) {
      return false;
    }

    if (this.customValidator) {
      return this.customValidator(token, serverEntrypoint);
    }

    // Default lightweight authenticated GET validation to /v3/users/self/minutes?minutes=1
    try {
      const url = new URL('/v3/users/self/minutes?minutes=1', serverEntrypoint);
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Gridly Client',
        },
        signal: AbortSignal.timeout(10_000),
      });

      // 2xx indicates success, 401/403 indicates invalid token
      return res.ok;
    } catch {
      // If network fails during initial validation, return false or allow if offline?
      // Strict token validation expects the server to respond successfully.
      return false;
    }
  }

  /**
   * Safe redactor to avoid ever logging secrets.
   */
  public redactToken(): string {
    if (!this.cachedToken) {
      return '(empty)';
    }
    return `***${this.cachedToken.slice(-4)}`;
  }
}
