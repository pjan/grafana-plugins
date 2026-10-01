// Copied from grafana/grafana v13.2.3: public/app/features/panel/options/builder/ClusteringSwitchEditor.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: imports only.
import { type StandardEditorProps } from '@grafana/data';
import { Switch } from '@grafana/ui';

export const DEFAULT_CLUSTERING_ANNOTATION_SPACING = 24;
export const DEFAULT_CLUSTERING_ANNOTATION_SPACING_DISABLED = -1;

export const ClusteringSwitchEditor = ({ onChange, value, id }: StandardEditorProps<number>) => (
  <Switch
    id={id}
    value={value > DEFAULT_CLUSTERING_ANNOTATION_SPACING_DISABLED}
    onChange={(event) =>
      onChange(
        event?.currentTarget.checked
          ? DEFAULT_CLUSTERING_ANNOTATION_SPACING
          : DEFAULT_CLUSTERING_ANNOTATION_SPACING_DISABLED
      )
    }
  />
);
