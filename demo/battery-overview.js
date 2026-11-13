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
    return `${format(summary.minimum)}${summary.minimum === summary.maximum ? '' : '–' + format(summary.maximum)} ${escape((summary.units || [summary.unit]).join(' / '))}`;
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
      : mode !== 'records' || filters.co_target ? 'compare' : 'routes';
    return {template, component: filters.component || '', stream: filters.stream, chemistry: composition ? filters.chemistry : '', origin: '',
      material_class: '', content_unit: '',
      target: filters.target, co_target: composition ? '' : filters.co_target || '', method: composition ? '' : filters.method,
      min_content: 0, min_result: 0, max_temperature: null,
      reagent: '', require_absence: false,
      time_condition: '', concentration_condition: '',
      statistics: mode !== 'records', summary_level: mode === 'visualization' ? 'literature' : filters.summary_level, summary_basis: mode === 'visualization' ? 'study' : filters.summary_basis};
  }

  function filterOptions(data, filters, workspace, mode) {
    const composition = workspace === 'composition';
    const profileOptions = (labels, field) => Object.entries(labels).filter(([value]) => data.profiles.some(profile => profile[field] === value));
    const targets = unique((composition ? data.compositions : data.results).map(row => composition ? row.element : row.material)).sort().map(value => [value,value]);
    const catalogs = {
      component: profileOptions(data.components,'component'), stream: profileOptions(data.streams,'stream'),
      chemistry: profileOptions(data.chemistries,'chemistry'), target: targets, co_target: targets,
      method: unique(data.methods.map(method => method.family)).sort().map(value => [value,value]),
    };
    const fields = composition ? ['component','stream','target','chemistry'] : ['component','stream','target','co_target','method'];
    const unfiltered = Object.fromEntries(fields.map(field => [field,'']));
    return Object.fromEntries(fields.map(field => {
      const values = catalogs[field].filter(([value]) => query(data,overviewParameters({...unfiltered,[field]:value},workspace,'records')).length);
      if (filters[field] && !values.some(([value]) => value === filters[field])) values.push([filters[field],filters[field]]);
      return [field,values.map(([value,label]) => [value,label,!query(data,overviewParameters({...filters,[field]:value},workspace,mode)).length])];
    }));
  }

  const reportedValue = row => `${escape(row.qualifier || '')}${/\p{L}$/u.test(row.qualifier || '') ? ' ' : ''}${escape(row.value)}${row.uncertainty != null ? ' ± ' + escape(row.uncertainty) : ''} ${escape(row.display_unit || row.unit)}`;
  const panelKey = group => JSON.stringify([group.component, group.target, group.metric, group.unit_key]);

  // Shared display scales use the Python groups; no values or units are converted.
  function comparisonPanels(summaries, records) {
    const panels = new Map();
    for (const group of summaries) {
      const key = panelKey(group);
      if (!panels.has(key)) panels.set(key, {group, rows: [], units: []});
      const panel = panels.get(key);
      panel.rows.push(...group.record_ids.map(id => records.get(id)));
      panel.units.push(...group.units);
    }
    for (const panel of panels.values()) {
      panel.units = unique(panel.units);
      panel.minimum = Math.min(0, ...panel.rows.map(row => Number(row.value)));
      panel.maximum = Math.max(0, ...panel.rows.map(row => Number(row.value)));
      // Percent quantities use their per-hundred scale, extending it for any larger reported values.
      if (panel.group.unit_key.endsWith('%')) panel.maximum = Math.max(100, panel.maximum);
    }
    return panels;
  }

  function valueBar(row, scale) {
    const value = Number(row.value), span = scale.maximum - scale.minimum || 1;
    const left = (Math.min(0, value) - scale.minimum) / span * 100;
    const width = Math.abs(value) / span * 100;
    return `<span class="battery-value-bar"><span class="battery-bar-track" aria-hidden="true"><i class="${row.qualifier ? 'qualified' : ''}" style="left:${left}%;width:${width}%"></i></span><strong>${reportedValue(row)}</strong></span>`;
  }

  function aggregatePanels(groups) {
    const panels = new Map();
    groups.forEach((group,index) => {
      const key = JSON.stringify([group.metric,group.unit]);
      if (!panels.has(key)) panels.set(key,[]);
      panels.get(key).push({group,index});
    });
    return [...panels.values()];
  }

  const medianText = group => group.median == null ? 'No point estimate' : `${format(group.median)} ${escape(group.unit)}`;
  const studyCount = group => `${count(group.studies,'study','studies')}${group.numeric_studies !== group.studies ? ' · ' + count(group.numeric_studies,'numeric median') : ''}`;

  function compositionSummary(groups) {
    return aggregatePanels(groups).map(panel => {
      const unit = panel[0].group.unit;
      const maximum = Math.max(unit.endsWith('%') ? 100 : 1,...panel.map(({group}) => group.maximum ?? 0));
      return `<section class="battery-metal-summary"><h4>Reported metal contents · ${escape(unit)}</h4>
        <div class="battery-aggregate-key"><span class="battery-key-dot"></span>Median across studies <span class="battery-key-range"></span>Range of study medians</div>
        <div class="battery-metal-axis"><span>0 ${escape(unit)}</span><span>${format(maximum)} ${escape(unit)}</span></div>
        <div class="battery-metal-rows">${[...panel].sort((left,right) => right.group.studies - left.group.studies || left.group.target.localeCompare(right.group.target)).map(({group,index}) =>
          `<button type="button" class="battery-metal-row" data-aggregate-index="${index}"><span><strong>${escape(group.target)}</strong><small>${studyCount(group)}</small></span>
          <span class="battery-metal-track" aria-hidden="true">${group.median == null ? '' : `<i style="left:${group.minimum / maximum * 100}%;width:${(group.maximum - group.minimum) / maximum * 100}%"></i><b style="left:${group.median / maximum * 100}%"></b>`}</span>
          <span class="battery-metal-value"><strong>${medianText(group)}</strong>${group.minimum == null ? '' : `<small>${format(group.minimum)}–${format(group.maximum)} ${escape(unit)}</small>`}</span></button>`
        ).join('')}</div></section>`;
    }).join('');
  }

  function bubbleMatrix(groups) {
    return aggregatePanels(groups).map(panel => {
      const byCoverage = field => {
        const counts = new Map();
        for (const {group} of panel) counts.set(group[field], (counts.get(group[field]) || 0) + group.studies);
        return [...counts.keys()].sort((a,b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
      };
      const targets = byCoverage('target'), families = byCoverage('family');
      const maximum = Math.max(...panel.map(({group}) => group.studies));
      const cells = new Map(panel.map(cell => [JSON.stringify([cell.group.family,cell.group.target]),cell]));
      return `<section class="battery-bubble-panel"><h4>${escape(panel[0].group.metric.replaceAll('_',' '))} · ${escape(panel[0].group.unit)}</h4>
        <p>Larger bubbles represent more independent studies. Darker colour represents a higher median.</p>
        <div class="battery-bubble-scroll"><table class="battery-bubble-table"><thead><tr><th scope="col">Treatment method</th>${targets.map(target => `<th scope="col">${escape(target)}</th>`).join('')}</tr></thead><tbody>${families.map(family =>
          `<tr><th scope="row">${escape(family)}</th>${targets.map(target => {
            const cell = cells.get(JSON.stringify([family,target]));
            if (!cell) return '<td>—</td>';
            const {group,index} = cell, radius = 26 * Math.sqrt(group.studies / maximum);
            const color = group.median == null ? 'none' : `hsl(183 55% ${94 - Math.max(0,Math.min(100,group.median)) * .6}%)`;
            return `<td><button type="button" class="battery-bubble-cell" data-aggregate-index="${index}" aria-label="${escape(family)} · ${escape(target)} · Median ${medianText(group)} · ${studyCount(group)}">
              <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${radius}" fill="${color}" stroke="var(--teal)"${group.median == null ? ' stroke-dasharray="3 3"' : ''}/></svg><strong>${medianText(group)}</strong><small>${studyCount(group)}</small></button></td>`;
          }).join('')}</tr>`).join('')}</tbody></table></div></section>`;
    }).join('');
  }

  function measurementPlot(group, records, profiles, vocabulary) {
    const points = group.entries.flatMap(entry => entry.values.map(point => {
      const profile = profiles.get(records.get(point.id).profile_id);
      return {...point,paper:entry.paper,profile,category:JSON.stringify([profile.component,profile.stream])};
    }));
    const label = (field,key) => vocabulary[field][key] || 'Not specified';
    const chemistryKeys = Object.keys(vocabulary.chemistries);
    const colour = key => chemistryKeys.includes(key) ? `hsl(${chemistryKeys.indexOf(key) * 137.508 % 360} 55% 38%)` : '#647576';
    const minimum = Math.min(0,...points.map(point => point.value)), extent = Math.max(0,...points.map(point => point.value)) || 1;
    const step = 10 ** Math.floor(Math.log10(extent)) / 2, maximum = Math.ceil(extent / step) * step;
    const position = value => (maximum - value) / (maximum - minimum) * 100;
    const categories = unique(points.map(point => point.category)).map(key => {
      const members = points.filter(point => point.category === key), profile = members[0].profile, lanes = [];
      // Keep the measured y coordinate; only spread overlapping points horizontally.
      const placed = [...members].sort((a,b) => b.value - a.value || a.id.localeCompare(b.id)).map(point => {
        const top = position(point.value);
        let lane = lanes.findIndex(last => top - last >= 4);
        if (lane === -1) lane = lanes.length;
        lanes[lane] = top;
        return {...point,top,offset:lane === 0 ? 0 : Math.ceil(lane / 2) * (lane % 2 ? 12 : -12)};
      });
      return {key,points:placed,component:label('components',profile.component),feedstock:label('streams',profile.stream),
        width:Math.max(128,2 * Math.ceil(lanes.length / 2) * 12 + 32)};
    }).sort((a,b) => a.component.localeCompare(b.component) || a.feedstock.localeCompare(b.feedstock));
    const width = categories.reduce((total,category) => total + category.width,0);
    let left = 0;
    for (const category of categories) { category.left = (left + category.width / 2) / width * 100;left += category.width; }
    return `<section class="battery-measurement-plot"><h5>${escape(group.target)} across feedstocks</h5>
      <p>Each dot is a measurement. Colour shows the material system; select a dot for its sample, study and conditions.</p>
      <div class="battery-chemistry-key"><strong>Material system</strong>${unique(points.map(point => point.profile.chemistry)).map(key => `<span><i style="background:${colour(key)}"></i>${escape(label('chemistries',key))}</span>`).join('')}</div>
      <div class="battery-cloud-scroll"><div class="battery-cloud-chart" style="min-width:${width + 108}px">
      <div class="battery-cloud-value-title">${escape(group.metric.replaceAll('_',' '))} (${escape(group.unit)})</div>
      <div class="battery-cloud-canvas">${[0,.25,.5,.75,1].map(fraction => `<i class="battery-cloud-grid" style="top:${fraction * 100}%" aria-hidden="true"></i><span class="battery-cloud-tick" style="top:${fraction * 100}%">${format(maximum - fraction * (maximum - minimum))}</span>`).join('')}
      ${group.median == null ? '' : `<i class="battery-cloud-reference" style="top:${position(group.median)}%" aria-hidden="true"></i>`}${categories.map(category => category.points.map(point => {
        const row = records.get(point.id), chemistry = label('chemistries',point.profile.chemistry);
        const title = `${escape(point.paper)} · ${escape(point.profile.label)} · ${escape(category.component)} → ${escape(category.feedstock)} · ${escape(chemistry)} · ${reportedValue(row)} (plot: ${format(point.value)} ${escape(group.unit)})`;
        const bound = /[<>≤≥]/.test(row.qualifier || '');
        const arrow = /[<≤]/.test(row.qualifier || '') ? 'M9 4v10m-4-4l4 4 4-4' : 'M9 14V4m-4 4l4-4 4 4';
        return `<button type="button" class="battery-cloud-point${bound ? ' bound' : ''}" data-point-record="${escape(point.id)}" title="${title}" aria-label="${title}" style="left:calc(${category.left}% + ${point.offset}px);top:${point.top}%;--chemistry-colour:${colour(point.profile.chemistry)}">${bound ? `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="${arrow}"/></svg>` : ''}</button>`;
      }).join('')).join('')}</div>
      <div class="battery-cloud-categories" style="grid-template-columns:${categories.map(category => category.width + 'fr').join(' ')}">${categories.map(category => `<div><strong>${escape(category.component)}</strong><span>${escape(category.feedstock)}</span><small>${count(category.points.length,'measurement')} · ${count(unique(category.points.map(point => point.paper)).length,'study','studies')}</small></div>`).join('')}</div>
      <div class="battery-cloud-axis-title">Component → Feedstock</div></div></div>
      <div class="battery-cloud-key">${group.median == null ? '' : `<span class="battery-reference-key"></span>Across-study median: ${medianText(group)}`}${points.some(point => /[<>≤≥]/.test(records.get(point.id).qualifier || '')) ? '<span>Arrows mark reported bounds.</span>' : ''}</div>
      <div class="battery-point-detail" tabindex="-1" hidden></div></section>`;
  }

  function mount(container, data, actions) {
    const profiles = new Map(data.profiles.map(profile => [profile.id, profile]));
    const methods = new Map(data.methods.map(method => [method.id, method]));
    const componentDescriptions = {
      battery: 'Batteries and battery-derived feedstocks, including electrodes and separated fractions.',
      pcb: 'Printed circuit boards and PCB-derived parts, including separated components and contacts.',
      magnet: 'Magnets and magnet-derived feedstocks, including separated magnets and powders.',
      'mixed-phone-components': 'Mixed phone-derived materials, including separated fractions, treated material and leachates.',
      'electronic-component': 'Non-PCB electronic parts, such as ferrite cores from filter boxes.',
      'lighting-component': 'Lighting parts recovered from electronic equipment, such as screen backlight lamps.',
    };
    const defaults = {component: '', stream: '', target: '', co_target: '', chemistry: '', method: '',
      summary_level: 'context', summary_basis: 'study'};
    const controls = {...defaults};
    let workspace = 'composition', mode = 'records';
    const options = (values, title) => `<option value="">${escape(title)}</option>` + values.map(([value, label, disabled]) => `<option value="${escape(value)}"${disabled ? ' disabled' : ''}>${escape(label)}</option>`).join('');
    const available = (labels, field, profiles = data.profiles) => Object.entries(labels).filter(([value]) => profiles.some(profile => profile[field] === value));
    const helpText = {
      component: 'The type of item the sample comes from, such as a battery, printed circuit board or magnet.',
      stream: 'The form of the material entering a treatment, such as a whole battery, electrode powder, separated fraction or leachate.',
      target: 'The element or material whose content or treatment result you want to explore.',
      co_target: 'Another target reported for the same sample, treatment and experimental conditions.',
      chemistry: 'The material system of the sample or its source, such as LFP batteries or NdFeB magnets.',
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
      <div class="battery-switch" aria-label="Workspace"><button type="button" data-workspace-tab="composition">Composition</button><button type="button" data-workspace-tab="treatments">Treatment Routes</button></div>
      <form class="battery-query-form">
      <div class="battery-primary-filters">
      ${field('component', 'Component', `<select>${options(available(data.components, 'component'), 'All components')}</select>`)}
      ${field('stream', 'Feedstock', `<select>${options(available(data.streams, 'stream'), 'All feedstocks')}</select>`)}
      ${field('chemistry', 'Material system', `<select>${options(available(data.chemistries, 'chemistry'), 'All material systems')}</select>`, 'composition')}
      ${field('target', 'Target', '<select></select>')}
      ${field('co_target', 'Co-existing target', '<select></select>', 'treatments')}
      ${field('method', 'Treatment family', `<select>${options(unique(data.methods.map(method => method.family)).sort().map(family => [family, family]), 'All treatments')}</select>`, 'treatments')}
      <button type="button" class="battery-reset">Reset</button></div>
      </form></section>
      <section class="battery-results" aria-live="polite"><div class="battery-results-heading"><div><h3></h3><p class="battery-component-context" hidden></p><span class="battery-result-count"></span></div>
      <div class="battery-switch" aria-label="Result view"><button type="button" data-mode="records">Records</button><button type="button" data-mode="summary">Compare & Summarize</button><button type="button" data-mode="visualization">Visualization</button></div></div>
      <p class="battery-results-note"></p><div class="battery-table"></div></section>`;
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
    let rowsById = new Map(), request = 0, cachedQuery, activeAggregateGroups = [], comparisonRecords = new Map(), aggregateTrigger;
    function actionButtons(row) {
      rowsById.set(row.id, row);
      return `<div class="battery-row-actions"><button type="button" data-action="graph" data-row="${escape(row.id)}">Graph</button><button type="button" data-action="source" data-row="${escape(row.id)}">Source</button></div>`;
    }
    function measurementDetail(row, value, unit) {
      const profile = profiles.get(row.profile_id), method = methods.get(row.method_id);
      const context = [data.components[profile.component],data.streams[profile.stream],data.chemistries[profile.chemistry]].filter(Boolean).join(' · ');
      return `<p><strong>${escape(profile.label)} · ${reportedValue(row)}</strong><small>${escape(context)}</small><small>Plot value ${format(value)} ${escape(unit)}</small></p>
        <p>${escape(method?.name || row.assay || '')}${row.metric ? ' · ' + escape(row.metric.replaceAll('_',' ')) : ''}</p><p>${escape(row.condition || profile.state || '')}</p>${actionButtons(row)}`;
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
        return `<p>${escape(row.qualifier || '')}${escape(row.value)}${row.uncertainty != null ? ' ± ' + escape(row.uncertainty) : ''} ${escape(row.display_unit || row.unit)} · ${escape(row.paper)}</p><small>${escape(row.condition || row.assay || '')}</small>${actionButtons(row)}`;
      }).join('')}</details>`;
    }
    function sampleCell(row) {
      const profile = profiles.get(row.profile_id);
      return `<strong>${escape(profile.label)}</strong><small>${escape(data.chemistries[profile.chemistry])} · ${escape(profile.state)}</small>`;
    }
    function paperCell(row) {
      return `<span class="battery-paper" title="${escape(row.paper)}">${escape(row.paper)}</span>${actionButtons(row)}`;
    }
    function treatmentRow(row, group, scale) {
      const method = methods.get(row.method_id);
      return `<tr><td><strong>${escape(method.name)}</strong><small>${escape(profiles.get(row.profile_id).label)}</small><small>${escape(group.target)} · ${escape(group.metric.replaceAll('_', ' '))}</small></td>
        <td>${valueBar(row, scale)}<small>Scale ${format(scale.minimum)}–${format(scale.maximum)} ${escape(scale.units.join(' / '))}</small>${coResults([row])}</td>
        <td><div class="battery-condition-preview"><p>${escape(row.condition || 'Conditions not recorded')}</p></div>${row.condition ? '<details><summary>Full conditions</summary><p>' + escape(row.condition) + '</p></details>' : ''}</td><td>${paperCell(row)}</td></tr>`;
    }
    function comparisonRows(summary, contributing, composition, scale) {
      const unit = escape((summary.units || [summary.unit]).join(' / '));
      const statistics = summary.syntheses.map(synthesis => `<p>${count(synthesis.studies, 'study', 'studies')} · ${count(synthesis.sample_groups, 'sample group')}<br>Mean ${format(synthesis.mean)} ${unit} · Median ${format(synthesis.median)} ${unit}<br><span title="Standard deviation of publication-level means">SD ${format(synthesis.sd)} ${unit}</span></p>${contributingRecords(synthesis, contributing)}`).join('');
      const statisticsPanel = summary.syntheses.length
        ? `<details><summary>Comparable-study statistics</summary>${statistics}</details>`
        : '';
      const routes = composition && summary.method_ids.length ? `<details><summary>Treatments studied for these samples (${summary.method_ids.length})</summary>${summary.method_ids.map(id => {
        const method = methods.get(id);
        return `<p><strong>${escape(method.name)}</strong><small>${escape(method.family)} · ${escape(profiles.get(method.profile_id).label)}</small></p>${actionButtons(method)}`;
      }).join('')}</details>` : '';
      const heading = `<tr class="battery-comparison-group"><td colspan="4"><strong>${summary.component ? escape(data.components[summary.component]) + ' · ' : ''}${escape(data.material_classes[summary.material_class] || summary.material_class)} · ${escape(summary.target)}</strong>
        <small>${escape(summary.metric)} · ${unit}${summary.family ? ' · ' + escape(summary.family) : ''} · ${count(summary.studies, 'study', 'studies')} · ${count(summary.sample_groups, 'sample group')}${summary.records > 1 ? ' · Observed range ' + rangeText(summary) : ''}</small>
        ${summary.conditions ? '<small>' + count(summary.conditions, 'reported condition set') + '</small>' : ''}${statisticsPanel}${routes}</td></tr>`;
      if (!composition) return [heading, ...summary.record_ids.map(id => treatmentRow(contributing.get(id), summary, scale))];
      return [heading, ...summary.entries.map(entry => {
        const records = entry.record_ids.map(id => contributing.get(id));
        const first = records[0], profile = profiles.get(entry.profile_id);
        const value = records.length === 1 ? reportedValue(first) : rangeText({...entry, units: unique(records.map(row => row.display_unit || row.unit))});
        const basis = data.comparison_vocabularies;
        const context = `${escape(entry.assay)}<details><summary>Measurement basis</summary>${escape(basis.mass_denominator[entry.mass_denominator])}<br>${escape(basis.moisture_basis[entry.moisture_basis])}${entry.measurement_state_note ? '<p>' + escape(entry.measurement_state_note) + '</p>' : ''}</details>`;
        return `<tr><td><strong>${escape(data.material_classes[entry.material_class])}</strong><small>${escape(entry.label)}</small><small>${escape(data.chemistries[profile.chemistry])} · ${escape(profile.state)}</small></td>
          <td><strong>${value}</strong>${records.length > 1 ? `<small>${count(records.length, 'reported value')} · descriptive range</small>` : ''}</td>
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
      const placeholders = {component:'All components',stream:'All feedstocks',target:'All targets',chemistry:'All material systems',method:'All treatments',co_target:'Any additional target'};
      for (const [field, values] of Object.entries(filterOptions(data,controls,workspace,mode))) {
        form.elements[field].innerHTML = options(values,placeholders[field]);
      }
      for (const [name, value] of Object.entries(controls)) if (form.elements[name]) form.elements[name].value = value;
      form.classList.toggle('composition', composition);
      container.querySelectorAll('[data-workspace]').forEach(label => { label.hidden = label.dataset.workspace !== workspace; });
      container.querySelectorAll('[data-workspace-tab], [data-mode]').forEach(button => {
        const active = button.dataset.workspaceTab ? button.dataset.workspaceTab === workspace : button.dataset.mode === mode;
        button.classList.toggle('active', active);button.setAttribute('aria-pressed', active);
      });
      const parameters = overviewParameters(controls, workspace, mode);
      const routes = parameters.template === 'routes';
      container.querySelector('.battery-results-heading h3').textContent = mode !== 'records' ? (composition ? 'Compare measured feedstocks' : mode === 'visualization' ? 'Feedstocks, treatments and targets' : 'Compare treatment evidence') : composition ? 'Reported composition' : routes ? 'Studied treatments' : 'Matching experiments';
      const componentContext = container.querySelector('.battery-component-context');
      componentContext.hidden = !controls.component;
      componentContext.innerHTML = controls.component ? `<strong>${escape(data.components[controls.component])}</strong> · ${escape(componentDescriptions[controls.component] || '')}` : '';
      const counter = container.querySelector('.battery-result-count');
      counter.textContent = 'Loading…';
      const output = container.querySelector('.battery-table');output.innerHTML = '';
      container.querySelector('.battery-results-note').textContent = '';
      let response;
      try {
        const key = JSON.stringify(parameters);
        if (cachedQuery?.key !== key) {
          const promise = actions.query ? actions.query(parameters, message => { if (cachedQuery?.key === key) counter.textContent = message; }) : Promise.resolve({rows: query(data, parameters), statistics: []});
          cachedQuery = {key, promise};
        }
        const entry = cachedQuery;
        response = await entry.promise;
        if (current !== request) return;
      } catch (error) {
        if (current !== request) return;
        cachedQuery = null;
        counter.textContent = 'Query unavailable';
        container.querySelector('.battery-results-note').textContent = error.message;
        actions.error(error);return;
      }
      if (current !== request) return;
      const rows = response.rows;
      comparisonRecords = new Map(rows.map(row => [row.id,row]));
      counter.textContent = `${count(rows.length, routes ? 'treatment' : 'record')} · ${count(unique(rows.map(row => row.paper)).length, 'study', 'studies')}`;
      let headers, body, visual = '';
      if (mode === 'summary') {
        const groups = response.statistics;
        container.querySelector('.battery-results-note').textContent = `${count(groups.length, 'comparison group')} by material form, target${composition ? '' : ', treatment family, metric'} and unit · ${groups.filter(group => group.studies > 1).length} span multiple studies. ${mode === 'visualization' ? (composition ? 'Explore connections across the selected studies.' : 'Follow each study feedstock through its treatment to the reported targets.') : (composition ? 'Ranges describe the reported observations; study-weighted means appear where measurement contexts match.' : 'Each row retains its reported result and conditions. Bars share a scale for the same target, metric and unit.')}`;
        const contributing = new Map(rows.map(row => [row.id, row]));
        const panels = comparisonPanels(groups, contributing);
        headers = composition ? ['Measured material', 'Reported value / range', 'Measurement context', 'Source evidence'] : ['Treatment & sample', 'Reported result', 'Reported conditions', 'Source evidence'];
        body = mode === 'summary' ? groups.flatMap(summary => comparisonRows(summary, contributing, composition, panels.get(panelKey(summary)))) : [];
      } else if (mode === 'visualization') {
        body = [];
      } else if (composition) {
        container.querySelector('.battery-results-note').textContent = 'Composition refers to the listed sample. Values and units are shown as reported.';
        headers = ['Measured feedstock', 'Element', 'Content', 'Source'];
        body = rows.map(row => `<tr><td>${sampleCell(row)}</td><td>${escape(row.element)}</td><td><strong>${escape(row.qualifier || '')}${escape(row.value)}${row.uncertainty ? ' ± ' + escape(row.uncertainty) : ''} ${escape(row.display_unit || row.unit)}</strong><details><summary>Measurement details</summary><p>${escape(row.assay)}</p></details></td><td>${paperCell(row)}</td></tr>`);
      } else if (routes) {
        container.querySelector('.battery-results-note').textContent = 'Treatments studied for these feedstocks. Add result filters to inspect matching experiments, or open Compare & Summarize to compare reported results.';
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
      if (mode === 'visualization') {
        activeAggregateGroups = response.statistics;
        visual = composition ? compositionSummary(activeAggregateGroups) : bubbleMatrix(activeAggregateGroups);
        if (visual) visual += '<div class="battery-aggregate-detail" tabindex="-1" hidden></div>';
        container.querySelector('.battery-results-heading h3').textContent = composition ? 'Metal contents across studies' : 'Treatment methods × target metals';
        container.querySelector('.battery-results-note').textContent = 'Each paper contributes one median. Markers and colours show the median of those study medians; intervals show their minimum and maximum. Select a metal or bubble for the original values, units and conditions.';
      }
      const coverage = rows.length ? null : emptyCoverage(data, parameters);
      output.innerHTML = visual || (body.length ? table(headers, body) : `<div class="battery-empty"><h4>${rows.length ? 'No unqualified values for this summary.' : 'No reviewed records match these filters.'}</h4><p>${escape(coverage?.reason || 'Open Records to inspect the individual reported values.')}</p>${coverage?.treatments ? `<div class="battery-row-actions"><button type="button" data-browse-treatments>Browse all ${coverage.treatments} treatments for this selection</button></div>` : ''}</div>`);
    }
    form.addEventListener('change', event => {
      controls[event.target.name] = event.target.value;
      render();
    });
    form.addEventListener('submit', event => { event.preventDefault();render(); });
    function selectAggregate(button) {
      const group = activeAggregateGroups[Number(button.dataset.aggregateIndex)];
      container.querySelectorAll('[data-aggregate-index]').forEach(node => node.setAttribute('aria-pressed',node === button));
      const detail = container.querySelector('.battery-aggregate-detail');
      const oldExpanded = container.querySelector('.battery-aggregate-expanded');
      const originalRecords = entry => {
        const values = new Map(entry.values.map(value => [value.id,value.value]));
        return entry.record_ids.map(id => measurementDetail(comparisonRecords.get(id),values.get(id),group.unit)).join('');
      };
      detail.innerHTML = `<button type="button" data-close-aggregate>Close details</button><h4>${escape([group.family,group.target].filter(Boolean).join(' · '))}</h4><p>Median ${medianText(group)} · ${studyCount(group)}</p>${measurementPlot(group,comparisonRecords,profiles,data)}<details class="battery-study-data"><summary>View data table</summary>${table(['Source study','Study median','Original measurements & conditions'],group.entries.map(entry =>
        `<tr><td>${escape(entry.paper)}</td><td>${entry.median == null ? 'Bounds only' : format(entry.median) + ' ' + escape(group.unit)}<small>${count(entry.numeric_records,'point estimate')}</small></td><td><details><summary>View ${count(entry.record_ids.length,'measurement')}</summary>${originalRecords(entry)}</details></td></tr>`
      ))}</details>`;
      const matrixRow = button.closest('.battery-bubble-table tr');
      if (matrixRow) {
        const expanded = document.createElement('tr'), cell = document.createElement('td');
        expanded.className = 'battery-aggregate-expanded';cell.colSpan = matrixRow.children.length;
        cell.append(detail);expanded.append(cell);matrixRow.after(expanded);
      } else button.after(detail);
      oldExpanded?.remove();
      detail.hidden = false;aggregateTrigger = button;
      detail.focus({preventScroll:true});detail.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
    container.addEventListener('click', async event => {
      const aggregate = event.target.closest('[data-aggregate-index]');
      if (aggregate) { selectAggregate(aggregate);return; }
      const point = event.target.closest('[data-point-record]');
      if (point) {
        const group = activeAggregateGroups[Number(aggregateTrigger.dataset.aggregateIndex)];
        const value = group.entries.flatMap(entry => entry.values).find(value => value.id === point.dataset.pointRecord);
        const detail = container.querySelector('.battery-point-detail');
        const row = comparisonRecords.get(value.id);
        container.querySelectorAll('[data-point-record]').forEach(node => node.setAttribute('aria-pressed',node === point));
        detail.innerHTML = `<h5>${escape(row.paper)}</h5>` + measurementDetail(row,value.value,group.unit);
        detail.hidden = false;detail.focus({preventScroll:true});detail.scrollIntoView({block:'nearest',behavior:'smooth'});return;
      }
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.workspaceTab) { workspace = button.dataset.workspaceTab;render(); }
      if (button.hasAttribute('data-close-aggregate')) { container.querySelector('.battery-aggregate-detail').hidden = true;aggregateTrigger?.focus({preventScroll:true});aggregateTrigger?.scrollIntoView({block:'nearest',inline:'nearest'}); }
      if (button.dataset.mode) { mode = button.dataset.mode;render(); }
      if (button.hasAttribute('data-browse-treatments')) {
        workspace = 'treatments';mode = 'records';
        Object.assign(controls, defaults, {component: controls.component, stream: controls.stream, chemistry: controls.chemistry});render();
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
  return {mount, query, hasAbsentReagent, emptyCoverage, overviewParameters, filterOptions, conditionSummary, comparisonPanels, valueBar, compositionSummary, bubbleMatrix, measurementPlot};
})();
