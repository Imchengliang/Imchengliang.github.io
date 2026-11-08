/* Archive lookup only: exact IDs, graph endpoints and evidence/cell anchors.
   A shared anchor is not proof that separately archived stages form one run. */
'use strict';
const Trace = (() => {
  const first = value => Array.isArray(value)?value[0]:value;
  const normalize = value => String(first(value)??'').replace(/\s+/g,' ').trim();
  const key = value => normalize(value).replace(/[^a-z0-9]/gi,'').toLowerCase();
  const props = record => record.properties||record.attributes||{};
  const evidence = record => normalize(record.evidence_span||props(record).evidence_span);
  const table = record => key(record.table_id||props(record).table_id);
  const predicate = record => record.predicate||record.relation_type;
  const predicates = {contains:'CONTAINS',hasOutput:'HAS_OUTPUT',processedBy:'PROCESSED_BY',hasObservation:'HAS_OBSERVATION',isPartOf:'IS_PART_OF',hasMaterial:'HAS_MATERIAL'};
  const labels = value => JSON.stringify((Array.isArray(value)?value:[value]).filter(value=>normalize(value)).map(normalize).sort());
  const numeric = value => {
    const raw=normalize(value);
    return raw!==''&&Number.isFinite(Number(raw))?String(Number(raw)):raw;
  };
  const entries = (item,id) => item.stages.find(stage=>stage.id===id)?.records||[];
  const target = (stage,kind,data,extra={}) => ({stage,kind,data,raw:data,...extra});
  function graphMatches(item,edge,record,final) {
    const p=props(final),id=normalize(record.sourceRelationId);
    if(!id||normalize(final.id)!==id||item.entity_map[final.subject]!==edge.source||item.entity_map[final.object]!==edge.target||predicate(final)!==predicates[edge.predicate])return false;
    // IDs are reused for parallel measurements; compare all supplied discriminator fields.
    const quotations=Array.isArray(record.evidenceSpan)?record.evidenceSpan:[record.evidenceSpan];
    if(quotations.some(quote=>normalize(quote))&&!quotations.some(quote=>normalize(quote)===evidence(final)))return false;
    return [
      [record.tableId,table(final),key],[record.observationValue,p.value,numeric],
      [record.observationUnit,p.unit,normalize],[record.observationProperty,p.property||p.measure_key,normalize],
      [record.condition,p.condition,normalize],[record.conditionLabel,p.condition_labels,labels],
      [record.settingCondition,p.setting_condition,normalize],
      [record.rawCell,p.raw_cell,normalize],[record.rowLabel,p.row_label,normalize],
      [record.columnHeader,p.column_header,normalize]]
      .every(([expected,actual,format])=>!normalize(expected)||format(expected)===format(actual));
  }
  function cell(record) {
    const p=props(record),v=p.provenance||{};
    return {row:p.row_idx??v.row_idx,col:p.col_idx??p.column_idx??v.column_idx,raw:p.raw_cell??v.value_cell};
  }
  function anchored(final,raw) {
    if(predicate(final)!==predicate(raw)||numeric(props(final).value)!==numeric(props(raw).value))return false;
    if(table(final)) {
      if(table(final)!==table(raw))return false;
      const a=cell(final),b=cell(raw);
      if(Number.isInteger(a.row)&&Number.isInteger(a.col)&&Number.isInteger(b.row)&&Number.isInteger(b.col))
        return a.row===b.row&&a.col===b.col&&normalize(a.raw)===normalize(b.raw);
    }else if(table(raw))return false;
    // Never fuzzy-match evidence, names or units to manufacture a stage lineage.
    return !!evidence(final)&&evidence(final)===evidence(raw);
  }
  function resolve(item,edge,record) {
    const result={final:[],origin:[],gate:[],scope:[],preferred:null,message:''};
    if(edge.fusion||normalize(record.linkOrigin).startsWith('scope')){
      result.scope=entries(item,'scope').filter(scope=>evidence(scope)&&evidence(scope)===normalize(record.evidenceSpan)).map(data=>target('scope','scope',data));
      result.preferred=result.scope.length===1?result.scope[0]:null;
      result.message=result.preferred?'Source Scope located.':'No unique Scope match. Browse the paper’s Scope records.';return result;
    }
    result.final=entries(item,'final').filter(final=>graphMatches(item,edge,record,final)).map(data=>target('final','final',data));
    if(result.final.length!==1) {
      result.message=result.final.length?`${result.final.length} matching final records. Choose a record to inspect.`:'No matching final record found. Open the source evidence to inspect.';
      return result;
    }
    const final=result.final[0].data;
    if(table(final)) {
      entries(item,'table').forEach(group=>(group.extraction?.relations||[]).forEach(raw=>{
        if(anchored(final,raw))result.origin.push(target('table','table_fact',raw));
      }));
      result.gate=entries(item,'gate').filter(gate=>table(gate)===table(final)).map(data=>target('gate','gate',data));
    }else entries(item,'relation').forEach(chunk=>(chunk.output?.relations||[]).forEach(raw=>{
      if(anchored(final,raw))result.origin.push(target('relation','relation',raw,{chunk:chunk.chunk_id,section:chunk.section_name}));
    }));
    // A repaired result can retain an exact request pointer even when its source changed.
    const binding=props(final).binding_request_id;
    if(binding)entries(item,'relation').forEach(chunk=>(chunk.output?.unresolved_process_result_requests||[]).forEach(request=>{
      const qualified=request.request_id?.startsWith(chunk.chunk_id+'::')?request.request_id:chunk.chunk_id+'::'+request.request_id;
      if(binding===qualified&&request.relation_draft&&anchored(final,request.relation_draft))
        result.origin.push(target('relation','process_request',request,{chunk:chunk.chunk_id,section:chunk.section_name}));
    }));
    result.preferred=result.origin.length===1?result.origin[0]:result.final[0];
    result.message=result.origin.length===1?'Matching extraction and final record located.':
      result.origin.length?`${result.origin.length} matching extraction records. Showing the final record. Choose an extraction record to inspect.`:
      'Final record located. No unique extraction-stage match.';
    return result;
  }
  return {resolve,graphMatches};
})();
