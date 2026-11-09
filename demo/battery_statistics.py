"""Compare reviewed samples; pool only matching, sufficiently described contexts."""
import json
from collections import defaultdict
from statistics import fmean, median, stdev


def signature(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


def pooling_context(row, profile, composition):
    """Names and missing attributes never establish comparability."""
    issues = []
    if not profile.get('chemistry_resolved'):
        issues.append('Battery chemistry is mixed or unresolved')
    if not profile.get('material_class') or not profile.get('preparation') or not profile.get('feedstock_history'):
        issues.append('Material identity or preparation is not fully classified')
    context = {key: profile.get(key) for key in ('component', 'chemistry', 'material_class', 'feedstock_history', 'size_fraction_mm')}
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


def group_rows(rows, fields, sort=False):
    groups = defaultdict(list)
    for row in rows:
        groups[tuple(row.get(field) for field in fields)].append(row)
    if sort:
        keys = sorted(groups, key=lambda key: tuple((value is None, value or '') for value in key))
        return [groups[key] for key in keys]
    return list(groups.values())


def summarize(rows, profiles, methods, filters):
    if filters['template'] == 'routes':
        return []
    composition = filters['template'] in ('composition', 'rich')
    records = []
    for row in rows:
        profile = profiles[row['profile_id']]
        method = methods.get(row.get('method_id'), {})
        key, issues = pooling_context(row, profile, composition)
        records.append(dict(row, component=profile.get('component', ''), chemistry=profile['chemistry'], stream=profile['stream'],
                            material_class=profile.get('material_class', 'unspecified'),
                            sample_label=profile['label'], state=profile['state'],
                            family=method.get('family', ''), method_name=method.get('name', ''),
                            target=row.get('element') if composition else row['material'],
                            metric='Elemental mass content' if composition else row['metric'],
                            analysis_unit=(row.get('display_unit') or row['unit']) if composition else '%',
                            analysis_value=float(row['value']),
                            measurement_id=row.get('observation_id') or row['id'], pool_key=key, issues=issues))
    if not records:
        return []
    seen, distinct = set(), []
    for row in records:
        key = (row['profile_id'], row['measurement_id'])
        if key not in seen:
            distinct.append(row)
            seen.add(key)
    grouping = ['component', 'chemistry', 'target', 'metric', 'analysis_unit']
    if not composition:
        grouping += ['family']
    if filters.get('summary_level') == 'sample':
        grouping += ['profile_id']
    summaries = []
    for group in group_rows(distinct, grouping, sort=True):
        first = group[0]
        numeric = [row for row in group if row.get('qualifier') in (None, '')]
        entries = []
        member_keys = ['profile_id', 'assay_method'] if composition else ['profile_id', 'method_id']
        if composition and not any('assay_method' in row for row in group):
            group = [dict(row, assay_method='unspecified') for row in group]
        for member in group_rows(group, member_keys):
            item = member[0]
            exact = [row['analysis_value'] for row in member if row.get('qualifier') in (None, '')]
            entries.append(dict(profile_id=item['profile_id'], label=item['sample_label'],
                                material_class=item['material_class'], state=item['state'], paper=item['paper'],
                                assay=item.get('assay', ''), method=item['method_name'],
                                mass_denominator=item.get('mass_denominator', 'unspecified'),
                                moisture_basis=item.get('moisture_basis', 'unspecified'),
                                measurement_state_note=item.get('measurement_state_note', ''),
                                conditions=len({row['condition'] for row in member if row.get('condition') is not None}) if not composition else 0,
                                records=len(member), record_ids=[row['id'] for row in member],
                                minimum=min(exact) if exact else None,
                                maximum=max(exact) if exact else None))
        syntheses = []
        for pool in group_rows([row for row in numeric if row['pool_key'] is not None], ['pool_key']):
            if len({row['paper'] for row in pool}) < 2:
                continue
            # Repeated reports/assays are not independent samples; publications receive equal default weights.
            sample_means = [dict(paper=sample[0]['paper'], value=fmean(row['analysis_value'] for row in sample))
                            for sample in group_rows(pool, ['paper', 'profile_id'], sort=True)]
            study_means = [fmean(row['value'] for row in study)
                           for study in group_rows(sample_means, ['paper'], sort=True)]
            basis = filters.get('summary_basis', 'study')
            values = study_means if basis == 'study' else [row['value'] for row in sample_means]
            syntheses.append(dict(mean=fmean(values), median=median(values),
                                  minimum=min(values), maximum=max(values),
                                  sd=stdev(values), statistical_units=len(values),
                                  studies=len({row['paper'] for row in pool}), sample_groups=len({row['profile_id'] for row in pool}),
                                  summary_basis=basis, record_ids=[row['id'] for row in pool]))
        issues = sorted({issue for row in group for issue in row['issues']})
        for field, label in [('material_class', 'Material forms'), ('preparation', 'Preparation states'),
                             ('assay_method', 'Assay methods'), ('mass_denominator', 'Mass denominators')]:
            if any(field in row for row in group) and len({signature(row.get(field)) for row in group}) > 1:
                issues.append(label + ' differ and remain separate')
        if len({row['paper'] for row in group}) < 2:
            issues.insert(0, 'Only one publication contributes to this comparison')
        elif not syntheses and not issues:
            issues.append('No matching measurement context spans multiple publications')
        summaries.append(dict(label=first['chemistry'], component=first['component'], chemistry=first['chemistry'], target=first['target'],
                              metric=first['metric'], unit=first['analysis_unit'], family=first['family'],
                              records=len(group), studies=len({row['paper'] for row in group}),
                              sample_groups=len({row['profile_id'] for row in group}), entries=entries,
                              minimum=min(row['analysis_value'] for row in numeric) if numeric else None,
                              maximum=max(row['analysis_value'] for row in numeric) if numeric else None,
                              mean=None, median=None, sd=None, syntheses=syntheses, pooling_issues=issues,
                              record_ids=[row['id'] for row in group]))
    return summaries
