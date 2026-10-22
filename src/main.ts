import { App } from './app/App.ts';
import { debugEvents } from './telemetry/DebugEvents.ts';

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}

async function boot(): Promise<void> {
  const overlay = requiredElement('welcome');
  const scene = requiredElement('scene-container');
  const app = new App({ overlay, scene });
  window.addEventListener('pagehide', () => app.dispose(), { once: true });
  await app.start();
}

boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  debugEvents.emit('fatalError', { message });
  const status = document.querySelector('[data-status]');
  if (status) {
    status.textContent = `Startup failed: ${message}`;
  }
  const headline = document.querySelector('[data-headline]');
  if (headline) {
    headline.textContent = 'The studio could not start.';
  }
});
