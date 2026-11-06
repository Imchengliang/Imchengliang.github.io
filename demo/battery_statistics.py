"""Compare reviewed samples; pool only matching, sufficiently described contexts."""
import json
import numpy as np
import pandas as pd


def signature(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


def pooling_context(row, profile, composition):
    """Names and missing attributes never establish comparability."""
    issues = []
    if not profile.get('chemistry_resolved'):
        issues.append('Battery chemistry is mixed or unresolved')
    if not profile.get('material_class') or not profile.get('preparation') or not profile.get('feedstock_history'):
        issues.append('Material identity or preparation is not fully classified')
    context = {key: profile.get(key) for key in ('chemistry', 'material_class', 'feedstock_history', 'size_fraction_mm')}
    context['preparation'] = row.get('preparation', profile.get('preparation', []))
    context['thermal_treatment'] = row.get('thermal_treatment', profile.get('thermal_treatment'))
    if composition:
        for key, label in [('mass_denominator', 'Mass denominator'), ('moisture_basis', 'Dry / wet basis'),
                           ('assay_method', 'Assay method')]:
            context[key] = row.get(key)
            if not context[key] or context[key] == 'unspecified':
                issues.append(label + ' is unresolved')
    else:
        # A method family, matching names or parsed condition fragments alone are insufficient.
        context['route'] = row.get('reviewed_route_group')
        context['conditions'] = row.get('reviewed_condition_context')
        if not context['route'] or not context['conditions']:
            issues.append('Route and experimental-condition equivalence have not been reviewed')
    return None if issues else signature(context), issues


def summarize(rows, profiles, methods, filters):
    if filters['template'] == 'routes':
        return []
    composition = filters['template'] in ('composition', 'rich')
    records = []
    for row in rows:
        profile = profiles[row['profile_id']]
        method = methods.get(row.get('method_id'), {})
        key, issues = pooling_context(row, profile, composition)
        records.append(dict(row, chemistry=profile['chemistry'], stream=profile['stream'],
                            material_class=profile.get('material_class', 'unspecified'),
                            sample_label=profile['label'], state=profile['state'],
                            family=method.get('family', ''), method_name=method.get('name', ''),
                            target=row.get('element') if composition else row['material'],
                            metric='Elemental mass content' if composition else row['metric'],
                            analysis_unit='wt%' if composition else '%',
                            analysis_value=row['wt_percent'] if composition else float(row['value']),
                            measurement_id=row.get('observation_id') or row['id'], pool_key=key, issues=issues))
    if not records:
        return []
    frame = pd.DataFrame(records).drop_duplicates(['profile_id', 'measurement_id'])
    grouping = ['chemistry', 'target', 'metric', 'analysis_unit']
    if not composition:
        grouping += ['family']
    if filters.get('summary_level') == 'sample':
        grouping += ['profile_id']
    summaries = []
    for _, group in frame.groupby(grouping, dropna=False, sort=True):
        first = group.iloc[0]
        numeric = group[group['qualifier'].fillna('').eq('')]
        entries = []
        member_keys = ['profile_id', 'assay_method'] if composition else ['profile_id', 'method_id']
        if composition and 'assay_method' not in group:
            group = group.assign(assay_method='unspecified')
        for _, member in group.groupby(member_keys, dropna=False, sort=False):
            item = member.iloc[0]
            exact = member[member['qualifier'].fillna('').eq('')]
            entries.append(dict(profile_id=item['profile_id'], label=item['sample_label'],
                                material_class=item['material_class'], state=item['state'], paper=item['paper'],
                                assay=item.get('assay', ''), method=item['method_name'],
                                mass_denominator=item.get('mass_denominator', 'unspecified'),
                                moisture_basis=item.get('moisture_basis', 'unspecified'),
                                measurement_state_note=item.get('measurement_state_note', ''),
                                conditions=int(member['condition'].nunique()) if not composition else 0,
                                records=len(member), record_ids=member['id'].tolist(),
                                minimum=float(exact['analysis_value'].min()) if len(exact) else None,
                                maximum=float(exact['analysis_value'].max()) if len(exact) else None))
        syntheses = []
        for _, pool in numeric.dropna(subset=['pool_key']).groupby('pool_key', sort=False):
            if pool['paper'].nunique() < 2:
                continue
            # Repeated reports/assays are not independent samples; publications receive equal default weights.
            sample_means = pool.groupby(['paper', 'profile_id'])['analysis_value'].mean()
            study_means = sample_means.groupby(level='paper').mean()
            basis = filters.get('summary_basis', 'study')
            values = (study_means if basis == 'study' else sample_means).to_numpy(dtype=float)
            syntheses.append(dict(mean=float(np.mean(values)), median=float(np.median(values)),
                                  minimum=float(np.min(values)), maximum=float(np.max(values)),
                                  sd=float(np.std(values, ddof=1)), statistical_units=len(values),
                                  studies=int(pool['paper'].nunique()), sample_groups=int(pool['profile_id'].nunique()),
                                  summary_basis=basis, record_ids=pool['id'].tolist()))
        issues = sorted({issue for values in group['issues'] for issue in values})
        for field, label in [('material_class', 'Material forms'), ('preparation', 'Preparation states'),
                             ('assay_method', 'Assay methods'), ('mass_denominator', 'Mass denominators')]:
            if field in group and len({signature(value) for value in group[field]}) > 1:
                issues.append(label + ' differ and remain separate')
        if group['paper'].nunique() < 2:
            issues.insert(0, 'Only one publication contributes to this comparison')
        elif not syntheses and not issues:
            issues.append('No matching measurement context spans multiple publications')
        summaries.append(dict(label=first['chemistry'], chemistry=first['chemistry'], target=first['target'],
                              metric=first['metric'], unit=first['analysis_unit'], family=first['family'],
                              records=len(group), studies=int(group['paper'].nunique()),
                              sample_groups=int(group['profile_id'].nunique()), entries=entries,
                              minimum=float(numeric['analysis_value'].min()) if len(numeric) else None,
                              maximum=float(numeric['analysis_value'].max()) if len(numeric) else None,
                              mean=None, median=None, sd=None, syntheses=syntheses, pooling_issues=issues,
                              record_ids=group['id'].tolist()))
    return summaries
