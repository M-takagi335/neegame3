import {backgrounds} from './model.js';
import {edges,depths} from './graph.js';
import {createEngine} from './engine.js';
export function references(p) {
  const result=[];
  const add=(kind,id,location,field)=>{if(id)result.push({kind,id,...location,field});};
  const asset=(id,loc,field)=>add('画像素材',id,loc,field);
  const character=(o,loc)=>{
    add('キャラクター',o.characterId,loc,'キャラクター');
    if(o.expressionId && !p.characters.find(c=>c.id===o.characterId)?.sprites.some(s=>s.id===o.expressionId))
      result.push({kind:'表情',id:o.expressionId,...loc,field:'表情'});
    asset(o.assetId,loc,'立ち絵');
  };
  const target=(o,loc)=>{if(o?.type==='scene')add('シーン',o.sceneId,loc,'移動先');};
  asset(p.thumbnailAssetId,{name:'作品設定'},'サムネイル');
  for(const c of p.characters) {
    const loc={name:c.name};
    asset(c.iconAssetId,loc,'アイコン');
    asset(c.defaultSpriteId,loc,'初期立ち絵');
    for(const s of c.sprites)asset(s.assetId,loc,'表情 '+s.name);
  }
  for(const s of p.scenes) {
    const loc={name:s.name,sceneId:s.id};
    asset(s.backgroundAssetId,loc,'初期背景');
    add('シーン',s.nextSceneId,loc,'シーン終了後');
    for(const sprite of s.initialSprites??[])character(sprite,loc);
    for(const [index,b] of s.blocks.entries()) {
      const d=b.data, here={...loc,name:s.name+' / '+(index+1)+'番目',blockId:b.id};
      asset(d.backgroundAssetId,here,'背景');
      character(d,here);
      for(const sprite of d.sprites??[])character(sprite,here);
      for(const t of [d.target,d.fallback,...(d.routes??[]).map(r=>r.target),...(d.options??[]).map(o=>o.target)]) target(t,here);
      const params=[...(d.effects??[]),...(d.options??[]).flatMap(o=>[...o.effects,...o.visibilityCondition.conditions,...o.enabledCondition.conditions]),
        ...(d.routes??[]).flatMap(r=>r.condition.conditions)];
      for(const o of params)if(o.parameterId)add('パラメータ',o.parameterId,here,'パラメータ');
    }
  }
  return result;
}
export function validate(p) {
  const issues=[];
  const add=(level,message,loc={})=>issues.push({level,message,...loc});
  const known={'画像素材':new Set([...Object.keys(backgrounds),...p.assets.map(a=>a.id)]),'シーン':new Set(p.scenes.map(s=>s.id)),
    'キャラクター':new Set(p.characters.map(c=>c.id)),'パラメータ':new Set(p.parameters.map(o=>o.id)),'表情':new Set()};
  if(!known['シーン'].has(p.startSceneId))add('error','開始シーンを設定してください。');
  for(const ref of references(p))if(!known[ref.kind].has(ref.id))add('error',ref.name+'：存在しない'+ref.kind+'の参照（'+ref.field+'）',ref);
  const levels=depths(p,edges(p));
  const reported=new Set();
  function runtimeIssue(state,loc,suffix='') {
    if(state.status!=='error'||!/選べる|1000/.test(state.message))return;
    const key=(loc.blockId??loc.sceneId)+state.message;
    if(reported.has(key))return;
    reported.add(key);
    add('warning',state.message+suffix,loc);
  }
  function inspect(s,i,values,loc) {
    const state=createEngine(p,{sceneId:s.id,index:i,values}).state();
    runtimeIssue(state,loc,'（初期値からの試行）');
  }
  const engine=createEngine(p);
  const queue=[engine.snapshot()];
  const visited=new Set();
  for(let index=0;index<queue.length&&index<300;index++){
    const state=queue[index];
    const key=JSON.stringify([state.currentSceneId,state.currentBlockIndex,state.parameterValues]);
    if(visited.has(key))continue;
    visited.add(key);
    runtimeIssue(state,{sceneId:state.currentSceneId,blockId:state.event?.blockId},'（開始シーンからの試行）');
    const choices=state.status==='choice'?state.event.choices.filter(choice=>choice.enabled):[];
    if(state.status==='input') {
      engine.restore({...state,dialogueHistory:[],trace:[]});engine.advance();queue.push(engine.snapshot());
    } else for(const choice of choices) {
      if(queue.length>=300)break;
      engine.restore({...state,dialogueHistory:[],trace:[]});engine.choose(choice.id);queue.push(engine.snapshot());
    }
  }
  for(const s of p.scenes) {
    const loc={sceneId:s.id};
    if(!levels.has(s.id))add('warning',s.name+'：開始シーンから到達できません。',loc);
    if(!s.nextSceneId&&(!s.blocks.length||!['ending','jump','branch'].includes(s.blocks.at(-1).type))&&
      !(s.blocks.at(-1)?.type==='choice'&&s.blocks.at(-1).data.options.length&&s.blocks.at(-1).data.options.every(o=>o.target.type==='scene')))
      add('warning',s.name+'：終了後の移動先が未設定です。',loc);
    inspect(s,0,undefined,loc);
    for(const [i,b] of s.blocks.entries()) {
      const d=b.data, here={...loc,blockId:b.id};
      if(b.type==='choice'){
        if(!d.options.length)add('error','選択肢を追加してください。',here);
        if(d.options.some(o=>!o.text.trim()))add('error','文章が空欄の選択肢があります。',here);
      }
      if([d.target,d.fallback,...(d.routes??[]).map(r=>r.target),...(d.options??[]).map(o=>o.target)].some(t=>t?.type==='scene'&&!t.sceneId))
        add('error','分岐先のシーンを設定してください。',here);
      if((d.effects??[]).concat((d.routes??[]).flatMap(r=>r.condition.conditions),(d.options??[]).flatMap(o=>o.effects.concat(o.visibilityCondition.conditions,o.enabledCondition.conditions))).some(o=>!o.parameterId))
        add('error','パラメータを選択してください。',here);
      if(['choice','branch','jump'].includes(b.type)&&i>0)inspect(s,i,undefined,here);
    }
  }
  return issues;
}
