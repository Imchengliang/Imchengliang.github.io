/* Reviewed sample groups and queries over frozen observations. */
'use strict';
const BatteryOverview = (() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const format = value => Number(value).toLocaleString('en', {maximumSignificantDigits: 5});
  const unique = values => [...new Set(values)];
  const count = (value, singular, plural = singular + 's') => `${value} ${value === 1 ? singular : plural}`;
  const extractionMetrics = new Set(['leaching', 'recovery', 'dissolution', 'extraction', 'recovery_rate', 'released_efficiency']);

  function hasAbsentReagent(row, method, reagent) {
    const clean = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ');
    const escaped = clean(reagent).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escaped) return false;
    const wording = clean([row.condition, row.experiment_group, method.name].join(' '));
    const before = new RegExp('\\b(?:without|no|absence of|free of)\\s+(?:added\\s+)?' + escaped + '(?![a-z0-9])', 'i');
    const after = new RegExp(escaped + '\\s*[-–]\\s*free\\b', 'i');
    return before.test(wording) || after.test(wording);
  }

  function query(data, filters) {
    const profiles = new Map(data.profiles.filter(profile =>
      (!filters.component || profile.component === filters.component) &&
      (!filters.stream || profile.stream === filters.stream) &&
      (!filters.chemistry || profile.chemistry === filters.chemistry) &&
      (!filters.material_class || profile.material_class === filters.material_class) &&
      (!filters.origin || profile.origin === filters.origin)
    ).map(profile => [profile.id, profile]));
    const methods = new Map(data.methods.filter(method => profiles.has(method.profile_id) &&
      (!filters.method || method.family === filters.method)).map(method => [method.id, method]));
    if (['composition', 'rich'].includes(filters.template)) {
      if (filters.template === 'rich' && !filters.content_unit) throw Error('Select a reported unit before setting a minimum content.');
      return data.compositions.filter(row => profiles.has(row.profile_id) &&
        (!filters.target || row.element === filters.target) &&
        (!filters.content_unit || (row.display_unit || row.unit) === filters.content_unit) &&
        (filters.template !== 'rich' || (!row.qualifier && Number(row.value) >= filters.min_content))
      ).sort((left, right) => (left.display_unit || left.unit).localeCompare(right.display_unit || right.unit) || Number(right.value) - Number(left.value));
    }
    let results = data.results.filter(row => methods.has(row.method_id) &&
      (!filters.target || row.material === filters.target) &&
      (filters.template === 'routes' || ['time', 'concentration'].every(key =>
        !filters[key + '_condition'] || (row[key + '_conditions'] || []).includes(filters[key + '_condition']))));
    if (filters.co_target) {
      const experiments = new Set(data.results.filter(row => row.material === filters.co_target && row.experiment_key).map(row => row.experiment_key));
      results = results.filter(row => row.material !== filters.co_target && row.experiment_key && experiments.has(row.experiment_key));
    }
    if (filters.template === 'routes') {
      const ids = new Set(results.map(row => row.method_id));
      return [...methods.values()].filter(method => !(filters.target || filters.co_target) || ids.has(method.id));
    }
    if (filters.require_absence || filters.template === 'without') {
      results = results.filter(row => hasAbsentReagent(row, methods.get(row.method_id), filters.reagent));
    }
    if (filters.template === 'performance') {
      return results.filter(row => extractionMetrics.has(row.metric) &&
        (!row.qualifier || ['>', '≥', '>='].includes(row.qualifier)) &&
        Number(row.value) >= filters.min_result && (filters.max_temperature == null ||
        (row.temperature_upper != null && row.temperature_upper <= filters.max_temperature)));
    }
    return results;
  }

  function emptyCoverage(data, filters) {
    const context = {...filters, target: '', co_target: '', method: '', time_condition: '', concentration_condition: '', require_absence: false};
    const composition = ['composition', 'rich'].includes(filters.template);
    const records = query(data, {...context, template: composition ? 'composition' : 'compare'}).length;
    const treatments = query(data, {...context, template: 'routes'}).length;
    let reason;
    if (filters.template === 'routes' && treatments) {
      reason = `This selection has ${count(treatments, 'reviewed treatment')}. No numeric percentage result matches the selected target.`;
    } else if (!records) {
      reason = composition
        ? 'No elemental mass-composition records are available for these sample groups.'
        : `These sample groups have ${count(treatments, 'treatment')}, with no numeric percentage results available.`;
    } else {
      reason = `This selection has ${count(records, composition ? 'elemental mass-composition record' : 'numeric percentage result')}. No results match the selected target and conditions.`;
    }
    return {reason, treatments};
  }

  function rangeText(summary) {
    if (summary.minimum === null) return 'See individual records';
    return `${format(summary.minimum)}${summary.minimum === summary.maximum ? '' : '–' + format(summary.maximum)} ${escape(summary.unit)}`;
  }

  // Keep each condition attached to its reported value, including in compact previews.
  function conditionSummary(records) {
    if (!records.some(row => (row.condition || '').trim())) return '<p class="battery-condition">Conditions not recorded.</p>';
    const item = row => `<p><b>${escape(row.qualifier || '')}${escape(row.value)} ${escape(row.display_unit || row.unit)}</b> · ${escape(row.condition || 'Conditions not recorded')}</p>`;
    return `<div class="battery-condition"><small>${records.length > 1 ? 'Conditions across these records' : 'Reported conditions'}</small>
      <div class="battery-condition-preview">${records.slice(0, 2).map(item).join('')}</div>
      <details><summary>Full value–condition pairs (${records.length})</summary>${records.map(item).join('')}</details></div>`;
  }

  // Translate optional controls into the fixed server queries.
  function overviewParameters(filters, workspace, mode) {
    const composition = workspace === 'composition';
    const template = composition ? 'composition'
      : mode === 'summary' || filters.co_target ? 'compare' : 'routes';
    return {template, component: filters.component || '', stream: filters.stream, chemistry: composition ? filters.chemistry : '', origin: '',
      material_class: '', content_unit: '',
      target: filters.target, co_target: composition ? '' : filters.co_target || '', method: composition ? '' : filters.method,
      min_content: 0, min_result: 0, max_temperature: null,
      reagent: '', require_absence: false,
      time_condition: '', concentration_condition: '',
      statistics: mode === 'summary', summary_level: filters.summary_level, summary_basis: filters.summary_basis};
  }

  function mount(container, data, actions) {
    const profiles = new Map(data.profiles.map(profile => [profile.id, profile]));
    const methods = new Map(data.methods.map(method => [method.id, method]));
    const defaults = {component: '', stream: '', target: '', co_target: '', chemistry: '', method: '',
      summary_level: 'context', summary_basis: 'study'};
    const controls = {...defaults};
    let workspace = 'composition', mode = 'records';
    const options = (values, title) => `<option value="">${escape(title)}</option>` + values.map(([value, label]) => `<option value="${escape(value)}">${escape(label)}</option>`).join('');
    const available = (labels, field, profiles = data.profiles) => Object.entries(labels).filter(([value]) => profiles.some(profile => profile[field] === value));
    const helpText = {
      component: 'The type of item the sample comes from, such as a battery, printed circuit board or magnet.',
      stream: 'The form of the material entering a treatment, such as a whole battery, electrode powder, separated fraction or leachate.',
      target: 'The element or material whose content or treatment result you want to explore.',
      co_target: 'Another target reported for the same sample, treatment and experimental conditions. Choose a Target first.',
      chemistry: 'The chemistry or material system of the sample or its source, such as LFP batteries or NdFeB magnets.',
      method: 'A group of related treatment methods, such as acid leaching, precipitation or magnetic separation.',
    };
    const field = (name, label, content, scope = '') => `<div class="battery-filter"${scope ? ` data-workspace="${scope}"` : ''}>
      <div class="battery-filter-heading"><label for="filter-${name}">${escape(label)}</label>
      <details class="filter-help"><summary aria-label="About ${escape(label)}" aria-controls="help-${name}">?</summary><p id="help-${name}">${escape(helpText[name])}</p></details></div>
      ${content.replace('<select', `<select id="filter-${name}" name="${name}" aria-describedby="help-${name}"`).replace('<input', `<input id="filter-${name}" name="${name}" aria-describedby="help-${name}"`)}</div>`;
    container.innerHTML = `
      <div class="battery-heading"><div><h2>Explore feedstocks</h2>
      <p>Explore reported composition and treatment results, with links to their sources.</p></div></div>
      <section class="battery-query-panel">
      <div class="battery-switch" aria-label="Workspace"><button type="button" data-workspace-tab="composition">Composition</button><button type="button" data-workspace-tab="treatments">Treatment routes</button></div>
      <form class="battery-query-form">
      <div class="battery-primary-filters">
      ${field('component', 'Component', `<select>${options(available(data.components, 'component'), 'All components')}</select>`)}
      ${field('stream', 'Feedstock', `<select>${options(available(data.streams, 'stream'), 'All feedstocks')}</select>`)}
      ${field('target', 'Target', '<select></select>')}
      ${field('co_target', 'Co-existing target', '<select></select>', 'treatments')}
      ${field('chemistry', 'Chemistry', `<select>${options(available(data.chemistries, 'chemistry'), 'All chemistries')}</select>`, 'composition')}
      ${field('method', 'Treatment family', `<select>${options(unique(data.methods.map(method => method.family)).sort().map(family => [family, family]), 'All treatments')}</select>`, 'treatments')}
      <button type="button" class="battery-reset">Reset</button></div>
      </form></section>
      <section class="battery-results" aria-live="polite"><div class="battery-results-heading"><div><h3></h3><span class="battery-result-count"></span></div>
      <div class="battery-switch" aria-label="Result view"><button type="button" data-mode="records">Records</button><button type="button" data-mode="summary">Compare & summarize</button></div></div>
      <p class="battery-results-note"></p><div class="battery-table"></div></section>
      <details class="battery-audit"><summary>Source coverage</summary><p>${data.audit.length} studies · ${data.profiles.length} sample groups. Elemental mass-composition data from ${unique(data.compositions.map(row => row.paper)).length} studies.</p>
      <div class="battery-audit-table"></div></details>`;
    for (const help of container.querySelectorAll('.filter-help')) {
      const trigger = help.querySelector('summary');
      help.addEventListener('pointerenter', () => { help.open = true; });
      help.addEventListener('pointerleave', () => { if (!help.contains(document.activeElement)) help.open = false; });
      trigger.addEventListener('click', event => { event.preventDefault();trigger.focus();help.open = true; });
      trigger.addEventListener('focus', () => { help.open = true; });
      help.addEventListener('focusout', event => { if (!help.contains(event.relatedTarget)) help.open = false; });
      help.addEventListener('keydown', event => { if (event.key === 'Escape') { help.open = false;event.stopPropagation(); } });
    }
    const form = container.querySelector('form');
    let rowsById = new Map(), request = 0;
    function actionButtons(row) {
      rowsById.set(row.id, row);
      return `<div class="battery-row-actions"><button type="button" data-action="graph" data-row="${escape(row.id)}">Graph</button><button type="button" data-action="source" data-row="${escape(row.id)}">Source</button></div>`;
    }
    function coResults(records) {
      if (!controls.co_target) return '';
      const experiments = new Set(records.map(row => row.experiment_key).filter(Boolean));
      const peers = data.results.filter(row => row.material === controls.co_target && experiments.has(row.experiment_key));
      if (!peers.length) return '';
      return `<details><summary>Co-existing ${escape(controls.co_target)} results (${peers.length})</summary>${peers.map(row =>
        `<p><strong>${escape(row.material)} · ${escape(row.qualifier || '')}${escape(row.value)} ${escape(row.unit)}</strong></p>${actionButtons(row)}`).join('')}</details>`;
    }
    function contributingRecords(summary, records) {
      return `<details><summary>Records used (${summary.record_ids.length})</summary>${summary.record_ids.map(id => {
        const row = records.get(id);
        return `<p>${escape(row.value)} ${escape(row.display_unit || row.unit)} · ${escape(row.paper)}</p><small>${escape(row.condition || row.assay || '')}</small>${actionButtons(row)}`;
      }).join('')}</details>`;
    }
    function sampleCell(row) {
      const profile = profiles.get(row.profile_id);
      return `<strong>${escape(profile.label)}</strong><small>${escape(data.chemistries[profile.chemistry])} · ${escape(profile.state)}</small>`;
    }
    function paperCell(row) {
      return `<span class="battery-paper" title="${escape(row.paper)}">${escape(row.paper)}</span>${actionButtons(row)}`;
    }
    function comparisonRows(summary, contributing, composition) {
      const unit = escape(summary.unit);
      const statistics = summary.syntheses.map(synthesis => `<p>${count(synthesis.studies, 'study', 'studies')} · ${count(synthesis.sample_groups, 'sample group')}<br>Mean ${format(synthesis.mean)} ${unit} · Median ${format(synthesis.median)} ${unit}<br><span title="Standard deviation of publication-level means">SD ${format(synthesis.sd)} ${unit}</span></p>${contributingRecords(synthesis, contributing)}`).join('');
      const statisticsPanel = summary.syntheses.length
        ? `<details><summary>Comparable-study statistics</summary>${statistics}</details>`
        : '';
      const heading = `<tr class="battery-comparison-group"><td colspan="4"><strong>${summary.component ? escape(data.components[summary.component]) + ' · ' : ''}${escape(data.chemistries[summary.chemistry])} · ${escape(summary.target)}</strong>
        <small>${escape(summary.metric)}${summary.family ? ' · ' + escape(summary.family) : ''} · ${count(summary.studies, 'study', 'studies')} · ${count(summary.sample_groups, 'sample group')}${summary.records > 1 ? ' · Observed range ' + rangeText(summary) : ''}</small>
        ${statisticsPanel}</td></tr>`;
      return [heading, ...summary.entries.map(entry => {
        const records = entry.record_ids.map(id => contributing.get(id));
        const first = records[0], profile = profiles.get(entry.profile_id);
        const value = records.length === 1 ? `${escape(first.qualifier || '')}${escape(first.value)} ${unit}` : rangeText({...entry, unit: summary.unit});
        const basis = data.comparison_vocabularies;
        const context = composition
          ? `${escape(entry.assay)}<details><summary>Measurement basis</summary>${escape(basis.mass_denominator[entry.mass_denominator])}<br>${escape(basis.moisture_basis[entry.moisture_basis])}${entry.measurement_state_note ? '<p>' + escape(entry.measurement_state_note) + '</p>' : ''}</details>`
          : `<strong>${escape(entry.method)}</strong>${conditionSummary(records)}`;
        return `<tr><td><strong>${escape(data.material_classes[entry.material_class])}</strong><small>${escape(entry.label)}</small><small>${escape(profile.state)}</small></td>
          <td><strong>${value}</strong>${composition ? '' : coResults(records)}${records.length > 1 ? `<small>${count(records.length, 'reported value')} · descriptive range</small>` : ''}</td>
          <td>${context}</td><td>${paperCell(first)}${contributingRecords(entry, contributing)}</td></tr>`;
      })];
    }
    function table(headers, body) {
      return `<div class="battery-table-scroll"><table><thead><tr>${headers.map(header => `<th>${escape(header)}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div>`;
    }
    async function render() {
      const current = ++request;
      rowsById = new Map(data.profiles.map(profile => [profile.id, profile]));
      const composition = workspace === 'composition';
      const componentProfiles = data.profiles.filter(profile => !controls.component || profile.component === controls.component);
      const feedstocks = available(data.streams, 'stream', componentProfiles);
      if (!feedstocks.some(([value]) => value === controls.stream)) controls.stream = '';
      form.elements.stream.innerHTML = options(feedstocks, 'All feedstocks');
      const selectedProfiles = componentProfiles.filter(profile => !controls.stream || profile.stream === controls.stream);
      const chemistries = available(data.chemistries, 'chemistry', selectedProfiles);
      if (!chemistries.some(([value]) => value === controls.chemistry)) controls.chemistry = '';
      form.elements.chemistry.innerHTML = options(chemistries, 'All chemistries');
      const profileIds = new Set(selectedProfiles.filter(profile => !composition || !controls.chemistry || profile.chemistry === controls.chemistry).map(profile => profile.id));
      const relevantMethods = data.methods.filter(method => profileIds.has(method.profile_id));
      const methodIds = new Set(relevantMethods.map(method => method.id));
      const relevantResults = data.results.filter(row => methodIds.has(row.method_id));
      const families = unique(relevantMethods.map(method => method.family)).sort();
      if (!families.includes(controls.method)) controls.method = '';
      form.elements.method.innerHTML = options(families.map(value => [value, value]), 'All treatments');
      const targets = unique(composition ? data.compositions.filter(row => profileIds.has(row.profile_id)).map(row => row.element) : relevantResults.map(row => row.material)).sort();
      if (!targets.includes(controls.target)) controls.target = '';
      const target = form.elements.target;
      target.innerHTML = options(targets.map(value => [value, value]), 'All targets');
      const experiments = new Set(relevantResults.filter(row => row.material === controls.target && row.experiment_key).map(row => row.experiment_key));
      const coTargets = unique(relevantResults.filter(row => row.material !== controls.target && row.experiment_key && experiments.has(row.experiment_key)).map(row => row.material)).sort();
      if (!coTargets.includes(controls.co_target)) controls.co_target = '';
      form.elements.co_target.disabled = !controls.target;
      form.elements.co_target.innerHTML = options(coTargets.map(value => [value, value]), controls.target ? 'Any additional target' : 'Select a Target first');
      for (const [name, value] of Object.entries(controls)) if (form.elements[name]) form.elements[name].value = value;
      form.classList.toggle('composition', composition);
      container.querySelectorAll('[data-workspace]').forEach(label => { label.hidden = label.dataset.workspace !== workspace; });
      container.querySelectorAll('[data-workspace-tab], [data-mode]').forEach(button => {
        const active = button.dataset.workspaceTab ? button.dataset.workspaceTab === workspace : button.dataset.mode === mode;
        button.classList.toggle('active', active);button.setAttribute('aria-pressed', active);
      });
      const parameters = overviewParameters(controls, workspace, mode);
      const routes = parameters.template === 'routes';
      container.querySelector('.battery-results-heading h3').textContent = mode === 'summary' ? (composition ? 'Compare measured feedstocks' : 'Compare treatment evidence') : composition ? 'Reported composition' : routes ? 'Studied treatments' : 'Matching experiments';
      const counter = container.querySelector('.battery-result-count');
      counter.textContent = 'Loading…';
      const output = container.querySelector('.battery-table');output.innerHTML = '';
      container.querySelector('.battery-results-note').textContent = '';
      let response;
      try {
        response = actions.query ? await actions.query(parameters, message => { if (current === request) counter.textContent = message; }) : {rows: query(data, parameters), statistics: []};
      } catch (error) {
        if (current !== request) return;
        counter.textContent = 'Query unavailable';
        container.querySelector('.battery-results-note').textContent = error.message;
        actions.error(error);return;
      }
      if (current !== request) return;
      const rows = response.rows;
      counter.textContent = `${count(rows.length, routes ? 'treatment' : 'record')} · ${count(unique(rows.map(row => row.paper)).length, 'study', 'studies')}`;
      let headers, body;
      if (mode === 'summary') {
        container.querySelector('.battery-results-note').textContent = 'Compare reported values alongside their sample types, units and conditions.';
        const contributing = new Map(rows.map(row => [row.id, row]));
        headers = ['Measured material', 'Reported value / range', 'Measurement context', 'Source evidence'];
        body = response.statistics.flatMap(summary => comparisonRows(summary, contributing, composition));
      } else if (composition) {
        container.querySelector('.battery-results-note').textContent = 'Composition refers to the listed sample. Values and units are shown as reported.';
        headers = ['Measured feedstock', 'Element', 'Content', 'Source'];
        body = rows.map(row => `<tr><td>${sampleCell(row)}</td><td>${escape(row.element)}</td><td><strong>${escape(row.qualifier || '')}${escape(row.value)}${row.uncertainty ? ' ± ' + escape(row.uncertainty) : ''} ${escape(row.display_unit || row.unit)}</strong><details><summary>Measurement details</summary><p>${escape(row.assay)}</p></details></td><td>${paperCell(row)}</td></tr>`);
      } else if (routes) {
        container.querySelector('.battery-results-note').textContent = 'Treatments studied for these feedstocks. Add result filters to inspect matching experiments, or open Compare & summarize to compare reported results.';
        headers = ['Study feedstock', 'Treatment', 'Reported targets', 'Source'];
        body = rows.map(row => `<tr><td>${sampleCell(row)}</td><td><strong>${escape(row.name)}</strong><small>${escape(row.family)}</small></td><td>${escape(unique(data.results.filter(result => result.method_id === row.id).map(result => result.material)).join(', ')) || 'See study'}</td><td>${paperCell(row)}</td></tr>`);
      } else {
        container.querySelector('.battery-results-note').textContent = 'Results match the selected experimental conditions.';
        headers = ['Study feedstock', 'Treatment', 'Reported result', 'Conditions', 'Source'];
        body = rows.map(row => {
          const method = methods.get(row.method_id);
          return `<tr><td>${sampleCell(row)}</td><td><strong>${escape(method.name)}</strong><small>${escape(method.family)}</small></td><td><strong>${escape(row.material)} · ${escape(row.qualifier || '')}${escape(row.value)} ${escape(row.unit)}</strong><small>${escape(row.metric.replaceAll('_', ' '))}</small>${coResults([row])}</td><td>${row.temperature_upper == null ? '' : `Temperature ≤ ${format(row.temperature_upper)} °C`}<details><summary>Conditions</summary><p>${escape(row.condition || 'See source record.')}</p></details></td><td>${paperCell(row)}</td></tr>`;
        });
      }
      const coverage = rows.length ? null : emptyCoverage(data, parameters);
      output.innerHTML = body.length ? table(headers, body) : `<div class="battery-empty"><h4>${rows.length ? 'No unqualified values for this summary.' : 'No reviewed records match these filters.'}</h4><p>${escape(coverage?.reason || 'Open Records to inspect the individual reported values.')}</p><div class="battery-row-actions">${coverage?.treatments ? `<button type="button" data-browse-treatments>Browse all ${coverage.treatments} treatments for this selection</button>` : ''}<button type="button" data-show-coverage>View source coverage</button></div></div>`;
      const visibleProfiles = data.profiles.filter(profile => (!parameters.stream || profile.stream === parameters.stream) && (!parameters.chemistry || profile.chemistry === parameters.chemistry) && (!parameters.origin || profile.origin === parameters.origin) && (!parameters.material_class || profile.material_class === parameters.material_class));
      container.querySelector('.battery-audit-table').innerHTML = table(['Study', 'Reviewed sample groups', 'Elemental mass records', 'Review notes'], data.audit.filter(study => visibleProfiles.some(profile => profile.paper === study.paper)).map(study => `<tr><td>${escape(study.paper)}</td><td>${visibleProfiles.filter(profile => profile.paper === study.paper).map(profile => `${escape(profile.label)} ${actionButtons(profile)}`).join('<br>')}</td><td>${study.composition_records}</td><td>${study.review_notes.map(escape).join(' ')}</td></tr>`));
    }
    form.addEventListener('change', () => {
      for (const [name, value] of new FormData(form)) controls[name] = value;
      render();
    });
    form.addEventListener('submit', event => { event.preventDefault();render(); });
    container.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.workspaceTab) { workspace = button.dataset.workspaceTab;render(); }
      if (button.dataset.mode) { mode = button.dataset.mode;render(); }
      if (button.hasAttribute('data-browse-treatments')) {
        workspace = 'treatments';mode = 'records';
        Object.assign(controls, defaults, {component: controls.component, stream: controls.stream, chemistry: controls.chemistry});render();
      }
      if (button.hasAttribute('data-show-coverage')) {
        const audit = container.querySelector('.battery-audit');audit.open = true;audit.scrollIntoView({block: 'start', behavior: 'smooth'});
      }
      if (button.classList.contains('battery-reset')) { Object.assign(controls, defaults);render(); }
      if (button.dataset.action) {
        button.disabled = true;
        try { await actions.open(rowsById.get(button.dataset.row), button.dataset.action, button); }
        catch (error) { actions.error(error); }
        finally { button.disabled = false; }
      }
    });
    render();
  }
  return {mount, query, hasAbsentReagent, emptyCoverage, overviewParameters, conditionSummary};
})();
