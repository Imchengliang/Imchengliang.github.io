/* Readable views of archived records. No extraction, correction or inferred changes. */
'use strict';
const Replay = (() => {
  const normalize = value => String(value ?? '').replace(/\s+/g,' ').trim();
  const tableKey = value => String(value ?? '').replace(/[^a-z0-9]/gi,'').toLowerCase();
  const props = record => record.properties || record.attributes || {};
  const present = value => value !== undefined && value !== null && value !== '';
  const badges = values => values.filter(present).map(value=>`<span class="tag">${esc(text(value))}</span>`).join(' ');
  const paragraph = value => present(value)?`<p>${esc(text(value))}</p>`:'';
  function facts(record) {
    const p=props(record);
    return {subject:record.subject_name||record.source_name||p.source_name||record.subject||record.source_id,
      predicate:record.predicate||record.relation_type,
      object:record.object_name||record.target_name||p.target_name||record.object||record.target_id};
  }
  function evidence(record) {
    const value=record.evidence_span||record.evidence_hint||props(record).evidence_span;
    return typeof value==='string'?value:typeof record.evidence==='string'?record.evidence:'';
  }
  function entry(kind,data,extra={}) {return {kind,data,raw:data,...extra};}
  function entries(stage) {
    if(['entity','relation'].includes(stage.id)) {
      const field=stage.id==='entity'?'entities':'relations';
      return stage.records.flatMap(chunk=>{
        const output=chunk.output||{}, common={section:chunk.section_name,chunk:chunk.chunk_id};
        const extracted=output[field]?.length?output[field].map(record=>entry(stage.id,record,common)):
          [entry('empty',output,{...common,title:`No ${field} in this chunk`})];
        const requests=stage.id==='relation'?(output.unresolved_process_result_requests||[]).map(record=>entry('process_request',record,common)):[];
        return [...extracted,...requests];
      });
    }
    if(stage.id!=='revision')return stage.records.map(record=>entry(stage.id,record));
    return stage.records.flatMap(record=>{
      const output=record.output;
      if(record.field==='process_revision_operations')return output.map(operation=>entry('operation',operation,{run:record.run_status}));
      if(record.field.startsWith('deleted_')) {
        const kind={deleted_entities:'entity',deleted_relations:'relation',deleted_triples:'triple'}[record.field];
        return output.length?output.map(deleted=>entry('deleted',deleted,{title:`Removed ${kind}`})):
          [entry('summary',{count:0},{title:'Removed '+record.field.slice(8)})];
      }
      if(record.field==='diagnostics') {
        const {entity_merge_events=[],...other}=output;
        return [...entity_merge_events.map(event=>entry('merge',event)),entry('summary',other,{title:'Other archived diagnostics'})];
      }
      return [entry(record.field,output,{title:record.field.replaceAll('_',' ')})];
    });
  }
  function lazyJSON(raw,metadata={}) {
    const details=document.createElement('details'),summary=document.createElement('summary');
    summary.textContent='View record JSON';details.append(summary);
    details.addEventListener('toggle',()=>{
      if(details.open&&!details.querySelector('pre')) {details.insertAdjacentHTML('beforeend',detailFields(metadata));const pre=document.createElement('pre');pre.textContent=JSON.stringify(raw,null,2);details.append(pre);}
    });
    return details;
  }
  function detailFields(object) {
    return fields(Object.fromEntries(Object.entries(object).filter(([,value])=>present(value)&&(!Array.isArray(value)||value.length))));
  }
  function scalarFields(object) {
    return detailFields(Object.fromEntries(Object.entries(object||{}).filter(([,value])=>value!==null&&typeof value!=='object')));
  }
  function tableTitle(id) {
    return state.case.tables.find(table=>tableKey(table.table_id)===tableKey(id))?.caption || id || 'Table';
  }
  function factHTML(record) {
    const f=facts(record),p=props(record);
    return `<div class="fact"><strong>${esc(f.subject)}</strong><span>${esc(f.predicate)}</span><strong>${esc(f.object)}</strong></div>`+
      `<div class="measurement">${present(p.value)?`<b>${esc(text(p.value))}${present(p.uncertainty)?' ± '+esc(text(p.uncertainty)):''} ${esc(text(p.unit))}</b>`:''}${badges([p.property||p.measure_key,p.qualifier,p.setting_id?'Linked setting':null])}</div>`+
      conditionFields({Condition:p.condition,'Condition labels':p.condition_labels,'Setting condition':p.setting_condition})+
      detailFields({'Source sample':p.source_sample,'Sample state':p.sample_state,'Measurement basis':p.measurement_basis,'Experiment group':normalize(text(p.experiment_group))!==normalize(text(p.source_sample))?p.experiment_group:undefined});
  }
  function nested(records,container,render,limit=5) {
    let shown=0;
    const more=()=>{
      container.querySelector(':scope > .load-more')?.remove();
      records.slice(shown,shown+limit).forEach(record=>container.append(render(record)));shown+=limit;
      if(shown<records.length) {const button=document.createElement('button');button.className='load-more';button.textContent=`Show more (${records.length-shown} remaining)`;button.onclick=more;container.append(button);}
    };more();
  }
  function render(item,actions) {
    const record=item.data||{},card=document.createElement('article');card.className='record';card.dataset.kind=item.kind;
    let title=item.title||record.canonical_name||record.name||record.scope_label||record.scope_subject_text||'Archived record',body='';
    let quote=evidence(record),tableId=record.table_id||props(record).table_id,locationRecord=record;
    if(['relation','final','table_fact'].includes(item.kind)) {
      title=item.kind==='final'?'Final relation':item.kind==='table_fact'?'Table-extracted relation':'Relation candidate';body=factHTML(record);
    }else if(item.kind==='entity') {
      title=record.name||record.id;
      body=badges([record.type])+detailFields({Mention:record.mention_text,Aliases:record.synonyms,'Sample identifiers':record.sample_identifiers});
    }else if(item.kind==='process') {
      body=badges([record.phase,record.stage_role])+paragraph(record.content||record.condition_summary)+
        detailFields({Sample:record.sample,Treatment:record.treatment,Equipment:record.equipment,'Process agents':record.process_agents,Aliases:[...(record.aliases||[]),...(record.synonyms||[])]});
      if(record.condition_keys?.length)body+='<table class="condition-table"><thead><tr><th>Condition</th><th>Value</th><th>Unit</th></tr></thead><tbody>'+record.condition_keys.map(c=>`<tr><td>${esc(c.key)}</td><td>${esc(text(c.value))}</td><td>${esc(c.unit)}</td></tr>`).join('')+'</tbody></table>';
    }else if(item.kind==='published_process') {
      body=badges(['Process'])+paragraph(record.content);
    }else if(item.kind==='gate') {
      const decision=record.decision||{};title=tableTitle(tableId);
      body=badges([decision.decision,decision.table_role])+detailFields({Source:decision.causal_role?.source_object,Quantity:decision.causal_role?.measured_quantity,'Evidence role':decision.causal_role?.evidence_role})+paragraph(decision.ir_instruction);
      body+=(decision.evidence_steps||[]).map(step=>`<div class="gate-reason"><b>${esc(step.step)} · ${esc(step.judgment)}</b>${paragraph(step.reason)}</div>`).join('');
    }else if(item.kind==='table') {
      const ir=record.semantic_ir_and_verification||{},output=record.extraction,verification=ir.verification_report||{};
      tableId=ir.table_id;title=tableTitle(tableId);
      body=badges([verification.status])+detailFields({Entities:output?.entity_count,Relations:output?.relation_count,'Context records':output?.context_record_count,'Checked templates':verification.checked_templates});
      body+=paragraph(verification.skip_reason);
      if(verification.repair_failure_reason)body+=`<p class="notice">${esc(verification.repair_failure_reason)}</p>`;
      const issues=[...(verification.domain_range_rejections||[]),...(verification.direct_repair_provenance_errors||[]),...(verification.unsupported_templates||[])];
      if(issues.length)body+=`<p class="notice">${issues.length} archived rejection / repair records. ${esc(issues[0].reason||issues[0].message||'See original JSON for details.')}</p>`;
      if(verification.domain_range_rejections?.length)body+=detailFields({'Domain/range rejections':verification.domain_range_rejections.length,'First rejected direction':`${verification.domain_range_rejections[0].source_type} → ${verification.domain_range_rejections[0].target_type}`});
      for(const issue of verification.direct_repair_provenance_errors||[])body+=`<p class="notice">${esc(issue.reason||issue.message)}</p>`;
      const traces=ir.execution_trace||[];
      if(traces.length)body+='<table class="condition-table"><thead><tr><th>Step</th><th>Emitted</th><th>Skipped</th></tr></thead><tbody>'+traces.map(t=>`<tr><td>${esc(t.template_id)}</td><td>${esc(t.emitted??'—')}</td><td>${esc(t.skipped??'—')}</td></tr>`).join('')+'</tbody></table>';
      if(output?.relation_count===0)body+=`<p class="${verification.status?.includes('failed')?'notice':'muted'}">No relations emitted.${output.context_record_count?' Context records are shown below.':''}</p>`;
    }else if(item.kind==='scope') {
      body=badges([record.population_granularity,record.sample_type,record.method_family])+paragraph(record.scope_description);
    }else if(item.kind==='merge') {
      title='Merged entity';body=`<div class="change-pair"><span>${esc(record.source_name||record.source_entity_id)}</span><b>→</b><span>${esc(record.target_name||record.target_entity_id)}</span></div>`+paragraph(record.reason);
    }else if(item.kind==='deleted') {
      const payload=record.item||record;
      const original=record.triple||payload.triple||payload.relation||payload.entity||payload;
      body=badges([item.title])+paragraph(record.reason||payload.reason);
      if(facts(original).predicate)body+=factHTML(original);else body+=paragraph(original.name||original.id);
      body+=detailFields({'Replacement reference':record.superseded_by,Criterion:record.criterion});quote=evidence(original);tableId=props(original).table_id;locationRecord=original;
    }else if(item.kind==='process_request') {
      title='Missing Process request';body=badges(['Unresolved draft · not a final KG assertion',record.request_type])+paragraph(record.reason)+factHTML(record.relation_draft||{});
    }else if(item.kind==='operation') {
      title=record.op;body=badges(['Revision operation',item.run?.status?'Run: '+item.run.status:item.run?.committed?'Run: committed':'Proposal'])+detailFields({Process:record.canonical_name,'Affected results':record.affected_result_ids?.length});
    }else if(item.kind==='process_setting_reconciliation') {
      title='Process / setting reconciliation';body=badges([record.revision?.skipped?'Revision skipped':record.revision?.committed?'Revision committed':'No committed status archived']);
      body+=detailFields({'LLM calls':record.llm_calls,'Applied operations':record.revision?.applied,Error:record.error});
      body+=scalarFields(record.final||{});
      if(record.missing_process)body+='<h5>Missing Process results</h5>'+scalarFields(record.missing_process);
    }else if(item.kind==='empty') {
      body=paragraph('This chunk has no extracted records. It remains available in the original stage download.');
    }else body=scalarFields(record);
    card.innerHTML=`<h4>${esc(title)}</h4>${item.section?`<p class="chunk-context">${esc(item.section)}</p>`:''}${body}`;
    if(quote){const p=document.createElement('p');p.className='evidence';const source=props(locationRecord);p.textContent=tableId&&present(source.raw_cell)?'Source cell: '+text(source.raw_cell)+(source.column_header?' · '+text(source.column_header):''):quote;card.append(p);}
    const summary=!quote&&['process','published_process'].includes(item.kind)?(record.content||record.condition_summary||''):'';
    if(summary||(!quote&&!tableId&&['entity','process'].includes(item.kind))){const note=document.createElement('p');note.className='source-note';note.textContent=summary?'Process summary — not an archived quotation.':'No source quotation is archived for this record.';card.append(note);}
    const buttons=document.createElement('div');buttons.className='record-actions';
    if(quote||tableId||summary) {
      const button=document.createElement('button');button.textContent=tableId?'Locate source table / cell':summary?'Find related text (summary)':'Locate text evidence';
      button.onclick=()=>actions.locate({...locationRecord,location_query:quote||summary,location_is_summary:!!summary,table_id:tableId});buttons.append(button);
    }
    if(item.kind==='final'||item.kind==='published_process') {const button=document.createElement('button');button.textContent='View in graph';button.onclick=()=>actions.graph(record);buttons.append(button);}
    card.append(buttons);
    if(item.kind==='table') {
      const output=record.extraction||{};
      for(const [field,kind] of [['relations','table_fact'],['context_records','context']]) {
        if(!output[field]?.length)continue;
        const section=document.createElement('section');section.className='table-results';
        const heading=document.createElement('h5');heading.textContent=`${field==='relations'?'Extracted relations':'Context records'} · ${output[field].length}`;section.append(heading);
        nested(output[field],section,value=>kind==='context'?render(entry('context',value,{title:value.label||value.record_key}),actions):render(entry(kind,value),actions));card.append(section);
      }
      const program=record.semantic_ir_and_verification?.semantic_ir?.program||[];
      if(program.length){const details=document.createElement('details');details.innerHTML='<summary>Semantic IR steps</summary>'+program.map(step=>`<div class="gate-reason">${esc(step.step_id)} · ${esc(step.op)}${paragraph(step.emit?.predicate)}<pre>${esc(JSON.stringify({select:step.select,bind:step.bind,emit:step.emit},null,2))}</pre></div>`).join('');card.append(details);}
    }
    if(item.kind==='context')card.insertAdjacentHTML('beforeend',detailFields({Role:record.role,Conditions:record.condition_labels}));
    const p=props(record);
    card.append(lazyJSON(item.raw,{Setting:p.setting_id,'Binding basis':p.binding_basis,'Binding request':p.binding_request_id,'Recovered source':p.recovered_invalid_source_name,
      'Request ID':record.request_id,'Candidate ID':record.candidate_id,'Input ID':record.input_id,'Evidence references':record.evidence_refs,Chunk:item.chunk}));return card;
  }
  function textMatch(source,quote) {
    if(!quote)return null;
    const exact=source.indexOf(quote);if(exact>=0)return {start:exact,end:exact+quote.length,method:'Exact text match'};
    let compact='',offsets=[];
    for(let i=0;i<source.length;i++) {
      const space=/\s/.test(source[i]);if(space&&compact.endsWith(' '))continue;
      compact+=space?' ':source[i];offsets.push(i);
    }
    const needle=normalize(quote),at=compact.indexOf(needle);
    return at>=0?{start:offsets[at],end:offsets[at+needle.length-1]+1,method:'Exact match after whitespace normalization'}:null;
  }
  // Navigation only. This never participates in Trace's exact provenance matching.
  function normalizedText(source) {
    let value='';const starts=[],ends=[];
    for(let i=0;i<source.length;) {
      const start=i,char=String.fromCodePoint(source.codePointAt(i));i+=char.length;
      if(char==='\\'&&/[\p{P}\p{S}]/u.test(source[i]||''))continue;
      if(/[\p{Cc}\p{Cf}]/u.test(char)&&! /\s/u.test(char))continue;
      const normalized=char.normalize('NFKC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[‐‑‒–—−]/g,'-');
      for(const part of normalized){const out=/\s/u.test(part)?' ':part;
        if(out===' '&&value.endsWith(' '))continue;
        value+=out;for(let k=0;k<out.length;k++){starts.push(start);ends.push(i);}
      }
    }
    return {value,starts,ends};
  }
  function locateText(source,quote) {
    if(!quote?.trim())return {kind:'missing',matches:[],selected:null};
    const occurrences=(haystack,needle)=>{
      const result=[];if(!needle)return result;
      for(let at=haystack.indexOf(needle);at>=0&&result.length<4;at=haystack.indexOf(needle,at+needle.length))result.push(at);
      return result;
    };
    const exact=occurrences(source,quote);
    if(exact.length)return {kind:exact.length===1?'exact':'ambiguous',selected:exact.length===1?0:null,
      matches:exact.slice(0,3).map(start=>({start,end:start+quote.length,score:1,conflicts:[]}))};
    const normalized=normalizedText(source),needle=normalizedText(quote).value.trim();
    const offsets=occurrences(normalized.value,needle);
    if(offsets.length)return {kind:offsets.length===1?'normalized':'ambiguous',selected:offsets.length===1?0:null,
      matches:offsets.slice(0,3).map(at=>({start:normalized.starts[at],end:normalized.ends[at+needle.length-1],score:1,conflicts:[]}))};
    const tokens=value=>(value.match(/[\p{L}\p{N}]+/gu)||[]);
    const queryTokens=tokens(needle),query=queryTokens.map(token=>token.toLowerCase());
    if(query.length<5)return {kind:'unmatched',matches:[],selected:null};
    const grams=values=>new Set(values.slice(1).map((token,i)=>values[i]+' '+token));
    const dice=(a,b)=>a.size+b.size?2*[...a].filter(v=>b.has(v)).length/(a.size+b.size):0;
    const queryWords=new Set(query),queryPairs=grams(query);
    const numbers=value=>(value.match(/[-+]?\d+(?:[.,]\d+)?/g)||[]).map(v=>Number(v.replace(',','.'))).sort((a,b)=>a-b).join(',');
    const queryNumbers=numbers(needle),ranked=[];
    const segmenter=new Intl.Segmenter('en',{granularity:'sentence'});
    // One or two consecutive sentences in a paragraph; never stitch distant passages.
    for(const paragraph of source.matchAll(/[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g)) {
      const sentences=[...segmenter.segment(paragraph[0])];
      for(let i=0;i<sentences.length;i++)for(let count=1;count<=2&&i+count<=sentences.length;count++) {
        const start=paragraph.index+sentences[i].index;
        const last=sentences[i+count-1],end=paragraph.index+last.index+last.segment.trimEnd().length;
        const candidate=normalizedText(source.slice(start,end)).value.trim(),rawTokens=tokens(candidate),words=rawTokens.map(token=>token.toLowerCase());
        if(words.length<query.length*.4||words.length>query.length*2.5)continue;
        const score=.7*dice(queryWords,new Set(words))+.3*dice(queryPairs,grams(words));
        if(score<.5)continue;
        const conflicts=[];
        if(numbers(candidate)!==queryNumbers)conflicts.push('numeric values differ');
        // Flag changed wording without maintaining domain-specific word lists.
        const sameTokens=JSON.stringify(rawTokens)===JSON.stringify(queryTokens);
        if(!sameTokens)conflicts.push('wording or identifiers differ');
        ranked.push({start,end,score,conflicts,sameTokens});
      }
    }
    ranked.sort((a,b)=>b.score-a.score);
    const matches=[];
    for(const candidate of ranked) {
      if(matches.some(other=>candidate.start<other.end&&candidate.end>other.start))continue;
      matches.push(candidate);if(matches.length===3)break;
    }
    if(!matches.length)return {kind:'unmatched',matches,selected:null};
    const ambiguous=matches.length>1&&matches[0].score-matches[1].score<.12;
    // Overlap cannot establish semantic equivalence, even with identical numbers.
    return {kind:ambiguous?'ambiguous':'approximate',matches,selected:null};
  }
  function tableMatch(table,record) {
    const p=props(record),provenance=p.provenance||{};
    const row=p.row_idx??record.row_idx??provenance.row_idx;
    const col=p.col_idx??p.column_idx??record.col_idx??provenance.column_idx;
    const raw=p.raw_cell??provenance.value_cell;
    // Executor coordinates: data rows are 1-based; columns are 0-based.
    if(Number.isInteger(row)&&Number.isInteger(col)&&table.rows[row-1]?.[col]!==undefined) {
      if(present(raw)&&normalize(table.rows[row-1][col])!==normalize(raw))return {message:'Stored coordinates differ from the archived cell text. No cell highlighted.'};
      return {row,col,message:`Stored cell coordinates: data row ${row}, column ${col+1}${present(raw)?' · cell text verified':''}.`};
    }
    if(Number.isInteger(row)&&table.rows[row-1]&&col===undefined)return {row,message:`Stored data row ${row}. No unique cell column is archived.`};
    const candidates=[];
    if(present(p.row_label)&&present(p.column_header)&&present(raw))table.rows.forEach((cells,index)=>{
      if(!cells.some(value=>normalize(value)===normalize(p.row_label)))return;
      cells.forEach((value,column)=>{if(normalize(table.headers[column])===normalize(p.column_header)&&normalize(value)===normalize(raw))candidates.push({row:index+1,col:column});});
    });
    return candidates.length===1?{...candidates[0],message:'Unique exact match of row label, column header and raw cell.'}:
      {message:'Table located. Exact cell coordinates are unavailable or ambiguous; no cell highlighted.'};
  }
  const cellKey = (table,row,col) => `${tableKey(table)}:${row}:${col}`;
  function cellIndex(archive) {
    const tables=new Map(archive.tables.map(table=>[tableKey(table.table_id),table])),index=new Map();
    const add=(stage,kind,data)=>{
      const table=tables.get(tableKey(data.table_id||props(data).table_id));if(!table)return;
      const match=tableMatch(table,data);
      if(!Number.isInteger(match.row)||!Number.isInteger(match.col))return;
      const key=cellKey(table.table_id,match.row,match.col);
      if(!index.has(key))index.set(key,[]);
      index.get(key).push({stage,kind,data,raw:data});
    };
    for(const stage of archive.stages) {
      if(stage.id==='table')for(const group of stage.records) {
        for(const record of group.extraction?.relations||[])add('table','table_fact',record);
        for(const record of group.extraction?.context_records||[])add('table','context',record);
      }
      if(stage.id==='final')for(const record of stage.records)add('final','final',record);
    }
    return index;
  }
  return {entries,render,evidence,textMatch,locateText,tableMatch,tableKey,cellIndex,cellKey};
})();
