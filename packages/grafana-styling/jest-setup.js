// The plugins' Jest setup (the create-plugin scaffold's .config/jest-setup.js), with jest-canvas-mock instead of its
// canvas stub (Grafana's Combobox measures its text on a canvas), plus MessageChannel.
import '@testing-library/jest-dom';
import 'jest-canvas-mock';
import { MessageChannel as NodeMessageChannel } from 'node:worker_threads';
import { TextEncoder, TextDecoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

// https://jestjs.io/docs/manual-mocks#mocking-methods-which-are-not-implemented-in-jsdom
Object.defineProperty(global, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});

// @grafana/ui loads react-dom/server.browser, whose scheduler needs MessageChannel (jsdom has none): it listens on
// port1 and posts to port2. Setting a handler on a Node port keeps the process alive, so port1 is unref'd after.
global.MessageChannel = class MessageChannel {
  constructor() {
    const channel = new NodeMessageChannel();
    this.port2 = channel.port2;
    this.port1 = {
      postMessage: (message) => channel.port1.postMessage(message),
      close: () => channel.port1.close(),
      set onmessage(handler) {
        channel.port1.onmessage = handler;
        channel.port1.unref();
      },
    };
  }
};
