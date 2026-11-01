/* A display projection only. Every member and relation refers to the frozen graph. */
'use strict';
function createHierarchy(data) {
  const roots = {Product:'Product', Component:'Component', Process:'Process', Material:'Material'};
  const groups = new Map(), parent = new Map(), nodes = new Map(data.nodes.map(node=>[node.id,node]));
  const families = new Map();
  const classifications = new Map(), productTypes = new Map();
  const normalize = value=>value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
  const componentKey = value=>normalize(value).replace(/[-_‐‑‒–—]+/g,' ').replace(/\s+/g,' ');
  const sourceKinds=new Map((data.sources || []).map(source=>[source.id,source.kind]));
  const componentTypes=new Map(), ambiguousComponents=new Set();
  function registerComponentType(label,node,basis,term=label) {
    const existing=componentTypes.get(componentKey(label));
    if(existing?.size===1)label=existing.values().next().value.label;
    const key=componentKey(term),typeKey=componentKey(label);
    if (!key || !typeKey) return;
    if (!componentTypes.has(key)) componentTypes.set(key,new Map());
    componentTypes.get(key).set(typeKey,{label:label.trim(),declaredBy:node.id,basis});
  }
  // Component type labels are browsing vocabulary, never inherited population scopes.
  // Published types establish preferred names before Scope/catalog fallbacks.
  const components=data.nodes.filter(node=>node.type==='Component');
  components.sort((a,b)=>Number(!!b.attrs.canonicalType?.length)-Number(!!a.attrs.canonicalType?.length));
  for (const node of components) {
    const labels=node.attrs.canonicalType?.length ? [...node.attrs.canonicalType] :
      [...node.scopes.flatMap(scope=>scope.sampleType || []),...(node.attrs.category || [])];
    const catalog=sourceKinds.get(node.source)==='catalog';
    if (catalog) labels.push(node.label);
    for (const label of labels) {
      registerComponentType(label,node,catalog&&label===node.label?'Existing catalog component label':'Existing Component type label in frozen metadata');
      // Aliases of an instance are not aliases of its broader category.
      if (componentKey(node.label)===componentKey(label)) {
        for (const alias of [...(node.attrs.alias || []),...(node.attrs.aliases || [])]) {
          registerComponentType(label,node,'Explicitly registered Component type alias',alias);
        }
      }
    }
  }
  function inferComponentType(node) {
    if (node.type !== 'Component') return;
    const matches=new Map();
    for (const label of [node.label,...(node.attrs.label || []),...(node.attrs.alias || []),...(node.attrs.aliases || [])]) {
      for (const [key,declaration] of componentTypes.get(componentKey(label)) || []) {
        matches.set(key,{...declaration,matchedLabel:label});
      }
    }
    if(matches.size>1)ambiguousComponents.add(node.id);
    if (matches.size!==1) return;
    const classification=matches.values().next().value;
    classifications.set(node.id,classification);
    return classification.label;
  }
  // Fallback vocabulary comes only from Product scopes in the same source.
  for (const node of data.nodes) {
    if (node.type !== 'Product' || !node.source) continue;
    if (!productTypes.has(node.source)) productTypes.set(node.source,new Map());
    for (const scope of node.scopes) for (const label of scope.sampleType || []) {
      const key=normalize(label);
      if (key && !productTypes.get(node.source).has(key)) {
        productTypes.get(node.source).set(key,{label:label.trim(),declaredBy:node.id});
      }
    }
  }
  function inferProductType(node) {
    if (node.type !== 'Product') return;
    const matches=new Map();
    for (const [key,declaration] of productTypes.get(node.source) || []) {
      const matchedLabel=[node.label,...(node.attrs.label || [])].find(label=>{
        const name=normalize(label);
        return name.startsWith(key) && (name.length===key.length || /^[^\p{L}\p{N}]/u.test(name.slice(key.length)));
      });
      if (matchedLabel) matches.set(key,{...declaration,matchedLabel});
    }
    if (matches.size!==1) return; // Ambiguity stays Unclassified.
    const classification={...matches.values().next().value,basis:'Unique complete label prefix of a Product type declared in the same source’s scope'};
    classifications.set(node.id,classification);
    return classification.label;
  }
  for (const edge of data.edges) {
    if (['memberOfProductFamily','memberOfMethodFamily'].includes(edge.predicate)) {
      families.set(edge.source, nodes.get(edge.target).label);
    }
  }
  for (const [type,label] of Object.entries(roots)) {
    groups.set('group:'+type, {id:'group:'+type,label,type,source:'',group:true,level:0,members:[],children:[]});
  }
  for (const node of data.nodes) {
    const root = groups.get('group:'+node.type);
    if (!root) continue;
    root.members.push(node.id);
    if (node.type === 'Material') { parent.set(node.id,root.id); continue; }
    const field = node.type === 'Process' ? 'methodFamily' : 'sampleType';
    const declared = node.scopes.find(scope=>scope[field]?.length)?.[field][0];
    let label = node.attrs.canonicalType?.[0] || families.get(node.id) || declared || node.attrs.category?.[0];
    if(node.type==='Component' && label){
      const matches=componentTypes.get(componentKey(label));
      if(matches?.size===1)label=matches.values().next().value.label;
    }
    label ||= inferProductType(node) || inferComponentType(node) || 'Unclassified';
    const id = root.id+':'+normalize(label);
    if (!groups.has(id)) {
      groups.set(id,{id,label,type:node.type,source:'',group:true,level:1,parent:root.id,members:[],children:[],
                     basis:label==='Unclassified'?'No unique display type can be established from the frozen metadata.':'Display grouping uses published canonical types, existing family links, scope types, categories or exact Component type/catalog labels and registered aliases. It does not merge entities or inherit scopes.'});
      root.children.push(id);
    }
    groups.get(id).members.push(node.id);
    parent.set(node.id,id);
  }
  // Repeated complete names are browsing groups, not type or identity assertions.
  const unclassified=groups.get('group:Component:unclassified'), repeatedNames=new Map();
  for(const id of unclassified?.members || []){
    const key=componentKey(nodes.get(id).label);
    if(!key || ambiguousComponents.has(id))continue;
    if(!repeatedNames.has(key))repeatedNames.set(key,[]);
    repeatedNames.get(key).push(id);
  }
  for(const [key,members] of repeatedNames){
    if(members.length<2)continue;
    const id='group:Component:name:'+key;
    groups.set(id,{id,label:nodes.get(members[0]).label.trim(),type:'Component',source:'',group:true,nameGroup:true,
      level:1,parent:'group:Component',members,children:[],
      basis:'Grouped by the same normalized full Component name for browsing only. No shared ontology type, sample identity, Scope or measurement is inferred.'});
    groups.get('group:Component').children.push(id);
    for(const member of members)parent.set(member,id);
  }
  if(unclassified){
    unclassified.members=unclassified.members.filter(id=>parent.get(id)===unclassified.id);
    if(!unclassified.members.length){
      groups.delete(unclassified.id);
      const root=groups.get('group:Component');root.children=root.children.filter(id=>id!==unclassified.id);
    }
  }
  return {
    groups, classifications,
    path(id) {
      const path=[id];
      let ancestor=groups.get(id)?.parent || parent.get(id);
      while(ancestor) {path.unshift(ancestor);ancestor=groups.get(ancestor).parent;}
      return path;
    },
    project(visibleNodes,visibleEdges,expanded) {
      const visible = new Set(visibleNodes.map(node=>node.id)), displayed = new Map(), representative = new Map();
      for (const node of visibleNodes) {
        let id = parent.get(node.id);
        if (!id) continue;
        const chain = [];
        while(id) { chain.unshift(id); id=groups.get(id).parent; }
        const collapsed = chain.find(group=>!expanded.has(group));
        const item = collapsed ? groups.get(collapsed) : node;
        if (!displayed.has(item.id)) displayed.set(item.id,item.group?{...item,members:item.members.filter(member=>visible.has(member))}:item);
        representative.set(node.id,item.id);
      }
      const edges = new Map();
      for (const edge of visibleEdges) {
        const source=representative.get(edge.source), target=representative.get(edge.target);
        if (!source || !target || source===target) continue;
        if (source===edge.source && target===edge.target) {edges.set(edge.id,edge);continue;}
        const pair=[source,target].sort(),id='summary:'+JSON.stringify(pair);
        if (!edges.has(id)) edges.set(id,{id,source:pair[0],target:pair[1],predicate:'summary',fusion:false,members:[],predicates:{},directions:{},records:[]});
        const summary=edges.get(id);
        summary.members.push(edge.id);
        summary.predicates[edge.predicate]=(summary.predicates[edge.predicate]||0)+1;
        const direction=JSON.stringify([source,edge.predicate,target]);
        summary.directions[direction]=(summary.directions[direction]||0)+1;
        summary.fusion ||= edge.fusion;
      }
      return {nodes:[...displayed.values()],edges:[...edges.values()]};
    },
    /* Deliberate layout: collapsed roots sit at fixed corners; an opened root lays its
       types/families out in a labelled grid (largest first), with any opened family's
       entities placed directly after it, so expansion never reshuffles other groups. */
    positions(displayed) {
      const corners = {Product:[-1,-1],Component:[1,-1],Process:[-1,1],Material:[1,1]};
      const CELL_X=190, CELL_Y=110, positions = new Map(), grids = {};
      for (const type of Object.keys(roots)) {
        const items=displayed.filter(node=>node.type===type && !(node.group && node.level===0));
        const families=items.filter(node=>node.group).sort((a,b)=>b.members.length-a.members.length||a.label.localeCompare(b.label));
        const loose=items.filter(node=>!node.group);
        const ordered=[];
        for (const family of families) {
          ordered.push(family);
          loose.filter(node=>parent.get(node.id)===family.id).sort((a,b)=>a.label.localeCompare(b.label)).forEach(node=>ordered.push(node));
        }
        loose.filter(node=>!ordered.includes(node)).sort((a,b)=>a.label.localeCompare(b.label)).forEach(node=>ordered.push(node));
        const cols=Math.max(1,Math.min(6,Math.ceil(Math.sqrt(ordered.length))));
        const rows=Math.ceil(ordered.length/cols);
        grids[type]={ordered,cols,rows,w:(cols-1)*CELL_X,h:(rows-1)*CELL_Y};
      }
      const open=Object.keys(roots).filter(type=>grids[type].ordered.length);
      if (!open.length) {
        for (const [type,[sx,sy]] of Object.entries(corners)) positions.set('group:'+type,{x:sx*380,y:sy*240});
        return positions;
      }
      // Opened types fill the main area as stacked grids; still-collapsed roots wait in a column on the right.
      let y=0, right=0;
      for (const type of open) {
        const g=grids[type];
        g.ordered.forEach((node,index)=>positions.set(node.id,{x:(index%g.cols)*CELL_X,y:y+Math.floor(index/g.cols)*CELL_Y}));
        right=Math.max(right,g.w); y+=g.h+CELL_Y*1.6;
      }
      const closed=Object.keys(roots).filter(type=>displayed.some(node=>node.id==='group:'+type));
      const span=Math.max(y-CELL_Y*1.6,0), step=closed.length>1?Math.max(240,span/(closed.length-1)):0;
      closed.forEach((type,index)=>positions.set('group:'+type,{x:right+300,y:closed.length>1?index*step:span/2}));
      return positions;
    }
  };
}
