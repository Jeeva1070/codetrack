/* eslint-disable @typescript-eslint/no-explicit-any */
// Hook to intercept 'vscode' imports in mocha unit test suite
import Module from 'node:module';
import { mockVscode } from '../mockVscode';

const originalRequire = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string, ...args: any[]) {
  if (id === 'vscode') {
    return mockVscode;
  }
  return originalRequire.call(this, id, ...args);
};
