// Copied from grafana/grafana v13.2.3: public/app/plugins/panel/status-history/utils.ts. AGPL-3.0 (Copyright Grafana Labs). Changes: imports only.
import { type DataFrame, type ActionModel, type Field, type InterpolateFunction } from '@grafana/data';
import { getActions } from 'features/actions/utils';

export const getFieldActions = (
  dataFrame: DataFrame,
  field: Field,
  replaceVars: InterpolateFunction,
  rowIndex: number,
  visualizationType?: string
) => {
  const actions: Array<ActionModel<Field>> = [];

  if (field.state?.scopedVars) {
    const actionLookup = new Set<string>();

    const actionsModel = getActions(
      dataFrame,
      field,
      field.state.scopedVars,
      replaceVars,
      field.config.actions ?? [],
      {
        valueRowIndex: rowIndex,
      },
      visualizationType
    );

    actionsModel.forEach((action) => {
      const key = `${action.title}`;
      if (!actionLookup.has(key)) {
        actions.push(action);
        actionLookup.add(key);
      }
    });
  }

  return actions;
};
