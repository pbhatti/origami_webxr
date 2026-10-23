import { describe, expect, it } from 'vitest';
import { layoutFoldingPanel, stepConnectorFill, type FoldingPanelInput } from '../../src/ui/UnifiedFoldingPanel.ts';

function context(): CanvasRenderingContext2D {
  return {
    font: '',
    measureText(text: string) {
      const size = Number(/(\d+)px/.exec(this.font)?.[1] ?? 24);
      return { width: text.length * size * 0.5 };
    },
  } as CanvasRenderingContext2D;
}

function input(patch: Partial<FoldingPanelInput> = {}): FoldingPanelInput {
  return {
    recipeId: 'origami-whale',
    stepId: 'diag-fold',
    title: 'Fold the diamond in half',
    body: 'Pinch the bottom corner and fold it up to the top corner along the dotted line.',
    committed: 0,
    activeIndex: 0,
    total: 6,
    completed: false,
    error: null,
    ...patch,
  };
}

describe('unified folding panel', () => {
  it('uses the same padding on every side and sizes to the copy', () => {
    const layout = layoutFoldingPanel(input(), context());
    const bottom = layout.canvasHeight - layout.contentBottom;
    expect(layout.contentTop).toBe(layout.padPx);
    expect(bottom).toBe(layout.padPx);
    expect(layout.contentLeft).toBe(layout.padPx);
    expect(layout.canvasWidth - layout.contentRight).toBe(layout.padPx);
    expect(layout.count).toBe('1 of 6');
    expect(layout.title).toBe('Fold the diamond in half');
    expect(layout.bodyLines.length).toBeGreaterThan(0);
    expect(layout.buttons).toHaveLength(0);
    expect(layout.dividerY).toBeNull();
    expect(layout.worldHeight).toBeGreaterThan(0.08);
    expect(layout.worldHeight).toBeLessThan(0.2);
  });

  it('spaces every step equally and keeps a multi-part stage on the same circle', () => {
    const whale = layoutFoldingPanel(input(), context());
    const gaps = whale.steps.slice(1).map((step, index) => step.x - whale.steps[index]!.x);
    expect(whale.steps).toHaveLength(6);
    expect(whale.steps[0]?.state).toBe('active');
    expect(new Set(gaps.map((gap) => gap.toFixed(3))).size).toBe(1);

    const ears = layoutFoldingPanel(input({
      recipeId: 'origami-fox',
      stepId: 'fox-ear-right',
      title: 'Fold the right ear',
      committed: 2,
      activeIndex: 2,
      total: 4,
    }), context());
    expect(ears.count).toBe('3 of 4');
    expect(ears.steps.map((step) => step.state)).toEqual(['done', 'done', 'active', 'upcoming']);
    expect(ears.connectors.map((connector) => connector.done)).toEqual([true, true, false]);
  });

  it('joins step circles edge to edge and fills only after the previous step completes', () => {
    const layout = layoutFoldingPanel(input({ committed: 2, activeIndex: 2 }), context());
    expect(layout.connectors).toHaveLength(5);
    layout.connectors.forEach((connector, index) => {
      const current = layout.steps[index];
      const next = layout.steps[index + 1];
      expect(current).toBeTruthy();
      expect(next).toBeTruthy();
      expect(connector.x0).toBeCloseTo(current!.x + current!.radius);
      expect(connector.x1).toBeCloseTo(next!.x - next!.radius);
      expect(connector.x1).toBeGreaterThan(connector.x0);
      expect(connector.y).toBe(current!.y);
    });
    expect(layout.connectors.map((connector) => connector.done)).toEqual([true, true, false, false, false]);
    const first = stepConnectorFill(0, 1, 1 / 60);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.4);
    expect(stepConnectorFill(first, 1, 2)).toBe(1);
  });

  it('turns the same panel into the success state only when completion is explicit', () => {
    const folding = layoutFoldingPanel(input({ committed: 5, activeIndex: 5 }), context());
    const done = layoutFoldingPanel(input({
      stepId: 'complete',
      title: "It's alive!",
      body: 'Your creation is ready to play!',
      committed: 6,
      activeIndex: null,
      total: 6,
      completed: true,
    }), context());
    expect(folding.steps.at(-1)?.state).toBe('active');
    expect(folding.buttons).toHaveLength(0);
    expect(done.steps.every((step) => step.state === 'done')).toBe(true);
    expect(done.count).toBe('6 of 6');
    expect(done.buttons.map((button) => button.tone)).toEqual(['ink', 'quiet']);
    expect(done.canvasHeight).toBeGreaterThan(folding.canvasHeight);
    const bottom = done.canvasHeight - done.contentBottom;
    expect(bottom).toBe(done.padPx);
  });
});