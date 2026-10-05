// Test stand-in, copied from grafana/grafana v13.2.3: public/test/mocks/react-inlinesvg.tsx (AGPL-3.0, Copyright Grafana Labs),
// unchanged. jest.config.js maps react-inlinesvg (which @grafana/ui's Icon uses) here; see UPSTREAM.md, "Tests".
import { type Ref, useEffect } from 'react';

export default function ReactInlineSVG({
  src,
  innerRef,
  cacheRequests,
  preProcessor,
  onLoad,
  ...rest
}: {
  src: string;
  innerRef: Ref<SVGSVGElement>;
  cacheRequests: boolean;
  preProcessor: () => string;
  onLoad?: () => void;
}) {
  // Simulate async loading behavior
  useEffect(() => {
    if (onLoad) {
      // Call onLoad synchronously in tests to avoid timing issues
      onLoad();
    }
  }, [src, onLoad]);

  return <svg id={src} ref={innerRef} {...rest} />;
}

export const cacheStore = {};
