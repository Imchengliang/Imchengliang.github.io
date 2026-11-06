"""Shared descriptive calculations for the local API and browser Python runtime."""
import numpy as np
import pandas as pd


def summarize(rows, profiles, methods, filters, include_qualified=False):
    if filters['template'] == 'routes':
        return []
    records = []
    composition = filters['template'] in ('composition', 'rich')
    for row in rows:
        if row.get('qualifier') and not include_qualified:
            continue
        profile = profiles[row['profile_id']]
        method = methods.get(row.get('method_id'), {})
        records.append(dict(row, stream=profile['stream'], chemistry=profile['chemistry'],
                            sample_label=profile['label'], state=profile['state'], family=method.get('family', ''),
                            target=row.get('element') if composition else row['material'],
                            metric='Elemental mass content' if composition else row['metric'],
                            analysis_unit='wt%' if composition else '%',
                            analysis_value=row['wt_percent'] if composition else float(row['value']),
                            measurement_id=row.get('observation_id') or row['id']))
    if not records:
        return []
    frame = pd.DataFrame(records).drop_duplicates(['profile_id', 'measurement_id'])
    grouping = ['target', 'metric', 'analysis_unit', 'stream', 'chemistry']
    if filters['summary_level'] == 'sample':
        grouping += ['profile_id', 'assay'] if composition else ['profile_id', 'method_id', 'condition']
    else:
        grouping += ['state', 'assay'] if composition else ['family']
    summaries = []
    for _, group in frame.groupby(grouping, dropna=False, sort=True):
        numeric_group = group[group['qualifier'].fillna('').eq('')]
        values = numeric_group['analysis_value'].to_numpy(dtype=float)
        basis = filters.get('summary_basis', 'record')
        if basis == 'study':
            values = numeric_group.groupby('paper')['analysis_value'].mean().to_numpy(dtype=float)
        first = group.iloc[0]
        label = first['sample_label']
        if filters['summary_level'] == 'context':
            label = first['state'] if composition else first['family']
        summaries.append({'target': first['target'], 'metric': first['metric'], 'unit': first['analysis_unit'],
                          'stream': first['stream'], 'chemistry': first['chemistry'],
                          'label': label,
                          'family': first['family'], 'assay': first.get('assay', ''),
                          'records': len(group), 'studies': group['paper'].nunique(), 'sample_groups': group['profile_id'].nunique(),
                          'summary_basis': basis, 'statistical_units': len(values),
                          'mean': float(np.mean(values)) if len(values) else None,
                          'median': float(np.median(values)) if len(values) else None,
                          'minimum': float(np.min(values)) if len(values) else None,
                          'maximum': float(np.max(values)) if len(values) else None,
                          'sd': float(np.std(values, ddof=1)) if len(values) > 1 else None,
                          'states': int(group['state'].nunique()),
                          'conditions': int(group['condition'].nunique()) if not composition else 0,
                          'time_conditions': sorted({value for values in group.get('time_conditions', []) for value in values}),
                          'concentration_conditions': sorted({value for values in group.get('concentration_conditions', []) for value in values}),
                          'record_ids': group['id'].tolist()})
    return summaries
