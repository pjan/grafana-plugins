// Test stand-in for `@openfeature/react-sdk` (not a dependency of this plugin); jest.config.js and tsconfig.json map the
// package name here. The ported features/table/hooks.test.tsx wraps its hooks in core's `<OpenFeatureProvider client>`,
// which core's flag hooks (`useFlag` of the React SDK) read their client from. The plugin's flag hooks
// (packages/grafana-runtime/internal.ts) read the plugin's own domain directly and need no React provider, so here the
// provider only renders its children. The client the test passes (`getTestFeatureFlagClient()`) is still created, and
// with it the in-memory provider on the plugin's domain that `setTestFlags` configures.
import { type Client } from '@openfeature/web-sdk';
import { type PropsWithChildren } from 'react';

export function OpenFeatureProvider({ children }: PropsWithChildren<{ client?: Client; domain?: string }>) {
  return <>{children}</>;
}
