// Copied from grafana/grafana v13.2.3: packages/grafana-ui/src/components/Table/geo/index.ts. Apache-2.0 (Copyright Grafana Labs, see UPSTREAM.md). Changes: none.
import { lazy } from 'react';

export { hasGeoCell, isGeometry } from './utils';
export { type OpenLayersContextValue, useOpenLayersContext } from './OpenLayersContext';

export const LazyOpenLayersProvider = lazy(() =>
  import('./OpenLayersProvider').then((module) => ({ default: module.OpenLayersProvider }))
);
