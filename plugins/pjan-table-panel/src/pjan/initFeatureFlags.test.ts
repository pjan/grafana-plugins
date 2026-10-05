import { config } from '@grafana/runtime';

import { initOpenFeature } from '../packages/grafana-runtime/internal';

import { initFeatureFlags } from './initFeatureFlags';

jest.mock('../packages/grafana-runtime/internal', () => ({
  ...jest.requireActual('../packages/grafana-runtime/internal'),
  initOpenFeature: jest.fn(() => Promise.resolve()),
}));

const initOpenFeatureMock = jest.mocked(initOpenFeature);

// As core's app.ts: the flag provider is set up only for a signed-in user (contextSrv.user.isSignedIn, from the boot
// data), and a failure is logged, not thrown.
describe('initFeatureFlags', () => {
  const user = config.bootData.user;

  afterEach(() => {
    config.bootData.user = user;
    jest.clearAllMocks();
  });

  const signedIn = (isSignedIn: boolean) => {
    config.bootData.user = { ...user, isSignedIn };
  };

  it('sets up the flag provider for a signed-in user', async () => {
    signedIn(true);
    await expect(initFeatureFlags()).resolves.toBe(true);
    expect(initOpenFeatureMock).toHaveBeenCalledTimes(1);
  });

  it('leaves it unset without a signed-in user (anonymous viewers, public dashboards), as core does', async () => {
    signedIn(false);
    await expect(initFeatureFlags()).resolves.toBe(false);
    expect(initOpenFeatureMock).not.toHaveBeenCalled();
  });

  it('leaves it unset without user boot data', async () => {
    config.bootData.user = undefined as unknown as typeof user;
    await expect(initFeatureFlags()).resolves.toBe(false);
    expect(initOpenFeatureMock).not.toHaveBeenCalled();
  });

  it('logs a failure and goes on, as core does', async () => {
    signedIn(true);
    const error = new Error('no provider');
    initOpenFeatureMock.mockRejectedValueOnce(error);
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    await expect(initFeatureFlags()).resolves.toBe(true);
    expect(consoleError).toHaveBeenCalledWith('Failed to initialize OpenFeature provider', error);
  });
});
