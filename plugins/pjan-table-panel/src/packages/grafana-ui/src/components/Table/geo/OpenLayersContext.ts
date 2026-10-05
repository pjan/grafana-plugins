// Copied from grafana/grafana v13.2.3: packages/grafana-ui/src/components/Table/geo/OpenLayersContext.ts. Apache-2.0 (Copyright Grafana Labs, see UPSTREAM.md). Changes: none.
import { type Geometry } from 'ol/geom';
import { createContext, useContext } from 'react';

export interface OpenLayersContextValue {
  formatGeometry?: (value: Geometry) => string;
}

export const OpenLayersContext = createContext<OpenLayersContextValue>({});

export function useOpenLayersContext(): OpenLayersContextValue {
  return useContext(OpenLayersContext);
}
