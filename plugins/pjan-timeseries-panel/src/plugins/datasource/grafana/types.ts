// Copied from grafana/grafana v13.2.3: public/app/plugins/datasource/grafana/types.ts. AGPL-3.0 (Copyright Grafana Labs). Changes: imports; partial copy (GrafanaQueryType, GrafanaQuery and GrafanaQueryFile, which migrations.ts uses for the Graph panel's time regions; defaultQuery and the annotation types are left off); GrafanaQuery's search and searchNext fields left off (marked: their SearchQuery type, app/features/search/service/types.ts, needs Grafana's private API clients).
import { type DataFrameJSON } from '@grafana/data';
import { type LiveDataFilter } from '@grafana/runtime';
import { type DataQuery } from '@grafana/schema';
import { type TimeRegionConfig } from 'core/utils/timeRegions';

//----------------------------------------------
// Query
//----------------------------------------------

export enum GrafanaQueryType {
  LiveMeasurements = 'measurements',
  Annotations = 'annotations',
  Snapshot = 'snapshot',
  TimeRegions = 'timeRegions',

  // backend
  RandomWalk = 'randomWalk',
  List = 'list',
}

export interface GrafanaQuery extends DataQuery {
  queryType: GrafanaQueryType; // RandomWalk by default
  channel?: string;
  filter?: LiveDataFilter;
  buffer?: number;
  path?: string; // for list
  // pjan-timeseries-panel: `search?: SearchQuery` and `searchNext?: SearchQuery` left off (see the header)
  snapshot?: DataFrameJSON[];
  timeRegion?: TimeRegionConfig;
  file?: GrafanaQueryFile;
  // Random walk configuration
  seriesCount?: number;
  startValue?: number;
  min?: number;
  max?: number;
  spread?: number;
  noise?: number;
  dropPercent?: number;
}

interface GrafanaQueryFile {
  name: string;
  size: number;
}
