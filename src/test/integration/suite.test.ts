import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('CodeTrack Extension Integration Test Suite', () => {
  suiteSetup(async () => {
    // Wait for extension host initialization
    const ext = vscode.extensions.getExtension('jeevavarshan.codetrack');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  test('Commands should be registered in VS Code', async () => {
    const allCommands = await vscode.commands.getCommands(true);
    assert.ok(allCommands.includes('codetrack.getToken'), 'codetrack.getToken should be registered');
    assert.ok(allCommands.includes('codetrack.toDashboard'), 'codetrack.toDashboard should be registered');
    assert.ok(allCommands.includes('codetrack.codeTimeInStatusBar'), 'codetrack.codeTimeInStatusBar should be registered');
  });

  test('Configuration changes should be accepted', async () => {
    const config = vscode.workspace.getConfiguration('codetrack');
    await config.update('statusBarInfo', 'Today', vscode.ConfigurationTarget.Global);
    const updated = vscode.workspace.getConfiguration('codetrack').get<string>('statusBarInfo');
    assert.strictEqual(updated, 'Today');
  });
});
