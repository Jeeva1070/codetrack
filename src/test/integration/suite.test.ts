import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Gridly Extension Integration Test Suite', () => {
  suiteSetup(async () => {
    // Wait for extension host initialization
    const ext = vscode.extensions.getExtension('jeevavarshan.gridly');
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  test('Commands should be registered in VS Code', async () => {
    const allCommands = await vscode.commands.getCommands(true);
    assert.ok(allCommands.includes('gridly.getToken'), 'gridly.getToken should be registered');
    assert.ok(allCommands.includes('gridly.toDashboard'), 'gridly.toDashboard should be registered');
    assert.ok(allCommands.includes('gridly.codeTimeInStatusBar'), 'gridly.codeTimeInStatusBar should be registered');
  });

  test('Configuration changes should be accepted', async () => {
    const config = vscode.workspace.getConfiguration('gridly');
    await config.update('statusBarInfo', 'Today', vscode.ConfigurationTarget.Global);
    const updated = vscode.workspace.getConfiguration('gridly').get<string>('statusBarInfo');
    assert.strictEqual(updated, 'Today');
  });
});
