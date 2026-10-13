import { execSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * Computes SHA-256 hash of a string (used for file path obfuscation).
 */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Checks whether git commands should be run for the workspace folder.
 */
export function shouldExecuteGitCommands(folderPath: string): boolean {
  if (!folderPath) {
    return false;
  }
  try {
    const gitDir = path.join(folderPath, '.git');
    return fs.existsSync(gitDir);
  } catch {
    return false;
  }
}

/**
 * Gets the current git branch name cheaply if available.
 */
export function getGitCurrentBranch(folderPath?: string): string {
  try {
    const targetFolder = folderPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!targetFolder || !shouldExecuteGitCommands(targetFolder)) {
      return '';
    }

    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: targetFolder,
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();

    return branch.includes('fatal:') ? '' : branch;
  } catch {
    return '';
  }
}

/**
 * Gets the git remote origin URL if available.
 */
export function getGitOriginUrl(folderPath?: string): string {
  try {
    const targetFolder = folderPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!targetFolder || !shouldExecuteGitCommands(targetFolder)) {
      return '';
    }

    const origin = execSync('git remote get-url origin', {
      cwd: targetFolder,
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();

    return origin.includes('fatal:') ? '' : origin;
  } catch {
    return '';
  }
}
