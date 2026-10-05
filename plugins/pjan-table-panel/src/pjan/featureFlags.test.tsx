import { act, render, screen } from '@testing-library/react';
import { TypedInMemoryProvider, OpenFeature } from '@openfeature/web-sdk';

import {
  FlagKeys,
  getFeatureFlagClient,
  initOpenFeature,
  OPEN_FEATURE_DOMAIN,
  useFlagTableAutoColumnWidths,
  useFlagTablePaginationPageSize,
} from '../packages/grafana-runtime/internal';

// Stand-ins for Grafana's two provider proxies (the real ones read core's provider instances, which only exist in a
// running Grafana). In-memory providers throw "flag not found" for flags they don't have, as the localStorage provider
// does for a missing key, so the first one that has the flag wins.
const mockProviders = {
  localStorage: new TypedInMemoryProvider({}),
  ofrep: new TypedInMemoryProvider({}),
};

jest.mock('@grafana/runtime', () => ({
  config: { namespace: 'stacks-12345', openFeatureContext: { grafana_version: '13.2.3', namespace: 'stacks-12345' } },
  createOpenFeatureLocalStorageProvider: () => mockProviders.localStorage,
  createOpenFeatureOFREPWebProvider: () => mockProviders.ofrep,
}));

const flag = (value: boolean) => ({
  variants: { on: true, off: false },
  defaultVariant: value ? ('on' as const) : ('off' as const),
  disabled: false,
});

function Flags() {
  const autoColumnWidths = useFlagTableAutoColumnWidths();
  const paginationPageSize = useFlagTablePaginationPageSize();
  return <div data-testid="flags">{`${autoColumnWidths},${paginationPageSize}`}</div>;
}

afterEach(async () => {
  await OpenFeature.clearProviders();
  mockProviders.localStorage = new TypedInMemoryProvider({});
  mockProviders.ofrep = new TypedInMemoryProvider({});
});

describe('the table feature flags (stand-in for @grafana/runtime/internal)', () => {
  it('has the keys of grafana/grafana v13.2.3 (openfeature.gen.ts)', () => {
    expect(FlagKeys).toEqual({
      TableAutoColumnWidths: 'table.autoColumnWidths',
      TablePaginationPageSize: 'table.paginationPageSize',
    });
  });

  it('evaluates both flags to false while the domain has no provider (before initOpenFeature, and in tests)', () => {
    const client = getFeatureFlagClient();
    expect(client.getBooleanValue(FlagKeys.TableAutoColumnWidths, false)).toBe(false);
    expect(client.getBooleanValue(FlagKeys.TablePaginationPageSize, false)).toBe(false);
    render(<Flags />);
    expect(screen.getByTestId('flags')).toHaveTextContent('false,false');
  });

  it('reads the localStorage provider first, then the OFREP provider, as core does', async () => {
    mockProviders.localStorage = new TypedInMemoryProvider({ [FlagKeys.TablePaginationPageSize]: flag(false) });
    mockProviders.ofrep = new TypedInMemoryProvider({
      [FlagKeys.TablePaginationPageSize]: flag(true),
      [FlagKeys.TableAutoColumnWidths]: flag(true),
    });
    await initOpenFeature();

    const client = getFeatureFlagClient();
    // In both: the localStorage override wins.
    expect(client.getBooleanValue(FlagKeys.TablePaginationPageSize, false)).toBe(false);
    // Only in OFREP: the server's value.
    expect(client.getBooleanValue(FlagKeys.TableAutoColumnWidths, false)).toBe(true);
    // In neither: the default.
    expect(client.getBooleanValue('table.inspectDataTableNG', false)).toBe(false);
  });

  it("sets core's evaluation context on the plugin's own domain", async () => {
    await initOpenFeature();
    expect(OPEN_FEATURE_DOMAIN).toBe('pjan-table-panel');
    expect(OpenFeature.getContext(OPEN_FEATURE_DOMAIN)).toEqual({
      targetingKey: 'stacks-12345',
      grafana_version: '13.2.3',
      namespace: 'stacks-12345',
    });
    // Not on the default domain, which Grafana warns plugins against changing.
    expect(OpenFeature.getContext()).toEqual({});
  });

  it('re-renders the hooks when the provider becomes ready after the first render, and when a flag changes', async () => {
    mockProviders.ofrep = new TypedInMemoryProvider({ [FlagKeys.TablePaginationPageSize]: flag(true) });
    render(<Flags />);
    expect(screen.getByTestId('flags')).toHaveTextContent('false,false');

    await act(() => initOpenFeature());
    expect(screen.getByTestId('flags')).toHaveTextContent('false,true');

    // The OFREP provider reports new flags (ConfigurationChanged, forwarded by the MultiProvider).
    await act(() =>
      mockProviders.ofrep.putConfiguration({
        [FlagKeys.TablePaginationPageSize]: flag(false),
        [FlagKeys.TableAutoColumnWidths]: flag(true),
      })
    );
    expect(screen.getByTestId('flags')).toHaveTextContent('true,false');
  });
});
