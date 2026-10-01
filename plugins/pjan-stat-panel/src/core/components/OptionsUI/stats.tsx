// Copied from grafana/grafana v13.2.3: public/app/core/components/OptionsUI/stats.tsx. AGPL-3.0 (Copyright Grafana Labs). Changes: none.
import { type StandardEditorProps, type StatsPickerConfigSettings } from '@grafana/data';
import { StatsPicker } from '@grafana/ui';

export const StatsPickerEditor = ({
  value,
  onChange,
  item,
  id,
}: StandardEditorProps<string[], StatsPickerConfigSettings>) => {
  return (
    <StatsPicker
      id={id}
      stats={value}
      onChange={onChange}
      allowMultiple={!!item.settings?.allowMultiple}
      defaultStat={item.settings?.defaultStat}
    />
  );
};
