// Jest setup provided by Grafana scaffolding
import './.config/jest-setup';

// grafana/grafana v13.2.3 runs its tests with jest-canvas-mock (jest.config.js setupFiles). Imported after the
// scaffold setup on purpose: it replaces the scaffold's no-op HTMLCanvasElement.getContext and provides Path2D.
import 'jest-canvas-mock';
import { MessageChannel as NodeMessageChannel } from 'node:worker_threads';

// The polyfills below are copied from grafana/grafana v13.2.3: public/test/jest-setup.ts (AGPL-3.0), which the
// upstream tests ported into src/ (see UPSTREAM.md) rely on.

// @grafana/ui loads react-dom/server.browser, which needs MessageChannel (not provided by jsdom).
// originally using just global.MessageChannel = MessageChannel
// however this results in open handles in jest tests
// see https://github.com/facebook/react/issues/26608#issuecomment-1734172596
global.MessageChannel = class {
  constructor() {
    const channel = new NodeMessageChannel();
    this.port1 = new Proxy(channel.port1, {
      set(port1, prop, value) {
        const result = Reflect.set(port1, prop, value);
        if (prop === 'onmessage') {
          port1.unref();
        }
        return result;
      },
    });
    this.port2 = channel.port2;
  }
};

// jsdom's URL predates URL.canParse, which @braintree/sanitize-url (textUtil.sanitizeUrl) calls.
if (typeof URL.canParse !== 'function') {
  URL.canParse = (url, base) => {
    try {
      new URL(url, base);
      return true;
    } catch {
      return false;
    }
  };
}

// Used by useMeasure
global.ResizeObserver = class ResizeObserver {
  static #observationEntry = {
    contentRect: {
      x: 1,
      y: 2,
      width: 500,
      height: 500,
      top: 100,
      bottom: 0,
      left: 100,
      right: 0,
    },
    target: {
      // Needed for react-virtual to work in tests
      getAttribute: () => 1,
    },
    // Needed for react-data-grid (TableNG) to measure columns in tests
    contentBoxSize: [{ inlineSize: 500, blockSize: 500 }],
  };

  #isObserving = false;
  #callback;

  constructor(callback) {
    this.#callback = callback;
  }

  #emitObservation() {
    setTimeout(() => {
      if (!this.#isObserving) {
        return;
      }

      this.#callback([ResizeObserver.#observationEntry], this);
    });
  }

  observe() {
    this.#isObserving = true;
    this.#emitObservation();
  }

  disconnect() {
    this.#isObserving = false;
  }

  unobserve() {
    this.#isObserving = false;
  }
};
