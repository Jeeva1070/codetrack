import './setup';
import * as assert from 'node:assert';
import * as path from 'node:path';
import { formatDurationLocalized, initI18n, t, toUrduNumber } from '../../i18n';

describe('i18n Module Unit Tests', () => {
  const rootDir = path.resolve(__dirname, '../../..');

  it('should convert digits to Urdu numerals correctly', () => {
    assert.strictEqual(toUrduNumber(0), '۰');
    assert.strictEqual(toUrduNumber(12345), '۱۲۳۴۵');
  });

  it('should format duration in English and fallback compact mode', async () => {
    const text0 = await formatDurationLocalized(0, 'en');
    assert.strictEqual(text0, '0m');

    const textMinutes = await formatDurationLocalized(45, 'en');
    assert.ok(textMinutes.includes('45m') || textMinutes.includes('45 minutes'), `Actual: ${textMinutes}`);

    const textHours = await formatDurationLocalized(150, 'en');
    assert.ok(
      (textHours.includes('2h') && textHours.includes('30m')) ||
      (textHours.includes('2 hours') && textHours.includes('30 minutes')),
      `Actual: ${textHours}`
    );
  });

  it('should format Urdu RTL duration with Urdu digits and terms', async () => {
    const urduText = await formatDurationLocalized(125, 'ur');
    assert.ok(urduText.includes('گھنٹے'), `Should include Urdu hours: ${urduText}`);
    assert.ok(urduText.includes('منٹ'), `Should include Urdu minutes: ${urduText}`);
    assert.ok(urduText.includes('۲'), `Should include Urdu numeral 2: ${urduText}`);
  });

  it('should fallback to English for missing keys and placeholder interpolation', async () => {
    await initI18n(rootDir, 'en');
    const msg = t('CodeTrack: Initializing...');
    assert.strictEqual(msg, 'CodeTrack: Initializing...');

    const missing = t('NonExistentKey');
    assert.strictEqual(missing, 'NonExistentKey');
  });
});
