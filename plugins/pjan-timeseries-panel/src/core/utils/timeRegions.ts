// Copied from grafana/grafana v13.2.3: public/app/core/utils/timeRegions.ts. AGPL-3.0 (Copyright Grafana Labs). Changes: partial copy (the TimeRegionMode and TimeRegionConfig types only, which migrations.ts and the partial copy of plugins/datasource/grafana/types.ts use; the time region calculation and its croner import are left off).
export type TimeRegionMode = null | 'cron';
export interface TimeRegionConfig {
  mode?: TimeRegionMode;

  from?: string;
  fromDayOfWeek?: number; // 1-7

  to?: string;
  toDayOfWeek?: number; // 1-7

  timezone?: string;

  cronExpr?: string; // 0 9 * * 1-5
  duration?: string; // 8h
}
