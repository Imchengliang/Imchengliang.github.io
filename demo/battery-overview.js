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
      (!filters.stream || profile.stream === filters.stream) &&
      (!filters.chemistry || profile.chemistry === filters.chemistry) &&
      (!filters.origin || profile.origin === filters.origin)
    ).map(profile => [profile.id, profile]));
    const methods = new Map(data.methods.filter(method => profiles.has(method.profile_id) &&
      (!filters.method || method.family === filters.method)).map(method => [method.id, method]));
    if (['composition', 'rich'].includes(filters.template)) {
      return data.compositions.filter(row => profiles.has(row.profile_id) &&
        (!filters.target || row.element === filters.target) &&
        (filters.template !== 'rich' || (!row.qualifier && row.wt_percent >= filters.min_content))
      ).sort((left, right) => right.wt_percent - left.wt_percent);
    }
    let results = data.results.filter(row => methods.has(row.method_id) &&
      (!filters.target || row.material === filters.target) &&
      (filters.template === 'routes' || ['time', 'concentration'].every(key =>
        !filters[key + '_condition'] || (row[key + '_conditions'] || []).includes(filters[key + '_condition']))));
    if (filters.template === 'routes') {
      const ids = new Set(results.map(row => row.method_id));
      return [...methods.values()].filter(method => !filters.target || ids.has(method.id));
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
    const context = {...filters, target: '', method: '', time_condition: '', concentration_condition: '', require_absence: false};
    const composition = ['composition', 'rich'].includes(filters.template);
    const records = query(data, {...context, template: composition ? 'composition' : 'compare'}).length;
    const treatments = query(data, {...context, template: 'routes'}).length;
    let reason;
    if (filters.template === 'routes' && treatments) {
      reason = `This selection has ${count(treatments, 'reviewed treatment')}. The current target filter requires a reviewed numeric percentage result for that material.`;
    } else if (!records) {
      reason = composition
        ? 'These sample groups have no reviewed elemental mass-composition records in this overview. Other measurement bases may be available in their source studies.'
        : `These sample groups have ${count(treatments, 'reviewed treatment')}, with no reviewed numeric percentage results in this overview. Source studies may report other measurements or qualitative outputs.`;
    } else {
      reason = `This selection has ${count(records, composition ? 'elemental mass-composition record' : 'numeric percentage result')}. The selected target and query conditions yield no matches.`;
    }
    return {reason, treatments};
  }

  function rangeText(summary) {
    if (summary.minimum === null) return 'See individual records';
    return `${format(summary.minimum)}${summary.minimum === summary.maximum ? '' : '–' + format(summary.maximum)} ${escape(summary.unit)}`;
  }

  // Translate optional controls into the fixed server queries.
  function overviewParameters(filters, workspace, mode) {
    const composition = workspace === 'composition';
    const limit = key => filters[key] === '' || filters[key] == null ? null : Number(filters[key]);
    const resultLimits = limit('min_result') !== null || limit('max_temperature') !== null;
    const reagent = (filters.reagent || '').trim();
    const template = composition ? (limit('min_content') === null ? 'composition' : 'rich')
      : resultLimits ? 'performance' : reagent ? 'without'
      : mode === 'summary' || filters.time_condition || filters.concentration_condition ? 'compare' : 'routes';
    return {template, stream: filters.stream, chemistry: filters.chemistry, origin: filters.origin,
      target: filters.target, method: composition ? '' : filters.method,
      min_content: limit('min_content') ?? 0, min_result: limit('min_result') ?? 0,
      max_temperature: composition ? null : limit('max_temperature'),
      reagent: reagent || 'H2O2', require_absence: !composition && !!reagent,
      time_condition: composition ? '' : filters.time_condition,
      concentration_condition: composition ? '' : filters.concentration_condition,
      statistics: mode === 'summary', summary_level: filters.summary_level, summary_basis: filters.summary_basis};
  }

  function mount(container, data, actions) {
    const profiles = new Map(data.profiles.map(profile => [profile.id, profile]));
    const methods = new Map(data.methods.map(method => [method.id, method]));
    const defaults = {stream: '', target: '', chemistry: '', origin: '', method: '', min_content: '', min_result: '',
      max_temperature: '', reagent: '', time_condition: '', concentration_condition: '', summary_level: 'sample', summary_basis: 'record'};
    const controls = {...defaults};
    let workspace = 'composition', mode = 'records', advanced = false;
    const options = (values, title) => `<option value="">${escape(title)}</option>` + values.map(([value, label]) => `<option value="${escape(value)}">${escape(label)}</option>`).join('');
    const field = (name, label, content, scope = '') => `<label${scope ? ` data-workspace="${scope}"` : ''}>${escape(label)}${content.replace('<select', `<select name="${name}"`).replace('<input', `<input name="${name}"`)}</label>`;
    const number = '<input type="number" min="0" max="100" step="0.1" placeholder="Any">';
    container.innerHTML = `
      <div class="battery-heading"><div><div class="eyebrow">BATTERY RESOURCES</div><h2>Explore battery feedstocks</h2>
      <p>Explore reported composition and treatment results, with links to their sources.</p></div></div>
      <section class="battery-query-panel">
      <div class="battery-switch" aria-label="Workspace"><button type="button" data-workspace-tab="composition">Composition</button><button type="button" data-workspace-tab="treatments">Treatment routes</button></div>
      <form class="battery-query-form">
      <div class="battery-primary-filters">
      ${field('stream', 'Feedstock', `<select>${options(Object.entries(data.streams), 'All feedstocks')}</select>`)}
      ${field('target', 'Target', '<select></select>')}
      <button type="button" class="battery-more" aria-expanded="false" aria-controls="battery-advanced">More filters</button>
      <button type="button" class="battery-reset">Reset</button></div>
      <div class="battery-advanced" id="battery-advanced" hidden>
      ${field('chemistry', 'Battery chemistry', `<select>${options(Object.entries(data.chemistries), 'All chemistries')}</select>`)}
      ${field('origin', 'Feedstock source', `<select>${options(Object.entries(data.origins), 'All sources')}</select>`)}
      ${field('min_content', 'Minimum content (wt%)', number, 'composition')}
      ${field('method', 'Treatment family', `<select>${options(unique(data.methods.map(method => method.family)).sort().map(family => [family, family]), 'All treatments')}</select>`, 'treatments')}
      ${field('min_result', 'Minimum recovery / extraction (%)', number, 'treatments')}
      ${field('max_temperature', 'Maximum reported temperature (°C)', '<input type="number" step="1" placeholder="Any">', 'treatments')}
      ${['time', 'concentration'].map(key => field(key + '_condition', 'Reported ' + key + ' condition', `<select>${options(unique(data.results.flatMap(row => row[key + '_conditions'] || [])).sort().map(value => [value, value]), 'Any reported condition')}</select>`, 'treatments')).join('')}
      ${field('reagent', 'Reagent explicitly absent', '<input type="text" placeholder="e.g. H2O2" maxlength="60">', 'treatments')}
      </div><p class="battery-active-filters" hidden></p>
      <details class="battery-summary-settings" hidden><summary>Summary settings</summary><div>
      ${field('summary_level', 'Group records by', '<select><option value="sample">Same sample and measurement context</option><option value="context">Broader descriptive comparison</option></select>')}
      ${field('summary_basis', 'Statistical unit', '<select><option value="record">Reported measurements</option><option value="study">One mean per study (equal weights)</option></select>')}
      </div><p>Broader comparisons retain separate chemistry, target and measurement groups. Differences in preparation and conditions still need review.</p></details>
      </form></section>
      <section class="battery-results" aria-live="polite"><div class="battery-results-heading"><div><h3></h3><span class="battery-result-count"></span></div>
      <div class="battery-switch" aria-label="Result view"><button type="button" data-mode="records">Records</button><button type="button" data-mode="summary">Statistical summary</button></div></div>
      <p class="battery-results-note"></p><div class="battery-table"></div></section>
      <details class="battery-audit"><summary>Dataset coverage and source review</summary><p>${data.audit.length} studies · ${data.profiles.length} sample groups. Elemental mass-composition data from ${unique(data.compositions.map(row => row.paper)).length} studies. Sample groups retain their reviewed chemistry, preparation state and assay identities.</p>
      <div class="battery-audit-table"></div><p><a href="datasets/battery20/overview/review.json" target="_blank" rel="noopener">Reviewed sample classifications</a></p></details>`;
    const form = container.querySelector('form');
    let rowsById = new Map(), request = 0;
    function actionButtons(row) {
      rowsById.set(row.id, row);
      return `<div class="battery-row-actions"><button type="button" data-action="graph" data-row="${escape(row.id)}">Graph</button><button type="button" data-action="source" data-row="${escape(row.id)}">Source</button></div>`;
    }
    function contributingRecords(summary, records) {
      return `<details><summary>Records used (${summary.records})</summary>${summary.record_ids.map(id => {
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
    function table(headers, body) {
      return `<div class="battery-table-scroll"><table><thead><tr>${headers.map(header => `<th>${escape(header)}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div>`;
    }
    async function render() {
      const current = ++request;
      rowsById = new Map(data.profiles.map(profile => [profile.id, profile]));
      const composition = workspace === 'composition';
      const targets = unique(composition ? data.compositions.map(row => row.element) : data.results.map(row => row.material)).sort();
      if (!targets.includes(controls.target)) controls.target = '';
      const target = form.elements.target;
      if (target.dataset.workspace !== workspace) {
        target.innerHTML = options(targets.map(value => [value, value]), 'All targets');
        target.dataset.workspace = workspace;
      }
      for (const [name, value] of Object.entries(controls)) form.elements[name].value = value;
      container.querySelectorAll('[data-workspace]').forEach(label => { label.hidden = label.dataset.workspace !== workspace; });
      container.querySelectorAll('[data-workspace-tab], [data-mode]').forEach(button => {
        const active = button.dataset.workspaceTab ? button.dataset.workspaceTab === workspace : button.dataset.mode === mode;
        button.classList.toggle('active', active);button.setAttribute('aria-pressed', active);
      });
      const advancedFields = [...container.querySelectorAll('.battery-advanced label')].filter(label => !label.hidden);
      const applied = advancedFields.filter(label => controls[label.querySelector('select, input').name] !== '');
      const more = container.querySelector('.battery-more');
      more.textContent = `More filters${applied.length ? ` (${applied.length})` : ''}`;
      more.setAttribute('aria-expanded', advanced);
      container.querySelector('.battery-advanced').hidden = !advanced;
      const activeFilters = container.querySelector('.battery-active-filters');
      activeFilters.hidden = advanced || !applied.length;
      activeFilters.textContent = applied.map(label => {
        const input = label.querySelector('select, input');
        return `${label.firstChild.textContent}: ${input.tagName === 'SELECT' ? input.selectedOptions[0].textContent : input.value}`;
      }).join(' · ');
      container.querySelector('.battery-summary-settings').hidden = mode !== 'summary';
      const parameters = overviewParameters(controls, workspace, mode);
      const routes = parameters.template === 'routes';
      container.querySelector('.battery-results-heading h3').textContent = composition ? 'Reported composition' : mode === 'summary' ? 'Treatment result summary' : routes ? 'Studied treatments' : 'Matching experiments';
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
        container.querySelector('.battery-results-note').textContent = 'Descriptive summaries use unqualified values within the selected groups. SD shows spread, not uncertainty in a pooled estimate. Inspect contributing records before comparing studies.';
        const contributing = new Map(rows.map(row => [row.id, row]));
        headers = ['Sample context', 'Target / measure', 'Mean / median', 'Range / SD', 'Coverage / evidence'];
        body = response.statistics.map(summary => `<tr><td><strong>${escape(summary.label)}</strong><small>${escape(data.streams[summary.stream])} · ${escape(data.chemistries[summary.chemistry])}</small><small>${escape(summary.assay || summary.family)}</small></td><td>${escape(summary.target)}<small>${escape(summary.metric.replaceAll('_', ' '))}</small></td><td>Mean ${format(summary.mean)} ${escape(summary.unit)}<br>Median ${format(summary.median)} ${escape(summary.unit)}<small>${summary.summary_basis === 'study' ? 'Study means, equal weights' : 'Reported measurements'}</small></td><td>${rangeText(summary)}<small>SD ${summary.sd === null ? '— (one unit)' : format(summary.sd) + ' ' + escape(summary.unit)}</small></td><td>${count(summary.studies, 'study', 'studies')} · ${count(summary.sample_groups, 'sample group')}<small>${count(summary.statistical_units, 'statistical unit')} · ${count(summary.states, 'sample state')}${summary.conditions ? ' · ' + count(summary.conditions, 'condition description') : ''}</small>${contributingRecords(summary, contributing)}</td></tr>`);
      } else if (composition) {
        container.querySelector('.battery-results-note').textContent = 'Contents are shown on the reviewed sample-mass basis. Expand measurement details for the original report and assay.';
        headers = ['Measured feedstock', 'Element', 'Content', 'Source'];
        body = rows.map(row => `<tr><td>${sampleCell(row)}</td><td>${escape(row.element)}</td><td><strong>${escape(row.qualifier || '')}${format(row.wt_percent)} wt%</strong><details><summary>Measurement details</summary>${escape(row.value)}${row.uncertainty ? ' ± ' + escape(row.uncertainty) : ''} ${escape(row.display_unit || row.unit)}<p>${escape(row.assay)}</p></details></td><td>${paperCell(row)}</td></tr>`);
      } else if (routes) {
        container.querySelector('.battery-results-note').textContent = 'Treatments studied for these feedstocks. Add result filters to inspect matching experiments, or open Statistical summary to compare reported results.';
        headers = ['Study feedstock', 'Treatment', 'Reported targets', 'Source'];
        body = rows.map(row => `<tr><td>${sampleCell(row)}</td><td><strong>${escape(row.name)}</strong><small>${escape(row.family)}</small></td><td>${escape(unique(data.results.filter(result => result.method_id === row.id).map(result => result.material)).join(', ')) || 'See study'}</td><td>${paperCell(row)}</td></tr>`);
      } else {
        container.querySelector('.battery-results-note').textContent = 'Filters apply to the same reported observation. Time and concentration match recorded descriptions; an absent reagent requires explicit wording.';
        headers = ['Study feedstock', 'Treatment', 'Reported result', 'Conditions', 'Source'];
        body = rows.map(row => {
          const method = methods.get(row.method_id);
          return `<tr><td>${sampleCell(row)}</td><td><strong>${escape(method.name)}</strong><small>${escape(method.family)}</small></td><td><strong>${escape(row.material)} · ${escape(row.qualifier || '')}${escape(row.value)} ${escape(row.unit)}</strong><small>${escape(row.metric.replaceAll('_', ' '))}</small></td><td>${row.temperature_upper == null ? '' : `Temperature ≤ ${format(row.temperature_upper)} °C`}<details><summary>Conditions</summary><p>${escape(row.condition || 'See source record.')}</p></details></td><td>${paperCell(row)}</td></tr>`;
        });
      }
      const coverage = rows.length ? null : emptyCoverage(data, parameters);
      output.innerHTML = body.length ? table(headers, body) : `<div class="battery-empty"><h4>${rows.length ? 'No unqualified values for this summary.' : 'No reviewed records match these filters.'}</h4><p>${escape(coverage?.reason || 'Open Records to inspect the individual reported values.')}</p><div class="battery-row-actions">${coverage?.treatments ? `<button type="button" data-browse-treatments>Browse all ${coverage.treatments} treatments for this selection</button>` : ''}<button type="button" data-show-coverage>View source coverage</button></div></div>`;
      const visibleProfiles = data.profiles.filter(profile => (!controls.stream || profile.stream === controls.stream) && (!controls.chemistry || profile.chemistry === controls.chemistry) && (!controls.origin || profile.origin === controls.origin));
      container.querySelector('.battery-audit-table').innerHTML = table(['Study', 'Reviewed sample groups', 'Elemental mass records', 'Review notes'], data.audit.filter(study => visibleProfiles.some(profile => profile.paper === study.paper)).map(study => `<tr><td>${escape(study.paper)}</td><td>${visibleProfiles.filter(profile => profile.paper === study.paper).map(profile => `${escape(profile.label)} ${actionButtons(profile)}`).join('<br>')}</td><td>${study.composition_records}</td><td>${study.review_notes.map(escape).join(' ') || 'Source passages and frozen sample identities reviewed.'}</td></tr>`));
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
      if (button.classList.contains('battery-more')) {
        advanced = !advanced;
        container.querySelector('.battery-advanced').hidden = !advanced;
        button.setAttribute('aria-expanded', advanced);
        container.querySelector('.battery-active-filters').hidden = advanced || button.textContent === 'More filters';
      }
      if (button.hasAttribute('data-browse-treatments')) {
        workspace = 'treatments';mode = 'records';
        Object.assign(controls, defaults, {stream: controls.stream, chemistry: controls.chemistry, origin: controls.origin});render();
      }
      if (button.hasAttribute('data-show-coverage')) {
        const audit = container.querySelector('.battery-audit');audit.open = true;audit.scrollIntoView({block: 'start', behavior: 'smooth'});
      }
      if (button.classList.contains('battery-reset')) { Object.assign(controls, defaults);render(); }
      if (button.dataset.action) {
        button.disabled = true;
        try { await actions.open(rowsById.get(button.dataset.row), button.dataset.action); }
        catch (error) { actions.error(error); }
        finally { button.disabled = false; }
      }
    });
    render();
  }
  return {mount, query, hasAbsentReagent, emptyCoverage, overviewParameters};
})();
