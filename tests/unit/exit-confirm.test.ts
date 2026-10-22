import { describe, expect, it } from 'vitest';
import { layoutExitConfirm } from '../../src/ui/ExitConfirm.ts';

function measure(text: string, size: number): number {
  return text.length * size * 0.52;
}

describe('exit confirmation layout', () => {
  it('places both actions inside the panel, below the description', () => {
    const layout = layoutExitConfirm(measure);
    expect(layout.buttons).toHaveLength(2);
    expect(layout.buttons.map((button) => button.label)).toEqual(['Yes, Leave', 'No, Stay']);
    const [yes, no] = layout.buttons;
    expect(yes.tone).toBe('ink');
    expect(no.tone).toBe('quiet');
    expect(yes.y).toBeCloseTo(no.y);
    expect(no.x).toBeGreaterThan(yes.x);

    for (const button of layout.buttons) {
      const left = button.x - button.w / 2;
      const right = button.x + button.w / 2;
      const top = button.y + button.h / 2;
      const bottom = button.y - button.h / 2;
      expect(left).toBeGreaterThan(-layout.worldW / 2 + layout.padM - 0.0001);
      expect(right).toBeLessThan(layout.worldW / 2 - layout.padM + 0.0001);
      expect(top).toBeLessThan(layout.textBottomY);
      expect(bottom).toBeGreaterThan(-layout.worldH / 2 + layout.padM - 0.0001);
      expect(button.z).toBeGreaterThan(0);
    }
  });

  it('grows the panel when a recoverable error is shown', () => {
    const plain = layoutExitConfirm(measure);
    const withError = layoutExitConfirm(measure, 'Unable to exit WebXR. You can stay and try again.');
    expect(withError.worldH).toBeGreaterThan(plain.worldH);
    expect(withError.buttons[0].y).toBeLessThan(plain.buttons[0].y);
    expect(withError.buttons[0].y + withError.buttons[0].h / 2).toBeLessThan(withError.textBottomY);
  });
});
