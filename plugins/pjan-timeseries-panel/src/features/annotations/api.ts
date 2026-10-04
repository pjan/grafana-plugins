// Copied from grafana/grafana v13.2.3: public/app/features/annotations/api.ts. AGPL-3.0 (Copyright Grafana Labs). Changes: partial copy; `annotationServer()` only provides `tags()`, the LegacyAnnotationServer implementation (the k8s client behind `grafana.kubernetesAnnotationsClient`, default off, is not ported); AnnotationTagsResponse from public/app/features/annotations/types.ts inlined.
// The copied AnnotationEditor only lists tags through this module. Creating, updating and deleting go through the
// public panel context (onAnnotationCreate / onAnnotationUpdate / onAnnotationDelete), which Grafana implements with
// its own annotationServer(), so those honour the k8s flag as in core.
import { getBackendSrv } from '@grafana/runtime';

// public/app/features/annotations/types.ts
interface AnnotationTag {
  /**
   * The tag name
   */
  tag: string;
  /**
   * The number of occurrences of that tag
   */
  count: number;
}

// public/app/features/annotations/types.ts
interface AnnotationTagsResponse {
  result: {
    tags: AnnotationTag[];
  };
}

interface AnnotationServer {
  tags(): Promise<Array<{ term: string; count: number }>>;
}

class LegacyAnnotationServer implements AnnotationServer {
  // Arrow-bound like upstream K8sAnnotationServer.tags, because AnnotationEditor passes it as a detached callback.
  tags = async () => {
    const response = await getBackendSrv().get<AnnotationTagsResponse>('/api/annotations/tags?limit=1000');
    return response.result.tags.map(({ tag, count }) => ({
      term: tag,
      count,
    }));
  };
}

let instance: AnnotationServer | null = null;

export function annotationServer(): AnnotationServer {
  if (!instance) {
    instance = new LegacyAnnotationServer();
  }
  return instance;
}
