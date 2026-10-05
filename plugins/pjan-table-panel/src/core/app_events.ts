// Plugin stand-in for grafana/grafana v13.2.3: public/app/core/app_events.ts. AGPL-3.0 (derived from code Copyright Grafana Labs).
// Upstream creates core's application event bus (`new EventBusSrv()`), which core hands to plugins through the public
// `getAppEvents()`. A plugin must publish to that shared bus, not create its own, so only the legacy `emit()` the copied
// code uses is provided. `EventBusSrv.emit(event, payload)` is `emitter.emit(event.name, { type: event.name, payload })`,
// which is exactly what `publish({ type: event.name, payload })` does.
import { getAppEvents } from '@grafana/runtime';

export const appEvents = {
  emit<T>(event: { name: string }, payload?: T) {
    getAppEvents().publish({ type: event.name, payload });
  },
};
