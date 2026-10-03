import {
  type DataFrame,
  DataTopic,
  type FieldConfigEditorBuilder,
  FieldType,
  type PanelOptionsEditorBuilder,
} from '@grafana/data';
import { t } from '@grafana/i18n';
import { type ComboboxOption } from '@grafana/ui';

import { getXAnnotationFrames } from '../../plugins/panel/timeseries/plugins/utils';

import { RowAnnotationsComboboxEditor, type RowAnnotationsComboboxSettings } from './RowAnnotationsComboboxEditor';

/** What a row is matched by, unless its "Annotation key" field option is set. */
export type RowKeySource = 'displayName' | 'label';

/**
 * Panel options of the per-row annotations (plugin-only, not in core's state timeline). Off unless `enabled`. No
 * option has a default value, so a panel that never used them saves none (unset `field` is `tags`, unset `rowKey` is
 * the display name).
 */
export interface RowAnnotationsOptions {
  enabled?: boolean;
  /** Name of the annotation field compared with the row keys */
  field?: string;
  rowKey?: RowKeySource;
  /** Label of the row fields used as the row key when `rowKey` is `label` */
  label?: string;
}

export interface OptionsWithRowAnnotations {
  rowAnnotations?: RowAnnotationsOptions;
}

/**
 * Field option that replaces a row's key; set per row through overrides. Like the panel options, under
 * `custom.rowAnnotations` (override id `custom.rowAnnotations.annotationKey`).
 */
export interface FieldRowAnnotations {
  annotationKey?: string;
}

export interface FieldConfigWithRowAnnotations {
  rowAnnotations?: FieldRowAnnotations;
}

export const DEFAULT_ROW_ANNOTATION_FIELD = 'tags';
export const DEFAULT_ROW_KEY: RowKeySource = 'displayName';

// Layout and bookkeeping fields of an annotation frame: never a useful key.
const NON_KEY_FIELDS = new Set(['time', 'timeEnd', 'isRegion', 'color', 'source', 'clusterIdx', 'isCluster']);

const getRowAnnotations = (options: unknown) =>
  (options as OptionsWithRowAnnotations | undefined)?.rowAnnotations ?? {};

const hasAnnotations = (annotations?: DataFrame[]) =>
  annotations?.some((df) => df.meta?.dataTopic === DataTopic.Annotations) ?? false;

const getCategory = () => [t('grafana-ui.builder.annotations', 'Annotations')];

/** The fields of the panel's time annotations (the ones drawn on the x axis), for the "Annotation field" picker. */
export function getAnnotationFieldOptions(annotations?: DataFrame[]): Array<ComboboxOption<string>> {
  const names = new Set<string>();
  for (const frame of getXAnnotationFrames(annotations)) {
    if (frame.meta?.dataTopic !== DataTopic.Annotations) {
      continue;
    }
    for (const field of frame.fields) {
      if (!NON_KEY_FIELDS.has(field.name)) {
        names.add(field.name);
      }
    }
  }
  return [...names].map((name) => ({ value: name, label: name }));
}

/** The label names of the panel's series fields, for the "Label" picker. */
export function getRowLabelOptions(series?: DataFrame[]): Array<ComboboxOption<string>> {
  const names = new Set<string>();
  for (const frame of series ?? []) {
    for (const field of frame.fields) {
      Object.keys(field.labels ?? {}).forEach((name) => names.add(name));
    }
  }
  return [...names].sort().map((name) => ({ value: name, label: name }));
}

/**
 * Adds the per-row annotation options to the panel's "Annotations" group. Same category name as
 * features/panel/options/builder/annotations.ts, so Grafana's options pane shows them after core's options.
 */
export function addRowAnnotationOptions<T>(builder: PanelOptionsEditorBuilder<T>) {
  const category = getCategory();
  const isEnabled = (options: T, annotations?: DataFrame[]) =>
    getRowAnnotations(options).enabled === true && hasAnnotations(annotations);

  builder
    .addBooleanSwitch({
      path: 'rowAnnotations.enabled',
      category,
      name: t('pjan.row-annotations.enabled-name', 'Show on matching rows'),
      description: t(
        'pjan.row-annotations.enabled-desc',
        'Draws an annotation on the row whose key matches the annotation field. Other annotations are drawn as usual'
      ),
      showIf: (_, __, annotations) => hasAnnotations(annotations),
    })
    .addCustomEditor<RowAnnotationsComboboxSettings, string>({
      id: 'rowAnnotations.field',
      path: 'rowAnnotations.field',
      category,
      name: t('pjan.row-annotations.field-name', 'Annotation field'),
      description: t(
        'pjan.row-annotations.field-desc',
        'Compared with the row key. For a list field such as tags, any of its values can match'
      ),
      editor: RowAnnotationsComboboxEditor,
      settings: {
        placeholder: DEFAULT_ROW_ANNOTATION_FIELD,
        getOptions: (context) => getAnnotationFieldOptions(context.annotations),
        createCustomValue: true,
      },
      showIf: (options, __, annotations) => isEnabled(options, annotations),
    })
    .addCustomEditor<RowAnnotationsComboboxSettings, RowKeySource>({
      id: 'rowAnnotations.rowKey',
      path: 'rowAnnotations.rowKey',
      category,
      name: t('pjan.row-annotations.row-key-name', 'Row key'),
      description: t(
        'pjan.row-annotations.row-key-desc',
        'What the annotation field is compared with. A row’s "Annotation key" override replaces it'
      ),
      editor: RowAnnotationsComboboxEditor,
      settings: {
        placeholder: t('pjan.row-annotations.row-key-display-name', 'Display name'),
        getOptions: () => [
          { value: 'displayName', label: t('pjan.row-annotations.row-key-display-name', 'Display name') },
          { value: 'label', label: t('pjan.row-annotations.row-key-label', 'Label') },
        ],
      },
      showIf: (options, __, annotations) => isEnabled(options, annotations),
    })
    .addCustomEditor<RowAnnotationsComboboxSettings, string>({
      id: 'rowAnnotations.label',
      path: 'rowAnnotations.label',
      category,
      name: t('pjan.row-annotations.label-name', 'Label'),
      description: t('pjan.row-annotations.label-desc', 'The row label whose value is the row key'),
      editor: RowAnnotationsComboboxEditor,
      settings: {
        placeholder: t('pjan.row-annotations.label-placeholder', 'Choose a label'),
        getOptions: (context) => getRowLabelOptions(context.data),
        createCustomValue: true,
      },
      showIf: (options, __, annotations) =>
        isEnabled(options, annotations) && getRowAnnotations(options).rowKey === 'label',
    });
}

/**
 * Adds the "Annotation key" field option. It is meant to be set per row with an override, so it is hidden from the
 * panel-wide field defaults and only offered in overrides.
 */
export function addAnnotationKeyFieldConfig<T>(builder: FieldConfigEditorBuilder<T>) {
  builder.addTextInput({
    path: 'rowAnnotations.annotationKey',
    category: getCategory(),
    name: t('pjan.row-annotations.annotation-key-name', 'Annotation key'),
    description: t(
      'pjan.row-annotations.annotation-key-desc',
      'Matches annotations to this row by this key instead of the row key ("Show on matching rows")'
    ),
    hideFromDefaults: true,
    shouldApply: (field) => field.type !== FieldType.time,
  });
}
