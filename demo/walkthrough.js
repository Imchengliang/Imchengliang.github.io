/* Authored presentation steps select frozen records; they never create KG facts. */
'use strict';
const Walkthrough = (() => {
  const at = (object,path) => path.split('.').reduce((value,key)=>value?.[key],object);
  const tableKey = value => String(value??'').replace(/[^a-z0-9]/gi,'').toLowerCase();
  function unique(items,label) {
    if(items.length!==1)throw Error(`No unique ${label}: ${items.length} matches. No substitute has been selected.`);
    return items[0];
  }
  function resolve(step,archive,graph) {
    if(step.stage) {
      const stage=archive.stages.find(stage=>stage.id===step.stage);
      if(!stage)throw Error('Archived stage is unavailable: '+step.stage);
      const entries=step.stage==='table'?stage.records.flatMap(group=>[{stage:'table',kind:'table',data:group,raw:group},...(group.extraction?.relations||[]).map(data=>({stage:'table',kind:'table_fact',data,raw:data}))]):
        Replay.entries(stage).map(entry=>({...entry,stage:step.stage}));
      const matches=entries.filter(entry=>Object.entries(step.where||{}).every(([path,value])=>
        path.endsWith('table_id')?tableKey(at(entry.data,path))===tableKey(value):at(entry.data,path)===value));
      return {target:unique(matches,'archived record')};
    }
    const node=archive.entity_map[step.entity];
    if(!node||!graph.nodes.some(item=>item.id===node))throw Error('Archived graph entity is unavailable.');
    const edge=step.alignment?unique(graph.edges.filter(edge=>edge.source===node&&edge.predicate===step.alignment.predicate&&
      graph.nodes.some(target=>target.id===edge.target&&target.source===step.alignment.catalog)),'catalog alignment'):null;
    return {node,edge};
  }
  function mount(actions) {
    const start=document.querySelector('#walkthrough-start'),panel=document.querySelector('#walkthrough-panel'),result=document.querySelector('#walkthrough-result'),picker=document.querySelector('#case-select');
    const back=document.querySelector('#walkthrough-return');
    let guide=null,archive=null,loadedPath=null,index=0,active=false,busy=false,sequence=0,error='',view='fusion';
    panel.innerHTML='<div class="walkthrough-heading"><span id="walkthrough-progress-label" class="eyebrow"></span><button id="walkthrough-exit">Exit walkthrough</button></div><h2 id="walkthrough-title"></h2><p id="walkthrough-question"></p><div class="walkthrough-copy"><p><b>What to inspect</b><span id="walkthrough-look"></span></p><p><b>Limitation</b><span id="walkthrough-boundary"></span></p></div><p id="walkthrough-error" role="status" hidden></p><progress id="walkthrough-progress" aria-label="Walkthrough progress"></progress><div class="walkthrough-navigation"><button id="walkthrough-previous">← Previous</button><span>Explore freely. Reopen step returns to its archived target.</span><button id="walkthrough-reopen">Reopen step</button><button id="walkthrough-next">Next →</button></div>';
    const $=selector=>panel.querySelector(selector);
    function render() {
      panel.hidden=!active||view==='papers';start.disabled=busy||!picker.selectedOptions[0]?.dataset.guide;start.textContent=guide?'Restart walkthrough':'Start walkthrough';
      back.hidden=!active||view!=='fusion'||!guide?.steps[index]?.stage;
      back.disabled=busy;back.textContent=`← Return to step ${index+1}`;
      document.querySelector('#walkthrough-summary').textContent=picker.selectedOptions[0]?.dataset.summary||'';
      if(!active)return;
      const step=guide?.steps[index];
      $('#walkthrough-progress-label').textContent=step?`GUIDED WALKTHROUGH · STEP ${index+1} OF ${guide.steps.length}`:'GUIDED WALKTHROUGH';
      $('#walkthrough-title').textContent=step?.title||'Loading frozen evidence…';
      $('#walkthrough-question').textContent=step?.question||'';
      $('#walkthrough-look').textContent=step?.look||'';$('#walkthrough-boundary').textContent=step?.boundary||'';
      $('#walkthrough-error').textContent=error;$('#walkthrough-error').hidden=!error;
      $('#walkthrough-progress').max=guide?.steps.length||1;$('#walkthrough-progress').value=step?index+1:0;
      $('#walkthrough-previous').disabled=busy||!index;$('#walkthrough-next').disabled=busy||!step;
      $('#walkthrough-reopen').disabled=busy||!step;
      $('#walkthrough-next').textContent=step&&index===guide.steps.length-1?'Finish walkthrough':'Next →';
      panel.setAttribute('aria-busy',String(busy));
    }
    async function move(next) {
      if(busy||!picker.selectedOptions[0]?.dataset.guide)return;
      const token=++sequence;index=next;active=true;busy=true;error='';result.hidden=true;render();
      try {
        const caseId=picker.value,path=picker.selectedOptions[0]?.dataset.guide;
        if(!path)throw Error('No walkthrough is configured for this paper.');
        if(!guide||loadedPath!==path){
          const loaded=await actions.loadGuide(path);
          if(token!==sequence)return;
          if(loaded.case!==caseId)throw Error('The walkthrough does not match the selected paper.');
          guide=loaded;loadedPath=path;archive=null;
        }
        if(!archive){
          const loaded=await actions.loadArchive(guide.case);
          if(token!==sequence)return;
          archive=loaded;
        }
        if(token!==sequence)return;
        const step=guide.steps[index],resolved=resolve(step,archive,actions.graph);
        if(resolved.target)await actions.replay(archive,resolved.target);
        else actions.graphView(resolved,step);
      }catch(failure){if(token===sequence)error=failure.message;}
      finally{if(token===sequence){busy=false;render();panel.scrollIntoView({block:'start'});}}
    }
    function stop(completed=false) {
      sequence++;active=false;busy=false;actions.clear();render();
      result.hidden=!completed;result.textContent=completed?'Walkthrough complete. Continue exploring the frozen evidence.':'';
    }
    start.onclick=()=>move(0);$('#walkthrough-exit').onclick=()=>stop();
    function reset(){stop();guide=null;archive=null;loadedPath=null;index=0;error='';render();}
    $('#walkthrough-previous').onclick=()=>move(index-1);$('#walkthrough-reopen').onclick=()=>move(index);
    $('#walkthrough-next').onclick=()=>index===guide.steps.length-1?stop(true):move(index+1);
    back.onclick=()=>move(index);
    start.disabled=false;render();
    return {reset,viewChanged(next){view=next;render();}};
  }
  return {resolve,mount};
})();
