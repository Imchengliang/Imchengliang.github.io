/* Frozen data explorer. Rendering and filters never change extraction results. */
'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
const text = value => list(value).map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join('; ');
const colors = {Product:'#1f7a8c',Component:'#4a6fa5',Process:'#b5703a',Material:'#8a8a2e',ProductFamily:'#6b8f71',MethodFamily:'#8a7aa8'};
const labels = {contains:'CONTAINS',processedBy:'PROCESSED_BY',hasOutput:'HAS_OUTPUT',observedForProductModel:'Observed for product model',variantOf:'Variant of',observedUnderScope:'Observed under scope',modelInDeclaredPopulation:'Model in declared population',comparableSamplePopulation:'Comparable sample population',sameModelStudied:'Same model studied'};
const state = {data:null, nodes:new Map(), positions:new Map(), shownNodes:[], shownEdges:[], hierarchy:true, expanded:new Set(), navPath:[], graphHistory:[], displayNodes:new Map(), focus:null, selected:null, view:'fusion', case:null, stage:'gate', sourceTab:'text', evidence:'', locationSummary:false, textChoice:null, table:null, located:null, trace:null, spotlight:null, cellLookup:null, cellIndex:new Map(), cache:new Map(), request:0};
let walkthrough=null;
let overviewReturn=null;
const canvas = $('#graph'), ctx = canvas.getContext('2d');
let width=0, height=0, zoom=1, offset={x:0,y:0}, pointer=null, frame=0, edgeLabels=[];
function notify(message){ $('#status').textContent=message; }
async function fetchJSON(url){ const response=await fetch(url,{cache:'no-cache'}); if(!response.ok) throw Error(`${url}: HTTP ${response.status}`); return response.json(); }
function fields(object){ return Object.entries(object || {}).filter(([,v])=>text(v)).map(([k,v])=>`<dl class="field"><dt>${esc(k)}</dt><dd>${esc(text(v))}</dd></dl>`).join(''); }
function conditionFields(object){
  const seen=new Set();
  return fields(Object.fromEntries(Object.entries(object).filter(([,value])=>{
    const key=text(value).replace(/\s+/g,' ').trim();
    if(!key||seen.has(key))return false;
    seen.add(key);return true;
  })));
}
function jsonDetails(value){ return `<details><summary>View complete record JSON</summary><pre>${esc(JSON.stringify(value,null,2))}</pre></details>`; }
function sourceName(id){ return state.data.sources.find(s=>s.id===id)?.label || id || 'Shared material / family'; }
function relationName(edge){ return edge.predicates?`${Object.keys(edge.predicates).length} relation types`:labels[edge.predicate] || edge.predicate; }
function isCatalog(node){return node.source?.startsWith('catalog:')||false;}
function displayNode(id){return state.displayNodes.get(id)||state.nodes.get(id);}
function nodeSize(node){return node.group?(node.level===0?39:16):node.type==='Product'?7:node.type==='Material'?4.5:6;}
function nodeBounds(node){
  const r=nodeSize(node)+(state.selected?.kind==='node'&&state.selected.id===node.id&&!node.group?4:0);
  return {x:r,y:r};
}
function nodeSourceLabel(node,compact=false){
  const source=state.data?.sources?.find(source=>source.id===node.source);
  if(!source)return '';
  const kind=source.kind==='catalog'?'Catalog':'Study';
  return compact?`${kind} ${state.data.sources.indexOf(source)+1}`:`${kind} · ${source.label}`;
}
function updateNavigation(){
  const container=$('#graph-path');container.replaceChildren();
  const overview=document.createElement('button');overview.textContent=state.hierarchy?'Categories':'All entities';overview.onclick=state.hierarchy?resetHierarchy:showAllEntities;container.append(overview);
  const route=state.hierarchy?state.navPath:state.focus?[state.focus]:[];
  route.forEach((id,index)=>{
    const item=state.hierarchyData.groups.get(id)||state.nodes.get(id);
    if(!item)return;
    const separator=document.createElement('span');separator.textContent='›';separator.setAttribute('aria-hidden','true');container.append(separator);
    const button=document.createElement('button');button.textContent=item.label;button.title=item.label;
    if(index===route.length-1)button.setAttribute('aria-current','location');
    button.onclick=()=>item.group?navigateGroup(id):focusNode(id);container.append(button);
  });
  if(!route.length)overview.setAttribute('aria-current','location');
  const group=[...route].reverse().map(id=>state.hierarchyData.groups.get(id)).find(Boolean);
  $('#graph-caption').textContent=state.hierarchy
    ? group?`${group.label} · ${group.members.filter(id=>state.visibleEntityIds.has(id)).length} records`:'Browse categories'
    : state.focus?`Connections for ${state.nodes.get(state.focus).label}`:`Entity view · ${state.shownNodes.length} records`;
  $('#graph-back').disabled=!state.graphHistory.length&&!state.navPath.length;
}
// Entity drill-down history is separate from the taxonomy breadcrumb path.
function rememberGraph(){
  const copy=positions=>positions&&new Map([...positions].map(([id,p])=>[id,{...p}]));
  state.graphHistory.push({hierarchy:state.hierarchy,focus:state.focus,expanded:[...state.expanded],navPath:[...state.navPath],selected:state.selected,
    filters:Object.fromEntries(['source-filter','type-filter','relation-filter'].map(id=>[id,$('#'+id).value])),fusion:$('#fusion-toggle').checked,
    positions:copy(state.positions),localPositions:copy(state.localPositions),zoom,offset:{...offset}});
}
function restoreGraph(previous){
  state.hierarchy=previous.hierarchy;state.focus=previous.focus;state.expanded=new Set(previous.expanded);state.selected=previous.selected;
  for(const [id,value] of Object.entries(previous.filters))$('#'+id).value=value;
  $('#fusion-toggle').checked=previous.fusion;updateGraph(false);
  state.positions=previous.positions;state.localPositions=previous.localPositions;zoom=previous.zoom;offset=previous.offset;
  const selected=state.selected;
  if(selected?.kind==='node')selectNode(selected.id);
  else if(selected?.kind==='edge')selectEdge(selected.id);
  else $('#inspector').innerHTML='<h3>Previous graph view</h3><p>Select an entity or relation to inspect its evidence.</p>';
  state.navPath=previous.navPath;updateNavigation();draw();
}
function closeBranch(id){
  for(const group of [...state.expanded])if(state.hierarchyData.path(group).includes(id))state.expanded.delete(group);
}
function navigateGroup(id){
  state.graphHistory=[];
  closeBranch(id);state.hierarchy=true;state.focus=null;
  state.hierarchyData.path(id).forEach(group=>state.expanded.add(group));
  updateGraph();selectGroup(id);
}
function collapseGroup(id){
  state.graphHistory=[];
  closeBranch(id);state.hierarchy=true;state.focus=null;updateGraph();selectGroup(id);
}
function goUp(){
  if(state.graphHistory.length){restoreGraph(state.graphHistory.pop());return;}
  const path=state.navPath.slice(),current=path.pop();if(!current)return;
  if(!state.hierarchyData.groups.has(current)){
    if(path.length)navigateGroup(path.at(-1));else resetHierarchy();
    return;
  }
  closeBranch(current);state.hierarchy=true;state.focus=null;state.navPath=path;updateGraph();
  if(path.length)selectGroup(path.at(-1));else $('#inspector').innerHTML='<h3>Overview</h3><p>Select a group to continue exploring. Other expanded branches are preserved.</p>';
}
function resetHierarchy(){
  state.graphHistory=[];
  state.hierarchy=true;state.expanded.clear();state.navPath=[];state.focus=null;state.selected=null;
  updateGraph();
  $('#inspector').innerHTML='<div class="eyebrow">GRAPH OVERVIEW</div><h3>Four entry points.</h3><p>Select Product, Component, Process or Material to inspect its contents, then expand the group.</p><p>Use the breadcrumb trail and Back to move between levels. Collapse group closes only that branch.</p>';
}
function showAllEntities(){
  state.graphHistory=[];state.hierarchy=false;state.focus=null;state.navPath=[];state.selected=null;
  updateGraph();
}
function setView(view,loadDefault=true){
  state.view=view;
  document.querySelectorAll('[data-view]').forEach(button=>{
    const active=button.dataset.view===view;button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  $('#fusion-view').hidden=view!=='fusion'; $('#replay-view').hidden=view!=='replay';
  if($('#papers-view'))$('#papers-view').hidden=view!=='papers';
  if($('#about-view'))$('#about-view').hidden=view!=='about';
  if($('#overview-view'))$('#overview-view').hidden=view!=='overview';
  $('#fusion-controls').hidden=view!=='fusion'; $('#case-on-graph').hidden=view!=='replay';
  $('#case-controls').hidden=view!=='replay';
  walkthrough?.viewChanged(view);
  if(view==='fusion'){resize();} else if(view==='replay'&&loadDefault&&state.case?.id!==$('#case-select').value){openReplay($('#case-select').value);}
}
function initializePositions(){
  const papers=state.data.sources.filter(s=>s.kind==='paper');
  const groups=new Map(papers.map((s,i)=>[s.id,{x:680*Math.cos(i/papers.length*Math.PI*2),y:680*Math.sin(i/papers.length*Math.PI*2),nodes:[]}]));
  const catalogs=state.data.sources.filter(s=>s.kind==='catalog');
  catalogs.forEach((s,i)=>groups.set(s.id,{x:-1150+(i%3)*120,y:-640+Math.floor(i/3)*220,nodes:[]}));
  groups.set('',{x:0,y:0,nodes:[]});
  state.data.nodes.forEach(node=>groups.get(node.source)?.nodes.push(node));
  groups.forEach((group,key)=>group.nodes.forEach((node,i)=>{
    const theta=i*2.399963, radius=(key?12:30)*Math.sqrt(i+1);
    state.positions.set(node.id,{x:group.x+radius*Math.cos(theta),y:group.y+radius*Math.sin(theta)});
  }));
}
function updateGraph(fit=true){
  const source=$('#source-filter').value, kind=$('#type-filter').value;
  const families=kind.endsWith('Family')||state.nodes.get(state.focus)?.type.endsWith('Family');
  let edges=state.data.edges.filter(e=>($('#fusion-toggle').checked||!e.fusion)&&(!$('#relation-filter').value||e.predicate===$('#relation-filter').value));
  let nodes=state.data.nodes;
  if(source){
    edges=edges.filter(e=>e.sources.includes(source));
    const ids=new Set(edges.flatMap(e=>[e.source,e.target]));
    nodes=nodes.filter(n=>n.source===source||ids.has(n.id));
  }
  nodes=nodes.filter(n=>(families || !n.type.endsWith('Family')) && (!kind||n.type===kind));
  const allowed=new Set(nodes.map(n=>n.id));
  edges=edges.filter(e=>allowed.has(e.source)&&allowed.has(e.target));
  if(state.focus){
    const ids=new Set(allowed.has(state.focus)?[state.focus]:[]);
    edges.forEach(e=>{if(e.source===state.focus||e.target===state.focus){ids.add(e.source);ids.add(e.target);}});
    nodes=nodes.filter(n=>ids.has(n.id)); edges=edges.filter(e=>ids.has(e.source)&&ids.has(e.target));
  }
  state.shownNodes=nodes; state.shownEdges=edges;
  state.visibleEntityIds=new Set(nodes.map(node=>node.id));
  state.localPositions=null;
  if(state.focus || source){
    const levels=new Map();
    if(state.focus){
      levels.set(state.focus,0);
      edges.forEach(edge=>{
        if(edge.source===state.focus&&!levels.has(edge.target))levels.set(edge.target,1);
        if(edge.target===state.focus&&!levels.has(edge.source))levels.set(edge.source,1);
      });
    }else{
      nodes.forEach(node=>levels.set(node.id,['Product','Component','Process','Material','ProductFamily','MethodFamily'].indexOf(node.type)));
    }
    const columns=new Map();
    nodes.forEach(node=>{const level=levels.get(node.id)??0;if(!columns.has(level))columns.set(level,[]);columns.get(level).push(node);});
    state.localPositions=new Map();
    columns.forEach((group,level)=>group.sort((a,b)=>a.label.localeCompare(b.label)).forEach((node,i)=>{
      state.localPositions.set(node.id,{x:level*400,y:(i-(group.length-1)/2)*75});
    }));
  }
  $('#visible-stats').textContent=`${nodes.length} entities · ${edges.length} displayed relations · ${edges.filter(e=>e.fusion).length} fusion links`;
  if(state.hierarchy){
    const projection=state.hierarchyData.project(nodes,edges,state.expanded);
    state.shownNodes=projection.nodes;state.shownEdges=projection.edges;
    state.localPositions=state.hierarchyData.positions(projection.nodes);
    $('#visible-stats').textContent=`${projection.nodes.length} displayed nodes · ${nodes.filter(n=>!n.type.endsWith('Family')).length} underlying entities`;
  }
  state.displayNodes=new Map(state.shownNodes.map(node=>[node.id,node]));
  if(state.selected && !(state.selected.kind==='node'?state.displayNodes.has(state.selected.id):state.shownEdges.some(edge=>edge.id===state.selected.id)))state.selected=null;
  updateGraphBrowser();updateNavigation();$('#graph-tooltip').hidden=true;
  if(fit) fitGraph(); else draw();
}
// Native controls expose the same displayed graph to keyboard users.
function updateGraphBrowser(){
  const fill=(id,items,label)=>{
    const select=$(id),value=select.value;
    select.replaceChildren(...items.map(item=>new Option(label(item),item.id)));
    if(items.some(item=>item.id===value))select.value=value;
    select.disabled=!items.length;
  };
  fill('#graph-node-select',state.shownNodes,node=>`${node.label} · ${node.group?'Group':node.type+(node.source?' · '+sourceName(node.source):'')}`);
  fill('#graph-edge-select',state.shownEdges,edge=>edge.members?`${displayNode(edge.source).label} ↔ ${displayNode(edge.target).label} · ${relationName(edge)}`:`${displayNode(edge.source).label} → ${relationName(edge)} → ${displayNode(edge.target).label}`);
  $('#graph-node-inspect').disabled=$('#graph-node-open').disabled=!state.shownNodes.length;
  $('#graph-edge-inspect').disabled=!state.shownEdges.length;
}
function inspectGraphSelection(kind,open=false){
  const id=$(kind==='node'?'#graph-node-select':'#graph-edge-select').value;if(!id)return;
  if(kind==='edge')selectEdge(id);else if(open)focusNode(id);else selectNode(id);
  const inspector=$('#inspector');inspector.tabIndex=-1;inspector.focus({preventScroll:true});
}
function resize(){
  if(state.view!=='fusion')return;
  const rect=canvas.getBoundingClientRect(); width=rect.width;height=rect.height;
  const dpr=window.devicePixelRatio||1;canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
  fitGraph();
}
function fitGraph(){
  if(!width||!height)return;
  const points=state.shownNodes.map(n=>(state.localPositions||state.positions).get(n.id));
  if(!points.length){draw();return;}
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  zoom=Math.min((width-240)/Math.max(150,right-left),(height-160)/Math.max(150,bottom-top),2.5);
  offset={x:(width-110)/2-((left+right)/2)*zoom,y:height/2-((top+bottom)/2)*zoom+10};draw();
}
function point(id){const p=(state.localPositions||state.positions).get(id);return {x:p.x*zoom+offset.x,y:p.y*zoom+offset.y};}
function draw(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;paint();});}
function paintArrow(source,target){
  const a=point(source),b=point(target),node=displayNode(target),angle=Math.atan2(b.y-a.y,b.x-a.x);
  const bounds=nodeBounds(node);
  const radius=(isCatalog(node)?1/Math.max(Math.abs(Math.cos(angle))/bounds.x,Math.abs(Math.sin(angle))/bounds.y):bounds.x)+4;
  if(Math.hypot(b.x-a.x,b.y-a.y)<=radius)return;
  const x=b.x-Math.cos(angle)*radius,y=b.y-Math.sin(angle)*radius;
  ctx.setLineDash([]);ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(x,y);
  ctx.lineTo(x-9*Math.cos(angle-.45),y-9*Math.sin(angle-.45));ctx.lineTo(x-9*Math.cos(angle+.45),y-9*Math.sin(angle+.45));ctx.fill();
}
function paint(){
  ctx.clearRect(0,0,width,height);
  edgeLabels=[];
  ctx.fillStyle='#e3ece6';for(let x=((offset.x%30)+30)%30;x<width;x+=30)for(let y=((offset.y%30)+30)%30;y<height;y+=30)ctx.fillRect(x,y,1,1);
  const chosen=state.selected?.kind==='node'?state.selected.id:null;
  const nameCounts=new Map();
  for(const node of state.shownNodes)if(!node.group)nameCounts.set(node.label,(nameCounts.get(node.label)||0)+1);
  const adjacent=new Set();if(chosen)state.shownEdges.forEach(e=>{if(e.source===chosen||e.target===chosen){adjacent.add(e.source);adjacent.add(e.target);}});
  const isRoot=id=>displayNode(id)?.group&&displayNode(id).level===0;
  const selectedEdgeId=state.selected?.kind==='edge'?state.selected.id:null;
  const ordered=[...state.shownEdges].sort((a,b)=>(a.id===selectedEdgeId)-(b.id===selectedEdgeId));
  for(const edge of ordered){
    const a=point(edge.source),b=point(edge.target),selected=selectedEdgeId===edge.id;
    const touches=chosen&&(edge.source===chosen||edge.target===chosen);
    // In the grouped view, links from opened types/families stay faint until one end is selected.
    const quiet=state.hierarchy&&!(isRoot(edge.source)&&isRoot(edge.target))&&!touches&&!selected;
    ctx.globalAlpha=quiet?.09:chosen&&!touches ? .2 : 1;
    ctx.strokeStyle=selected?'#c27032':edge.fusion?'#1c8a78':'#8fa5a3';ctx.lineWidth=selected?2.8:edge.fusion?1.8:touches?1.4:1;
    ctx.setLineDash(edge.fusion?[7,3,2,3]:[]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    if(edge.members){
      // Summary endpoints are sorted for grouping, not ordered by triple direction.
      const targets=new Set(Object.keys(edge.directions).map(direction=>JSON.parse(direction)[2]));
      for(const target of targets)paintArrow(target===edge.source?edge.target:edge.source,target);
    }else paintArrow(edge.source,edge.target);
    if(edge.members){
      if(quiet)continue;
      const t=Math.abs(b.x-a.x)>60&&Math.abs(b.y-a.y)>60?.27:.5,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t-8;
      const counts=Object.entries(edge.predicates).sort((a,b)=>b[1]-a[1]);
      const lines=counts.slice(0,2).map(([predicate,count])=>(labels[predicate]||predicate)+' · '+count);
      if(counts.length>2)lines.push(`+${counts.length-2} more types · ${edge.members.length} total`);
      ctx.globalAlpha=1;ctx.font='10px sans-serif';const size=Math.max(...lines.map(line=>ctx.measureText(line).width));
      ctx.fillStyle='#fafcfbf2';ctx.fillRect(x-5,y-12,size+10,lines.length*15+5);
      ctx.fillStyle=selected?'#a45d2c':'#506b66';lines.forEach((line,index)=>ctx.fillText(line,x,y+index*15));
      edgeLabels.push({id:edge.id,x:x-5,y:y-12,width:size+10,height:lines.length*15+5});continue;
    }
    if(selected||(touches&&!state.hierarchy)){const label=(edge.fusion?'⇢ fusion · ':'')+relationName(edge);ctx.font=`${selected?'600 ':''}10px sans-serif`;const mx=(a.x+b.x)/2,my=(a.y+b.y)/2-7,w=ctx.measureText(label).width;
      ctx.fillStyle='#fafcfbe6';ctx.fillRect(mx-w/2-4,my-10,w+8,14);ctx.fillStyle=selected?'#a45d2c':edge.fusion?'#17705f':'#506b66';ctx.textAlign='center';ctx.fillText(label,mx,my);ctx.textAlign='left';}
  }
  ctx.globalAlpha=1;ctx.setLineDash([]);
  for(const node of state.shownNodes){
    const p=point(node.id),selected=chosen===node.id,r=nodeSize(node)+(selected&&!node.group?4:0),bounds=nodeBounds(node);
    if(p.x< -100||p.x>width+100||p.y< -50||p.y>height+50)continue;
    ctx.globalAlpha=chosen&&!adjacent.has(node.id)&&!selected ? .35 : 1;
    if(selected){ctx.fillStyle='#c2703233';ctx.beginPath();ctx.arc(p.x,p.y,r+9,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle=colors[node.type]||'#8c979b';ctx.beginPath();
    // Groups are counted circles; catalog records are squares.
    if(isCatalog(node))ctx.rect(p.x-bounds.x,p.y-bounds.y,bounds.x*2,bounds.y*2);else ctx.arc(p.x,p.y,r,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle=selected?'#112f34':isCatalog(node)?'#e4ab61':'#fff';ctx.lineWidth=selected?3:isCatalog(node)?2:1;ctx.stroke();
    if(node.group){
      ctx.globalAlpha=1;ctx.fillStyle=node.level===0?'#fff':'#ffffff';ctx.font=`600 ${node.level===0?'20':'11'}px sans-serif`;ctx.textAlign='center';ctx.fillText(node.members.length,p.x,p.y+(node.level===0?6:4));
      const max=node.level===0?35:20,label=node.label.length>max?node.label.slice(0,max-2)+'…':node.label;
      ctx.font=`600 ${node.level===0?13:11}px sans-serif`;ctx.lineWidth=3;ctx.strokeStyle='#fafcfb';ctx.strokeText(label,p.x,p.y+bounds.y+15);ctx.fillStyle='#25424a';ctx.fillText(label,p.x,p.y+bounds.y+15);
      if(node.level>0){ctx.font='9px sans-serif';ctx.fillStyle='#68817e';ctx.fillText(`${node.members.length} ${node.members.length===1?'entity':'entities'} · group`,p.x,p.y+bounds.y+27);}
      ctx.textAlign='left';continue;
    }
    const source=nameCounts.get(node.label)>1?nodeSourceLabel(node,true):'';
    if(state.hierarchy){const label=node.label.length>22?node.label.slice(0,20)+'…':node.label;ctx.textAlign='center';
      ctx.font=`${selected?'600 ':''}10px sans-serif`;ctx.lineWidth=3;ctx.strokeStyle='#fafcfb';ctx.strokeText(label,p.x,p.y+r+13);ctx.fillStyle='#314b50';ctx.fillText(label,p.x,p.y+r+13);
      if(source){ctx.font='9px sans-serif';ctx.fillStyle='#506b66';ctx.fillText(source,p.x,p.y+r+26);}
      ctx.textAlign='left';continue;}
    if(zoom>.8||selected||adjacent.has(node.id)||state.shownNodes.length<50){const label=node.label.length>34?node.label.slice(0,32)+'…':node.label;
      ctx.font=`${selected?'600 13':'11'}px -apple-system, sans-serif`;ctx.lineWidth=3;ctx.strokeStyle='#fafcfb';ctx.strokeText(label,p.x+r+6,p.y+4);ctx.fillStyle=selected?'#112f34':'#314b50';ctx.fillText(label,p.x+r+6,p.y+4);
      if(source){ctx.font='9px sans-serif';ctx.fillStyle='#506b66';ctx.fillText(source,p.x+r+6,p.y+17);}}
  }ctx.globalAlpha=1;
  if(!state.shownNodes.length){ctx.fillStyle='#68817e';ctx.font='14px sans-serif';ctx.fillText('No entities match. Clear the focus or adjust the filters.',25,height/2);}
}
function contextSummary(value){
  const summary=text(value).trim();if(!summary)return '';
  return summary.length>220?`<details class="context-summary"><summary><span>${esc(summary)}</span><small class="context-more">Read more</small><small class="context-less">Read less</small></summary></details>`:`<p class="sample-context">${esc(summary)}</p>`;
}
function processDetailsCard(node){
  const process=node.process;if(node.type!=='Process'||!process)return '';
  const overview=process.overview?`<section class="node-scope"><h4>Method overview</h4>${contextSummary(process.overview)}</section>`:'';
  const resources=fields({Reagents:process.reagents,Equipment:process.equipment});
  const settings=(process.settings||[]).map(setting=>{
    const conditions=setting.condition_summary?contextSummary(setting.condition_summary):
      (setting.condition_keys||[]).map(c=>fields({[String(c.key).replaceAll('_',' ')]:[text(c.value),c.unit].filter(Boolean).join(' ')})).join('');
    return `<details class="process-setting"><summary>${esc(setting.name||'Experimental setting')}</summary>${fields({Sample:setting.sample,Treatment:setting.treatment})}${conditions}</details>`;
  }).join('');
  return overview+(resources?`<section class="node-scope">${resources}</section>`:'')+
    (settings?`<section class="node-scope"><h4>Experimental settings · ${process.settings.length}</h4><p class="muted">Open a result to view its conditions.</p>${settings}</section>`:'');
}
function nodeScopeCards(node){
  return (node.scopes||[]).map((scope,index)=>{
    const method=node.type==='Process'&&text(scope.methodFamily);
    const sample=['Product','Component'].includes(node.type)&&(text(scope.sampleType)||text(scope.populationGranularity));
    if(!method&&!sample)return '';
    const body=method?`<p class="method-family">${esc(method)}</p>`:
      `${fields({Type:scope.sampleType,Granularity:scope.populationGranularity,'Sample size':scope.sampleSize})}${contextSummary(scope.scopeDescription||scope.description)}`;
    const available=state.data.cases.some(item=>item.paper===node.source);
    return `<section class="node-scope"><h4>${method?'Method family':'Study sample'}</h4>${body}${available?`<button class="scope-evidence" data-scope-index="${index}">View ${method?'method':'sample'} evidence →</button>`:''}</section>`;
  }).join('');
}
async function openScopeEvidence(node,scope){
  const item=state.data.cases.find(item=>item.paper===node.source);if(!item)return;
  await openReplay(item.id);
  if(state.case?.paper!==node.source)return;
  const records=state.case.stages.find(stage=>stage.id==='scope')?.records||[];
  const matches=records.filter(record=>(record.root_entity_ids||[]).some(id=>state.case.entity_map[id]===node.id)&&
    (text(scope.methodFamily)?record.method_family===text(scope.methodFamily):!record.method_family)&&
    (!list(scope.evidenceSpan).length||list(scope.evidenceSpan).includes(record.evidence_span)));
  state.stage='scope';state.sourceTab='text';
  if(matches.length===1){
    const record=matches[0];
    state.spotlight={case:state.case.id,target:{stage:'scope',kind:'scope',data:record,raw:record},label:scope.methodFamily?'METHOD EVIDENCE':'SAMPLE EVIDENCE'};
    locateRecord(record);
  }else notify('No unique Scope record matches this entity. Browse the paper’s Scope records.');
  renderStage();scrollOutputTo('#walkthrough-target');
}
async function openProcessEvidence(node){
  const item=state.data.cases.find(item=>item.paper===node.source);if(!item)return;
  await openReplay(item.id);if(state.case?.paper!==node.source)return;
  state.stage='process';state.sourceTab='text';
  const matches=(state.case.process_inventory?.final||[]).filter(record=>record.node_id===node.id);
  if(matches.length===1){
    const record=matches[0];
    state.spotlight={case:state.case.id,target:{stage:'process',kind:'published_process',data:record,raw:record},label:'PROCESS EVIDENCE'};
    const quotes=[record.evidence_span,...(state.case.stages.find(stage=>stage.id==='scope')?.records||[])
      .filter(scope=>(scope.root_entity_ids||[]).some(id=>state.case.entity_map[id]===node.id)).map(scope=>scope.evidence_span)];
    const quote=quotes.find(value=>value&&state.case.text.includes(value));
    locateRecord(quote?{evidence_span:quote}:record);
  }
  renderStage();scrollOutputTo('#walkthrough-target');
}
function selectNode(id){
  if(displayNode(id)?.group){selectGroup(id);return;}
  const node=state.nodes.get(id);if(!node)return;state.selected={kind:'node',id};state.navPath=state.hierarchyData.path(id);updateNavigation();draw();
  const connections=state.shownEdges.filter(e=>e.source===id||e.target===id);
  const scopeCards=nodeScopeCards(node);
  const attributes=Object.fromEntries(Object.entries(node.attrs||{}).filter(([key])=>!['label','description','canonicalType'].includes(key)).map(([key,value])=>[key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase()),value]));
  $('#inspector').innerHTML=`<span class="tag">${esc(node.type)}${isCatalog(node)?' · CATALOG':''}</span><h3>${esc(node.label)}</h3><p>${esc(sourceName(node.source))}</p><div class="button-row"><button id="expand-node">Explore connections</button><button id="node-replay">${node.type==='Process'?'View process evidence':'Open paper replay'}</button></div>${fields({Source:isCatalog(node)?'GSMArena':null,...attributes})}${scopeCards}${processDetailsCard(node)}<h4>Relations in this view · ${connections.length}</h4><div id="connections"></div>${jsonDetails(node)}`;
  $('#expand-node').onclick=()=>focusNode(id);
  const match=state.data.cases.find(c=>c.paper===node.source);$('#node-replay').hidden=!match;
  $('#node-replay').onclick=()=>node.type==='Process'?openProcessEvidence(node):openReplay(match.id);
  $('#inspector').querySelectorAll('.scope-evidence').forEach(button=>{button.onclick=()=>openScopeEvidence(node,node.scopes[Number(button.dataset.scopeIndex)]);});
  for(const edge of connections){const button=document.createElement('button');button.className='connection';
      button.innerHTML=`${esc(relationName(edge))} <small>${esc(displayNode(edge.source===id?edge.target:edge.source).label)}${edge.members||edge.records.length?' · ':''}${edge.members?edge.members.length+' underlying relations':edge.records.length?edge.records.length+' evidence / observation records':''}</small>`;
    button.onclick=()=>selectEdge(edge.id);$('#connections').append(button);}
  $('#inspector').scrollTop=0;
}
function replaySource(edge,record){
  const declared=list(record.sourcePaper);
  const candidates=declared.length?declared:edge.sources;
  const sources=state.data.sources.filter(source=>source.kind==='paper'&&source.replay_url&&candidates.includes(source.id));
  return sources.length===1?sources[0]:null;
}
function selectEdge(id,selectedRecord=null){
  const aggregate=state.shownEdges.find(edge=>edge.id===id&&edge.members);
  if(aggregate){
    state.selected={kind:'edge',id};draw();
    const rows=Object.entries(aggregate.directions).map(([key,count])=>{const [from,predicate,to]=JSON.parse(key);return `<tr><td>${esc(displayNode(from).label)}</td><td>${esc(labels[predicate]||predicate)}</td><td>${esc(displayNode(to).label)}</td><td>${count}</td></tr>`;}).join('');
    $('#inspector').innerHTML=`<span class="tag">DISPLAY SUMMARY</span><h3>${esc(displayNode(aggregate.source).label)} ↔ ${esc(displayNode(aggregate.target).label)}</h3><p>${aggregate.members.length} underlying relations.</p><table class="relation-breakdown"><thead><tr><th>From</th><th>Relation</th><th>To</th><th>Count</th></tr></thead><tbody>${rows}</tbody></table><h4>Original relations</h4><div id="summary-relations"></div>`;
    let count=0;
    const more=()=>{const container=$('#summary-relations');container.querySelector('.load-more')?.remove();for(const member of aggregate.members.slice(count,count+25)){const edge=state.data.edges.find(item=>item.id===member);const button=document.createElement('button');button.className='connection';button.textContent=state.nodes.get(edge.source).label+' → '+relationName(edge)+' → '+state.nodes.get(edge.target).label;button.onclick=()=>selectEdge(member);container.append(button);}count+=25;if(count<aggregate.members.length){const button=document.createElement('button');button.className='load-more';button.textContent='Load more relations';button.onclick=more;container.append(button);}};
    more();$('#inspector').scrollTop=0;return;
  }
  const edge=state.data.edges.find(e=>e.id===id);if(!edge)return;state.selected={kind:'edge',id};draw();
  const sourceNode=state.nodes.get(edge.source),targetNode=state.nodes.get(edge.target);
  const catalogSource=sourceNode.source===targetNode.source
    ? state.data.sources.find(source=>source.id===sourceNode.source&&source.kind==='catalog') : null;
  const fusionNote=edge.predicate==='observedForProductModel'?
    'Links the study sample to its catalog model.':
    '';
  $('#inspector').innerHTML=`<span class="tag">${edge.fusion?'FUSION LINK':catalogSource?'CATALOG RELATION':'SOURCE RELATION'}</span><h3>${esc(sourceNode.label)}</h3><span class="tag">${esc(relationName(edge))} →</span><h3>${esc(targetNode.label)}</h3>${catalogSource?`<p>Catalog · ${esc(catalogSource.label)}</p>${fields({Source:'GSMArena'})}`:''}${edge.records.length?`<p>${edge.records.length} evidence / observation records.</p>`:''}${edge.fusion&&fusionNote?`<p>${esc(fusionNote)}</p>`:''}<div id="edge-records"></div>`;
  const records=selectedRecord?[selectedRecord,...edge.records.filter(record=>record!==selectedRecord)]:edge.records;
  let shown=0;
  function more(){
    $('#edge-records .load-more')?.remove();
    for(const record of records.slice(shown,shown+20)){
      const card=document.createElement('div');card.className='observation'+(record===selectedRecord?' trace-highlight':'');
      const value=text(record.observationValue),unit=text(record.observationUnit);
      card.innerHTML=`${value?`<strong>${esc(value)} ${esc(unit)}</strong>`:''}${fields({Measure:record.observationProperty,Uncertainty:record.observationUncertainty,Qualifier:record.observationQualifier,'Source sample':record.sourceSample,'Sample state':record.sampleState,'Measurement basis':record.measurementBasis})}${conditionFields({Condition:record.condition,'Condition labels':record.conditionLabel,'Setting condition':record.settingCondition})}${edge.fusion?`<details><summary>Link details</summary>${fields({Basis:record.linkBasis,Reason:record.linkReason,'Alignment score':record.alignmentScore,'Scope role':record.scopeRole})}</details>`:''}${text(record.sourcePaper)?`<p class="record-source" title="${esc(text(record.sourcePaper))}">Source: ${esc(text(record.sourcePaper))}</p>`:''}${text(record.evidenceSpan)?`<p class="evidence">${esc(text(record.evidenceSpan))}</p>`:''}${jsonDetails(record)}`;
      const source=replaySource(edge,record);
      if(source){const button=document.createElement('button');button.textContent='View evidence in replay';button.onclick=()=>openReplay(source.replay_id,text(record.evidenceSpan),text(record.tableId),{edge,record});card.append(button);}
      $('#edge-records').append(card);
    }shown+=20;
    if(shown<edge.records.length){const button=document.createElement('button');button.className='load-more';button.textContent=`More records (${edge.records.length-shown} remaining)`;button.onclick=more;$('#edge-records').append(button);}
  }more();
  if(!edge.records.length&&!catalogSource)$('#edge-records').innerHTML='<p>No source passage available.</p>';
  $('#inspector').scrollTop=0;
}
function selectGroup(id){
  const raw=state.hierarchyData.groups.get(id);if(!raw)return;
  const group={...raw,members:raw.members.filter(member=>state.visibleEntityIds.has(member))};
  state.selected=state.displayNodes.has(id)?{kind:'node',id}:null;
  state.navPath=state.hierarchyData.path(id);updateNavigation();draw();
  const children=group.children.filter(child=>state.hierarchyData.groups.get(child).members.some(member=>group.members.includes(member)));
  const members=children.length?children:group.members;
  $('#inspector').innerHTML=`<span class="tag">${group.level===0?'Category':'Group'}</span><h3>${esc(group.label)} · ${group.members.length} records</h3><div class="button-row"><button id="expand-group" ${state.expanded.has(id)?'disabled':''}>Open group</button><button id="collapse-group" ${state.expanded.has(id)?'':'disabled'}>Collapse group</button></div><h4>${children.length?'Groups':'Records'} · ${members.length}</h4><div id="group-members"></div>`;
  $('#expand-group').onclick=()=>expandGroup(id);
  $('#collapse-group').onclick=()=>collapseGroup(id);
  for(const member of members){const node=state.hierarchyData.groups.get(member)||state.nodes.get(member);const button=document.createElement('button');button.className='connection';button.innerHTML=`${esc(node.label)}<small>${node.group?node.members.filter(entity=>group.members.includes(entity)).length+' records':esc(nodeSourceLabel(node))}</small>`;button.title=nodeSourceLabel(node)||node.label;button.onclick=()=>{if(node.group){state.expanded.add(id);updateGraph();selectGroup(member);}else focusNode(member);};$('#group-members').append(button);}
  $('#inspector').scrollTop=0;
}
function expandGroup(id){state.graphHistory=[];state.hierarchyData.path(id).forEach(group=>state.expanded.add(group));updateGraph();selectGroup(id);}
function focusNode(id,clearFilters=false){
  if(displayNode(id)?.group){expandGroup(id);return;}
  const filters=['source-filter','type-filter','relation-filter'];
  if(state.focus===id&&!state.hierarchy&&(!clearFilters||filters.every(key=>!$('#'+key).value))){selectNode(id);return;}
  rememberGraph();
  if(clearFilters)for(const key of filters)$('#'+key).value='';
  state.hierarchy=false;state.focus=id;updateGraph();selectNode(id);
}
function searchNodes(){
  const query=$('#search').value.trim().toLowerCase();$('#search-results').replaceChildren();if(!query)return;
  const rank=node=>node.label.toLowerCase()===query?0:node.label.toLowerCase().includes(query)?1:2;
  const found=state.data.nodes.filter(n=>(n.label+' '+n.type+' '+sourceName(n.source)).toLowerCase().includes(query)).sort((a,b)=>rank(a)-rank(b)||Number(isCatalog(b))-Number(isCatalog(a))||a.label.localeCompare(b.label));
  for(const node of found.slice(0,25)){const button=document.createElement('button');button.className='search-result';button.setAttribute('role','listitem');button.innerHTML=`${esc(node.label)}<small>${esc(node.type+' · '+sourceName(node.source))}</small>`;
    button.onclick=()=>focusNode(node.id,true);$('#search-results').append(button);}
  if(!found.length)$('#search-results').textContent='No matching entities.';
}
function hitTest(x,y){
  const node=state.shownNodes.slice().reverse().find(n=>{const p=point(n.id),bounds=nodeBounds(n);return isCatalog(n)?Math.abs(p.x-x)<bounds.x+5&&Math.abs(p.y-y)<bounds.y+5:Math.hypot(p.x-x,p.y-y)<bounds.x+5;});if(node)return {kind:'node',id:node.id};
  const label=edgeLabels.find(label=>x>=label.x&&x<=label.x+label.width&&y>=label.y&&y<=label.y+label.height);if(label)return {kind:'edge',id:label.id};
  let nearest=null, distance=7;
  for(const edge of state.shownEdges){const a=point(edge.source),b=point(edge.target),dx=b.x-a.x,dy=b.y-a.y;const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));const d=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);if(d<distance){nearest={kind:'edge',id:edge.id};distance=d;}}return nearest;
}
function scale(factor,x=width/2,y=height/2){const previous=zoom;zoom=Math.max(.08,Math.min(10,zoom*factor));offset={x:x-(x-offset.x)*zoom/previous,y:y-(y-offset.y)*zoom/previous};draw();}
function showTooltip(event){
  const tooltip=$('#graph-tooltip'),hit=hitTest(event.offsetX,event.offsetY);
  if(!hit){tooltip.hidden=true;canvas.style.cursor='grab';return;}
  canvas.style.cursor=hit.kind==='edge'?'pointer':'grab';
  if(hit.kind==='node'){
    const node=displayNode(hit.id);
    tooltip.innerHTML=`<strong>${esc(node.label)}</strong><div>${node.group?node.members.length+' records':esc(nodeSourceLabel(node))}</div><div class="muted">Double-click to ${node.group?'open group':'explore connections'}.</div>`;
  }else{
    const edge=state.shownEdges.find(edge=>edge.id===hit.id),counts=edge.predicates||{[edge.predicate]:1};
    tooltip.innerHTML=`<strong>${esc(displayNode(edge.source).label)} ${edge.members?'↔':'→'} ${esc(displayNode(edge.target).label)}</strong>${Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([predicate,count])=>`<div>${esc(labels[predicate]||predicate)} · ${count}</div>`).join('')}<div class="muted">Click to inspect relations.</div>`;
  }
  tooltip.hidden=false;
  tooltip.style.left=Math.max(8,Math.min(event.offsetX+15,width-tooltip.offsetWidth-8))+'px';
  tooltip.style.top=Math.max(8,Math.min(event.offsetY+15,height-tooltip.offsetHeight-8))+'px';
}
canvas.addEventListener('wheel',e=>{e.preventDefault();scale(Math.exp(-e.deltaY*.0015),e.offsetX,e.offsetY);},{passive:false});
canvas.addEventListener('pointerdown',e=>{
  if(pointer||e.button!==0)return;
  const hit=hitTest(e.offsetX,e.offsetY),positions=state.localPositions||state.positions;
  $('#graph-tooltip').hidden=true;
  pointer={id:e.pointerId,hit,positions,startX:e.offsetX,startY:e.offsetY,moved:false,
    origin:{...(hit?.kind==='node'?positions.get(hit.id):offset)}};
  canvas.style.cursor=hit?.kind==='edge'?'pointer':'grabbing';
  canvas.setPointerCapture(e.pointerId);e.preventDefault();
});
canvas.addEventListener('pointermove',e=>{
  if(!pointer){showTooltip(e);return;}
  if(e.pointerId!==pointer.id)return;
  const dx=e.offsetX-pointer.startX,dy=e.offsetY-pointer.startY;
  if(!pointer.moved&&Math.hypot(dx,dy)<=4)return;
  pointer.moved=true;
  if(pointer.hit?.kind==='node')pointer.positions.set(pointer.hit.id,{x:pointer.origin.x+dx/zoom,y:pointer.origin.y+dy/zoom});
  else if(!pointer.hit)offset={x:pointer.origin.x+dx,y:pointer.origin.y+dy};
  draw();
});
canvas.addEventListener('pointerleave',()=>{$('#graph-tooltip').hidden=true;});
function finishPointer(e){
  if(!pointer||e.pointerId!==pointer.id)return;
  const gesture=pointer;pointer=null;canvas.style.cursor='grab';
  if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  if(e.type==='pointerup'&&!gesture.moved&&gesture.hit){const hit=gesture.hit;hit.kind==='node'?selectNode(hit.id):selectEdge(hit.id);}
}
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,finishPointer);
canvas.addEventListener('dblclick',e=>{const hit=hitTest(e.offsetX,e.offsetY);if(hit?.kind==='node')focusNode(hit.id);});
canvas.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='=')scale(1.25);if(e.key==='-')scale(.8);if(e.key==='Escape')goUp();});

function renderCaseSelection(){
  const item=state.data.cases.find(item=>item.id===$('#case-select').value);
  if(item)$('#case-summary').innerHTML=`<p><span class="tag">${esc(item.tag)}</span></p><p>${esc(item.description)}</p><p>${item.triple_count} final relations · ${item.tables} tables</p>`;
}
async function loadCase(id){
  const request=++state.request;notify('Loading archived case…');
  try{
    const source=state.data.sources.find(source=>source.replay_id===id);
    if(!state.cache.has(id))state.cache.set(id,await fetchJSON(source?.replay_url||`data/cases/${id}.json`));
    if(request!==state.request)return false;
    if(state.case?.id!==id)state.cellLookup=null;
    state.case=state.cache.get(id);
    if(state.case.source_only){state.stage='final';walkthrough?.reset();}
    else if($('#case-select').value!==id){$('#case-select').value=id;walkthrough?.reset();}
    state.cellIndex=Replay.cellIndex(state.case);$('#case-title').textContent=state.case.paper;
    $('.replay-note').textContent=state.case.source_only?'Explore this paper’s final relations and source evidence.':'Explore processes, entities and relations, and trace their supporting text and tables.';
    const item=state.case;
    renderCaseSelection();
    $('#stages').innerHTML=processMap(item);
    $('#stages').querySelectorAll('button').forEach(b=>b.onclick=()=>selectStage(b.dataset.stage));
    renderTrace();renderSource();renderStage();notify('');return true;
  }catch(error){if(request===state.request)notify('Case loading failed: '+error.message);return false;}
}
async function openReplay(id,evidence='',table=null,origin=null){
  clearOverviewEvidence();
  state.trace=null;state.spotlight=null;state.cellLookup=null;state.evidence=evidence;state.table=table;state.located=null;state.sourceTab=table?'tables':'text';
  state.locationSummary=false;state.textChoice=null;
  $('#record-search').value='';
  // Avoid the default replay tab's automatic load racing the requested case.
  setView('replay',false);
  if(!await loadCase(id))return;
  if(!origin)return;
  const result=Trace.resolve(state.case,origin.edge,origin.record);
  state.trace={...origin,...result,active:result.preferred};renderTrace();
  if(result.preferred)selectTraceTarget(result.preferred);
  else{state.stage=!state.case.source_only&&(origin.edge.fusion||text(origin.record.linkOrigin).startsWith('scope'))?'scope':'final';renderStage();}
}
function selectTraceTarget(target){
  state.trace.active=target;state.stage=target.stage;$('#record-search').value='';
  locateRecord(target.data);renderTrace();renderStage();
  scrollOutputTo('#trace-target');
}
function scrollOutputTo(selector,reveal=false){
  requestAnimationFrame(()=>{
    const pane=$('.output-pane'),card=$(selector);
    if(!card?.isConnected)return;
    pane.scrollTop+=card.getBoundingClientRect().top-pane.getBoundingClientRect().top-pane.querySelector('.pane-heading').offsetHeight-12;
    if(reveal){card.tabIndex=-1;card.focus({preventScroll:true});}
    if(reveal&&window.matchMedia('(max-width:800px)').matches)pane.scrollIntoView({block:'start'});
  });
}
function renderTrace(){
  const panel=$('#trace-panel'),trace=state.trace;panel.replaceChildren();panel.hidden=!trace;if(!trace)return;
  const heading=document.createElement('strong');heading.textContent='GRAPH → ARCHIVED OUTPUT → SOURCE EVIDENCE';panel.append(heading);
  const relation=document.createElement('p');relation.textContent=state.nodes.get(trace.edge.source).label+' → '+relationName(trace.edge)+' → '+state.nodes.get(trace.edge.target).label;panel.append(relation);
  const note=document.createElement('p');note.textContent=trace.message;panel.append(note);
  const actions=document.createElement('div');actions.className='button-row';panel.append(actions);
  for(const [name,targets] of [['Final record',trace.final],['Earlier output',trace.origin],['Table Gate',trace.gate],['Source scope',trace.scope||[]]])targets.forEach((target,index)=>{
    const button=document.createElement('button');button.textContent=name+(targets.length>1?' '+(index+1):'');
    button.classList.toggle('active',trace.active===target&&state.stage===target.stage);button.onclick=()=>selectTraceTarget(target);actions.append(button);
  });
  const back=document.createElement('button');back.textContent='← Back to graph relation';back.onclick=()=>{setView('fusion');selectEdge(trace.edge.id,trace.record);};actions.append(back);
  const clear=document.createElement('button');clear.textContent='Clear trace';clear.onclick=()=>{state.trace=null;renderTrace();renderStage();};actions.append(clear);
}
function scrollSourceTo(element){
  if(!element?.isConnected)return;
  const pane=$('.source-pane'),tableScroll=element.closest('.table-scroll');
  if(tableScroll){
    const block=element.closest('.table-block');
    const available=pane.clientHeight-pane.querySelector('.pane-heading').offsetHeight-(tableScroll.getBoundingClientRect().top-block.getBoundingClientRect().top)-24;
    tableScroll.style.maxHeight=`min(52vh, ${Math.max(140,available)}px)`;
    const bounds=tableScroll.getBoundingClientRect(),rect=element.getBoundingClientRect();
    const heading=tableScroll.querySelector('thead')?.offsetHeight||0;
    if(rect.top<bounds.top+heading||rect.bottom>bounds.bottom)tableScroll.scrollTop+=rect.top-bounds.top-heading-8;
    if(rect.left<bounds.left||rect.right>bounds.right)tableScroll.scrollLeft+=rect.left-bounds.left-25;
  }
  const bounds=pane.getBoundingClientRect();
  const rect=(tableScroll?element.closest('.table-block'):element).getBoundingClientRect();
  pane.scrollTop+=rect.top-bounds.top-pane.querySelector('.pane-heading').offsetHeight-12;
}
function renderSource(){
  if(!state.case)return;
  for(const [id,tab] of [['#text-tab','text'],['#tables-tab','tables']]){
    $(id).classList.toggle('active',state.sourceTab===tab);$(id).setAttribute('aria-pressed',String(state.sourceTab===tab));
  }
  const container=$('#source-content');container.replaceChildren();
  const label=$('#source-match-label');label.hidden=true;
  if(state.sourceTab==='text'){
    const pre=document.createElement('div');pre.className='prose';const source=state.case.text,result=Replay.locateText(source,state.evidence);
    const choice=state.textChoice;
    const manual=choice?.case===state.case.id&&choice.query===state.evidence;
    const index=manual?choice.index:state.locationSummary?null:result.selected,match=index===null?null:result.matches[index];
    const approximate=state.locationSummary||!['exact','normalized'].includes(result.kind);
    let status=null;
    if(state.evidence){
      const title=state.locationSummary?(result.matches.length?'Summary search':'No matching passage'):result.kind==='exact'?'Exact match':result.kind==='normalized'?'Normalized match':match?'Approximate match':result.matches.length?'Choose a passage':'No matching passage';
      label.textContent=title;label.hidden=false;
      status=document.createElement('section');status.className='match-status';status.setAttribute('aria-label','Text location result');
      const heading=document.createElement('strong');heading.textContent=title;status.append(heading);
      if(result.matches.length&&approximate){const explanation=document.createElement('p');explanation.textContent='Choose a passage to inspect.';status.append(explanation);}
      if(result.matches.length&&(approximate||result.matches.length>1))result.matches.forEach((candidate,i)=>{
        const card=document.createElement('div');card.className='text-candidate';
        const button=document.createElement('button');button.textContent=`Candidate ${i+1} · text overlap ${Math.round(candidate.score*100)}%`;button.setAttribute('aria-pressed',String(index===i));
        button.onclick=()=>{state.textChoice={case:state.case.id,query:state.evidence,index:i};renderSource();};
        const excerpt=document.createElement('p');excerpt.textContent=source.slice(candidate.start,candidate.end);
        card.append(button,excerpt);
        if(candidate.conflicts.length){const warning=document.createElement('p');warning.className='notice';warning.textContent='Check: '+candidate.conflicts.join('; ')+'.';card.append(warning);}
        status.append(card);
      });
      const query=document.createElement('details'),summary=document.createElement('summary'),quotation=document.createElement('p');summary.textContent=state.locationSummary?'Search summary':'Archived quotation';quotation.textContent=state.evidence;query.append(summary,quotation);status.append(query);container.append(status);
    }
    if(match){
      pre.append(document.createTextNode(source.slice(0,match.start)));const mark=document.createElement('mark');mark.className=approximate?'text-approximate':'';mark.title=label.textContent;mark.textContent=source.slice(match.start,match.end);pre.append(mark,document.createTextNode(source.slice(match.end)));
    }else pre.textContent=source;
    container.append(pre);requestAnimationFrame(()=>scrollSourceTo(pre.querySelector('mark')||status));
  }else{
    const hint=document.createElement('p');hint.className='source-note';hint.textContent=state.case.source_only?'Click a cell to inspect its final-output records. Table Agent stages are not bundled for this paper.':'Click a cell to inspect its archived Table Agent and final-output records.';container.append(hint);
    state.case.tables.forEach((table,index)=>{
      const selected=state.table&&Replay.tableKey(table.table_id)===Replay.tableKey(state.table);
      const match=selected?Replay.tableMatch(table,state.located||{}):{};
      const block=document.createElement('article');block.className='table-block'+(selected?' source-table-selected':'');block.dataset.table=Replay.tableKey(table.table_id);
      block.innerHTML=`<h3>Table ${index+1} · ${esc(table.caption || table.table_id)}</h3><span class="muted">${esc(table.section || '')} · page ${esc(table.page_number ?? '—')}</span>${match.message?`<p class="match-status">${esc(match.message)}</p>`:''}<div class="table-scroll"><table><thead>${(table.header_rows?.length?table.header_rows:[table.headers||[]]).map(row=>'<tr>'+row.map((v,col)=>`<th class="${col===match.col?'source-column':''}">${esc(v)}</th>`).join('')+'</tr>').join('')}</thead><tbody>${(table.rows||[]).map((row,index)=>`<tr data-row="${index+1}" class="${index+1===match.row?'source-row':''}">`+row.map((v,col)=>`<td data-col="${col}" class="${index+1===match.row&&col===match.col?'source-cell':''}">${esc(v)}</td>`).join('')+'</tr>').join('')}</tbody></table></div>${jsonDetails(table)}`;container.append(block);
      block.querySelectorAll('tbody td').forEach(cell=>{
        const row=Number(cell.parentElement.dataset.row),col=Number(cell.dataset.col),value=cell.textContent;
        const button=document.createElement('button');button.className='cell-link';button.textContent=value||'\u00a0';
        button.setAttribute('aria-label',`Locate extraction: Table ${index+1}, data row ${row}, column ${col+1}: ${value}`);
        button.onclick=()=>openCell(table,row,col);cell.replaceChildren(button);
      });
    });
    if(state.table)requestAnimationFrame(()=>{const block=container.querySelector('.source-table-selected');scrollSourceTo(block?.querySelector('.source-cell')||block);});
  }
}
function locateRecord(record){
  if(state.cellLookup){state.cellLookup=null;renderStage();}
  const props=record.properties||record.attributes||{};
  state.located=record;state.evidence=record.location_query??Replay.evidence(record);state.locationSummary=!!record.location_is_summary;state.textChoice=null;
  state.table=record.table_id||props.table_id||record.semantic_ir_and_verification?.table_id;state.sourceTab=state.table?'tables':'text';renderSource();
}
function openCell(table,row,col){
  const targets=state.cellIndex.get(Replay.cellKey(table.table_id,row,col))||[];
  const local=targets.filter(target=>target.stage===state.stage),raw=targets.filter(target=>target.stage==='table');
  const active=local.length===1?local[0]:local.length>1?null:raw.length===1?raw[0]:raw.length===0&&targets.length===1?targets[0]:null;
  state.trace=null;state.spotlight=null;state.cellLookup={table,row,col,targets,active};
  state.table=table.table_id;state.evidence='';state.located={table_id:table.table_id,properties:{row_idx:row,col_idx:col,raw_cell:table.rows[row-1][col]}};
  state.locationSummary=false;state.textChoice=null;
  state.stage=active?.stage||(state.case.source_only?'final':'table');$('#record-search').value='';renderSource();renderStage();
  scrollOutputTo('#cell-results',true);
}
function renderCellResults(container){
  const lookup=state.cellLookup;if(!lookup)return;
  const panel=document.createElement('section');panel.id='cell-results';panel.className='cell-results';panel.setAttribute('aria-label','Cell extraction matches');
  const heading=document.createElement('strong');heading.textContent=`CELL → EXTRACTION · DATA ROW ${lookup.row}, COLUMN ${lookup.col+1}`;panel.append(heading);
  const note=document.createElement('p');note.textContent=lookup.targets.length?`${lookup.targets.length} records for this cell.${lookup.active?'':' Choose a record to inspect.'}`:'No extraction record available for this cell.';panel.append(note);
  const actions=document.createElement('div');actions.className='button-row';const counts={};
  lookup.targets.forEach(target=>{
    const button=document.createElement('button'),p=target.data.properties||target.data.attributes||{};
    counts[target.stage]=(counts[target.stage]||0)+1;
    const phase=target.stage==='table'?'Table extraction':'Final record';
    button.textContent=`${phase} ${counts[target.stage]} · ${text(target.data.predicate||target.data.relation_type||target.kind)} → ${text(target.data.object_name||target.data.target_name||target.data.label)}${p.value!==undefined?' · '+text(p.value)+' '+text(p.unit):''}`;
    button.classList.toggle('active',lookup.active===target&&state.stage===target.stage);
    button.onclick=()=>{lookup.active=target;state.stage=target.stage;$('#record-search').value='';renderStage();scrollOutputTo('#cell-results',true);};actions.append(button);
  });
  if(!lookup.targets.length){
    const gate=state.case.stages.find(stage=>stage.id==='gate')?.records.find(record=>Replay.tableKey(record.table_id)===Replay.tableKey(lookup.table.table_id));
    if(gate){const reason=document.createElement('p');reason.textContent=`Table Gate: ${gate.decision?.decision||'—'} · ${gate.decision?.table_role||'—'}. ${gate.decision?.ir_instruction||''}`;panel.append(reason);}
  }
  const clear=document.createElement('button');clear.textContent='Clear cell selection';clear.onclick=()=>{state.cellLookup=null;renderStage();};actions.append(clear);panel.append(actions);container.append(panel);
}
function graphRecord(record){
  const node=record.node_id||state.case.entity_map[record.subject];if(!state.nodes.has(node))return;
  setView('fusion');$('#source-filter').value=state.case.paper;$('#type-filter').value='';$('#relation-filter').value='';focusNode(node);
  const target=state.case.entity_map[record.object],predicates={CONTAINS:'contains',HAS_OUTPUT:'hasOutput',PROCESSED_BY:'processedBy'};
  const edge=state.shownEdges.find(e=>e.source===node&&e.target===target&&e.predicate===predicates[record.predicate]);
  if(edge){const matches=edge.records.filter(candidate=>Trace.graphMatches(state.case,edge,candidate,record));selectEdge(edge.id,matches.length===1?matches[0]:null);}
}
function clearOverviewEvidence(){
  overviewReturn=null;
  $('#overview-evidence').hidden=true;
  $('#replay-view').classList.remove('evidence-review');
  $('#stage-navigation').open=true;
}
function showOverviewEvidence(row,trigger,scrollY){
  overviewReturn={trigger,scrollY};
  const comparison=$('[data-mode="summary"]').getAttribute('aria-pressed')==='true';
  const panel=$('#overview-evidence');panel.hidden=false;
  const profile=state.overview.profiles.find(profile=>profile.id===row.profile_id);
  panel.innerHTML=`<button id="overview-back">Back to ${comparison?'comparison':'records'}</button><div><strong>${esc(profile?.label||row.label||row.name||'Study sample')}${row.element||row.material?' · '+esc(row.element||row.material):''}${row.value!=null?' · '+esc(row.qualifier||'')+esc(row.value)+(row.uncertainty!=null?' ± '+esc(row.uncertainty):'')+' '+esc(row.display_unit||row.unit):''}</strong>${contextSummary(row.condition||row.assay||'')}<small>${esc(row.paper)}</small></div>`;
  $('#overview-back').onclick=()=>{
    const previous=overviewReturn;setView('overview');clearOverviewEvidence();
    requestAnimationFrame(()=>{window.scrollTo(0,previous.scrollY);previous.trigger?.focus({preventScroll:true});});
  };
  $('#replay-view').classList.add('evidence-review');$('#stage-navigation').open=false;
  window.scrollTo(0,0);
  const back=$('#overview-back');back.focus({preventScroll:true});
}
async function openOverviewRecord(row,destination,trigger){
  const scrollY=window.scrollY;
  if(destination==='source'&&row.process_id){
    await openProcessEvidence(state.nodes.get(row.node_id));
    showOverviewEvidence(row,trigger,scrollY);return;
  }
  await openReplay(row.case_id,row.evidence?.[0]||'');
  if(state.case?.id!==row.case_id)throw Error('Reopen this result to continue.');
  if(Number.isInteger(row.final_index)){
    const record=state.case.stages.find(stage=>stage.id==='final').records[row.final_index];
    if(record?.id!==row.relation_id)throw Error('The overview and frozen archive versions differ.');
    if(destination==='graph'){graphRecord(record);return;}
    state.spotlight={case:state.case.id,target:{stage:'final',kind:'final',data:record,raw:record},label:'OVERVIEW SOURCE'};
    locateRecord(record);
  }else if(destination==='graph'){graphRecord({node_id:row.node_id});return;}
  state.stage='final';renderStage();showOverviewEvidence(row,trigger,scrollY);scrollOutputTo('#walkthrough-target');
}
function selectStage(id){
  state.stage=id;$('#record-search').value='';
  const tab={gate:'tables',table:'tables',process:'text',entity:'text',relation:'text'}[id];
  if(tab){state.sourceTab=tab;renderSource();}
  renderStage();
}
function renderProcessInventory(container){
  const inventory=state.case.process_inventory;if(!inventory)return;
  const rows=inventory.final.map(data=>({kind:'published_process',data,raw:data}));
  const settings=(inventory.settings||[]).map(data=>({kind:'process',data:{...data,phase:'Setting'},raw:data}));
  const query=$('#record-search').value.toLowerCase();
  let shown=0;
  for(const [label,items] of [['Processes',rows],['Experimental settings',settings]]){
    if(!items.length)continue;
    const section=document.createElement('section');section.className='process-inventory';
    section.innerHTML=`<h3>${label} · ${items.length}</h3>`;
    for(const item of items.filter(item=>!query||JSON.stringify(item.data).toLowerCase().includes(query))){
      section.append(Replay.render(item,{locate:locateRecord,graph:graphRecord}));shown++;
    }
    container.append(section);
  }
  $('#record-count').textContent=`${shown} / ${rows.length+settings.length} cards`;
  return true;
}
function renderStage(){
  if(!state.case)return;
  const stage=state.case.stages.find(s=>s.id===state.stage)||state.case.stages[0];
  $('#stages').querySelectorAll('button').forEach(b=>{
    const active=b.dataset.stage===stage.id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
  });
  renderTrace();
  $('#stage-heading').innerHTML=`<strong>${esc(stage.label)}</strong>`+stageFlow(stage.id);
  const container=$('#stage-records');container.replaceChildren();
  const downloads=document.createElement('details');downloads.innerHTML='<summary>Data files</summary>';
  const files=document.createElement('div');files.className='file-links';
  stage.files.forEach(file=>{const link=document.createElement('a');link.href=file.url;link.download=file.name;link.textContent=file.name+' ↗';link.title='SHA-256: '+file.sha256;files.append(link);});downloads.append(files);
  const times=document.createElement('div');times.className='file-time';times.textContent=stage.files.map(f=>`${f.name}: ${new Date(f.modified).toLocaleString('en-GB')}`).join(' · ');downloads.append(times);container.append(downloads);
  renderCellResults(container);
  const spotlight=state.spotlight?.case===state.case.id?state.spotlight.target:null;
  const cellTarget=state.cellLookup?.active;
  const located=cellTarget||spotlight||state.trace?.active;
  if(located?.stage===stage.id&&!$('#record-search').value){
    const match=Replay.render(located,{locate:locateRecord,graph:graphRecord});match.id=cellTarget?'cell-target':spotlight?'walkthrough-target':'trace-target';match.classList.add('trace-highlight');
    const tag=document.createElement('div');tag.className='trace-match-label';tag.textContent=cellTarget?'CELL EXTRACTION':spotlight?(state.spotlight.label||'WALKTHROUGH EVIDENCE'):'LOCATED ARCHIVED RECORD';match.prepend(tag);container.append(match);
  }
  if(stage.id==='process'&&renderProcessInventory(container))return;
  const entries=Replay.entries(stage),query=$('#record-search').value.toLowerCase();
  const items=entries.filter(item=>!query||(item.kind+' '+(item.title||'')+' '+(item.section||'')+' '+JSON.stringify(item.data)).toLowerCase().includes(query));$('#record-count').textContent=`${items.length} / ${entries.length} cards`;
  const summary=document.createElement('p');summary.className='stage-summary';
  const counts={};entries.forEach(item=>counts[item.kind]=(counts[item.kind]||0)+1);summary.textContent=Object.entries(counts).map(([kind,count])=>kind.replaceAll('_',' ')+' · '+count).join(' / ');container.append(summary);
  let count=0;function more(){container.querySelector(':scope > .load-more')?.remove();items.slice(count,count+25).forEach(item=>container.append(Replay.render(item,{locate:locateRecord,graph:graphRecord})));count+=25;if(count<items.length){const button=document.createElement('button');button.className='load-more';button.textContent=`Load more (${items.length-count} remaining)`;button.onclick=more;container.append(button);}}more();
  if(!items.length){const p=document.createElement('p');p.className='muted';p.textContent='No matching records in this stage.';container.append(p);}
}
function renderPapers(papers){
  const list=$('#paper-list');list.replaceChildren();
  for(const paper of [...papers].sort((a,b)=>a.title.localeCompare(b.title,'en',{sensitivity:'base'}))){
    const item=document.createElement('li'),link=document.createElement('a');
    link.textContent=paper.title;link.href=paper.url;link.target='_blank';link.rel='noopener noreferrer';
    item.append(link);list.append(item);
  }
}
function configureDataset(){
  const picker=$('#case-select'),previous=new Map([...picker.options].map(option=>[option.value,option.dataset]));
  picker.replaceChildren();
  for(const item of [...state.data.cases].sort((a,b)=>a.paper.localeCompare(b.paper,'en',{sensitivity:'base'}))){
    const option=document.createElement('option');option.value=item.id;option.textContent=item.paper;
    option.dataset.guide=item.guide_url||previous.get(item.id)?.guide||'';
    option.dataset.summary=item.guide_summary||previous.get(item.id)?.summary||'';
    picker.append(option);
  }
  picker.value=picker.options[0]?.value||'';
  const papers=state.data.sources.filter(source=>source.kind==='paper').length;
  const catalogs=state.data.sources.filter(source=>source.kind==='catalog').length;
  $('#source-filter').options[0].textContent=`All ${papers+catalogs} sources`;
  $('#snapshot-counts').textContent=`${papers} papers · ${catalogs} catalog records`;
  if($('#about-dataset'))$('#about-dataset').textContent=`${papers} papers + ${catalogs} product catalog records`;
  $('#snapshot-manifest').href=state.data.snapshot.manifest_url||'data/manifest.json';
}
async function start(){
  try{
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
    state.data=await fetchJSON(document.body.dataset.graph||'data/graph.json');configureDataset();state.nodes=new Map(state.data.nodes.map(n=>[n.id,n]));state.hierarchyData=createHierarchy(state.data,JSON.parse($('#display-vocabulary')?.textContent||'{}'));initializePositions();
    const entityCount=state.data.nodes.filter(n=>['Product','Component','Process','Material'].includes(n.type)).length;
    $('#legend').innerHTML=Object.entries(colors).map(([name,color])=>`<span><i class="dot" style="background:${color}"></i>${name}</span>`).join('')+'<span>┄┄ fusion link</span>';
    for(const kind of ['paper','catalog']){const sources=state.data.sources.filter(s=>s.kind===kind),group=document.createElement('optgroup');group.label=`${sources.length} ${kind==='paper'?'papers':'catalog records'}`;sources.forEach(source=>{const option=document.createElement('option');option.value=source.id;option.textContent=source.label;group.append(option);});$('#source-filter').append(group);}
    for(const kind of Object.keys(colors)){$('#type-filter').insertAdjacentHTML('beforeend',`<option>${kind}</option>`);}
    for(const predicate of [...new Set(state.data.edges.map(edge=>edge.predicate))].sort()){
      const option=document.createElement('option');option.value=predicate;option.textContent=labels[predicate]||predicate;$('#relation-filter').append(option);
    }
    for(const option of $('#case-select').options){const item=state.data.cases.find(item=>item.id===option.value);if(!item)throw Error('Unknown paper case: '+option.value);option.textContent=item.paper;}
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
    if(document.body.dataset.papers){
      fetchJSON(document.body.dataset.papers).then(renderPapers).catch(error=>{
        $('#paper-list').textContent='Unable to load the paper list. Please reload the page.';console.error(error);
      });
    }
    for(const id of ['source-filter','type-filter','relation-filter','fusion-toggle'])$('#'+id).onchange=()=>{
      if(id==='source-filter'){showAllEntities();return;}
      state.graphHistory=[];
      if(id==='type-filter'&&$('#type-filter').value.endsWith('Family'))state.hierarchy=false;
      updateGraph();
    };
    $('#top-level').onclick=resetHierarchy;$('#graph-back').onclick=goUp;
    $('#search').oninput=searchNodes;$('#show-all').onclick=showAllEntities;
    $('#clear-focus').onclick=()=>{state.graphHistory=[];state.focus=null;state.navPath=[];updateGraph();};$('#fit').onclick=fitGraph;$('#zoom-in').onclick=()=>scale(1.3);$('#zoom-out').onclick=()=>scale(1/1.3);
    $('#case-select').onchange=()=>{state.request++;walkthrough?.reset();renderCaseSelection();if(state.view==='replay')openReplay($('#case-select').value);};
    if($('#case-browse'))$('#case-browse').onclick=()=>{walkthrough?.reset();return openReplay($('#case-select').value);};
    $('#graph-node-inspect').onclick=()=>inspectGraphSelection('node');
    $('#graph-node-open').onclick=()=>inspectGraphSelection('node',true);
    $('#graph-edge-inspect').onclick=()=>inspectGraphSelection('edge');
    $('#text-tab').onclick=()=>{state.sourceTab='text';renderSource();};$('#tables-tab').onclick=()=>{state.sourceTab='tables';renderSource();};$('#record-search').oninput=renderStage;
    $('#case-on-graph').onclick=()=>{setView('fusion');state.graphHistory=[];state.hierarchy=false;state.focus=null;state.navPath=[];$('#source-filter').value=state.data.cases.find(item=>item.id===$('#case-select').value).paper;$('#type-filter').value='';$('#relation-filter').value='';updateGraph();};
    $('#inspector').innerHTML=`<div class="eyebrow">TRACEABLE KNOWLEDGE</div><div class="intro-icon">⌘</div><h3>Four entry points.<br>Explore one level at a time.</h3><p>Select Product, Component, Process or Material. Expand a group to browse types and families, then individual entities.</p><h4>What is underneath?</h4><p>${entityCount} entities and ${state.data.edges.length} displayed relations. ${state.data.observations} quantitative observations remain available in relation details.</p>`;
    if($('#walkthrough-start'))walkthrough=Walkthrough.mount({
      graph:state.data,loadGuide:path=>fetchJSON(path),
      loadArchive:async id=>{if(!state.cache.has(id))state.cache.set(id,await fetchJSON(state.data.sources.find(source=>source.replay_id===id)?.replay_url||`data/cases/${id}.json`));return state.cache.get(id);},
      replay:async(archive,target)=>{
        await openReplay(archive.id);
        if(state.case!==archive)throw Error('The active case changed. Reopen this step to continue.');
        state.spotlight={case:archive.id,target};state.stage=target.stage;locateRecord(target.data);renderStage();
        scrollOutputTo('#walkthrough-target');
      },
      graphView:({node,edge},step)=>{
        state.graphHistory=[];
        state.spotlight=null;state.trace=null;renderTrace();setView('fusion');
        for(const id of ['source-filter','type-filter','relation-filter','search'])$('#'+id).value='';
        searchNodes();$('#fusion-toggle').checked=step.fusion;focusNode(node);
        if(edge)selectEdge(edge.id);
      },
      clear:()=>{state.spotlight=null;if(state.case)renderStage();},
    });
    $('#case-select').disabled=false;if($('#case-browse'))$('#case-browse').disabled=false;renderCaseSelection();
    window.addEventListener('resize',resize);new ResizeObserver(resize).observe(canvas.parentElement);updateGraph();resize();notify('');
    if(document.body.dataset.overview){
      const overview=await fetchJSON(document.body.dataset.overview);state.overview=overview;
      const actions={open:openOverviewRecord,error:error=>notify(error.message)};
      const records=await fetchJSON('datasets/battery20/overview/analysis-records.json');
      actions.query=BatteryStatic.create({...overview,...records});
      BatteryOverview.mount($('#battery-overview'),overview,actions);
      setView('overview',false);
    }
  }catch(error){notify('Loading failed: '+error.message+'. Open this page through the local HTTP server.');console.error(error);}
}
start();

/* Current pipeline dependencies, not a reconstructed runtime of the archives. */
const STAGE_FLOW={
  gate:['Table and caption','Recorded role decision','Extract or skip'],
  table:['Archived semantic IR','Execution and verification','Emitted or rejected table facts'],
  process:['Source text and tables','Identify processes and conditions','Processes, descriptions, Settings'],
  entity:['Text chunk','Archived entity extraction','Entities with aliases'],
  relation:['Source sentence and available context','Archived candidate','Endpoints and measurement, or unresolved request'],
  revision:['Unresolved requests','Recorded operation and status','Committed output or unresolved state'],
  scope:['Merged entities, relations and paper evidence','Post-merge sample / model / method annotation','Scope records for final export and fusion'],
  final:['Postprocessed relations','Final serialization','Final relations used for fusion'],
};
function stageFlow(id){
  const f=STAGE_FLOW[id];if(!f)return '';
  return `<div class="stage-flow" aria-label="What this stage records"><span><small>Input</small>${esc(f[0])}</span><i>→</i><span><small>Recorded action</small>${esc(f[1])}</span><i>→</i><span><small>Output</small>${esc(f[2])}</span></div>`;
}
function processMap(item){
  if(item.source_only)return '<button data-stage="final" class="pm-node pm-final active"><b>Final relations</b><small>Source-only archive · no intermediate stages</small></button>';
  const by=Object.fromEntries(item.stages.map(s=>[s.id,s]));
  const node=id=>{const s=by[id];if(!s)return '<span class="pm-missing">—</span>';
    const count=id==='process'&&item.process_inventory?`${item.process_inventory.final_count} Processes`:`${s.records.length} records`;
    return `<button data-stage="${s.id}" class="pm-node pm-${s.id} ${s.id===state.stage?'active':''}"><b>${esc(s.label)}</b><small>${count}</small></button>`;};
  return `<div class="pm">
    <div class="pm-lane"><span class="pm-lane-label">1 · Parallel planning</span>${node('gate')}${node('process')}${node('entity')}<span class="pm-hint">Gate / IR planning, Process and Entity run in parallel.</span></div>
    <div class="pm-lane"><span class="pm-lane-label">2 · Grounded extraction</span>${node('table')}${node('relation')}<span class="pm-hint">Table execution and Relation extraction use the available entity / Process context.</span></div>
    <div class="pm-merge"><span class="pm-lane-label">3 · Document completion</span><div class="pm-completion-chain"><span class="pm-node pm-static"><b>Document merge</b><small>Stable entity IDs</small></span><i class="pm-arrow pm-optional" title="Revision may be skipped"></i>${node('revision')}<i class="pm-arrow"></i>${node('scope')}<i class="pm-arrow"></i>${node('final')}</div></div>
  </div>
  <div class="pm-legend"><span><i class="pm-l-concept"></i>Pipeline dependencies</span><span><i class="pm-l-optional"></i>Optional revision</span><span><i class="pm-l-confirmed"></i>Linked source evidence</span></div>`;
}
