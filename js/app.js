import {el,button,label,input,select,listOf} from './dom.js';
import {project,makeScene,copy,id,gradients,names} from './model.js';
import {sample,sampleImages} from './sample.js';
import {get,put,all,installSample,deleteProject} from './storage.js';
import {imageKey,mime,kinds,exportJSON,exportHTML,importJSON,cloneProject} from './export.js';
import {editor,previewText} from './editor.js';
import {forms,effectText} from './forms.js';
import {startPlayer} from './player.js';
const root=document.getElementById('app');
const dialog=document.getElementById('dialog');
const toast=document.getElementById('toast');
let projects=[],p=null,page='home',player=null,history=[],future=[],saved='保存済み',timer,toastTimer;
let pending=Promise.resolve(),revision=0;
let state=fresh();
const images=new Map();
const tasks=new Set();
const date=new Intl.DateTimeFormat('ja-JP',{dateStyle:'medium',timeStyle:'short'});
let theme='dark';
try{theme=localStorage.getItem('story-editor:theme')??'dark';}catch{}
document.documentElement.dataset.theme=theme;
function fresh(sceneId=''){
  return {tab:'story',mobile:'timeline',sceneId,blockId:'',speaker:null,draft:'',collapsed:new Set()};
}
function notify(message){
  clearTimeout(toastTimer);
  toast.textContent=message;
  toast.classList.add('visible');
  toastTimer=setTimeout(()=>toast.classList.remove('visible'),4300);
}
function showSave(){
  const badge=root.querySelector('[data-save]');
  if(badge){badge.textContent=saved;badge.dataset.status=saved==='保存済み'?'ok':saved==='保存失敗'?'error':'pending';}
  const undo=root.querySelector('[data-undo]'),redo=root.querySelector('[data-redo]');
  if(undo)undo.disabled=!history.length;
  if(redo)redo.disabled=!future.length;
}
function enqueue(snapshot,write=()=>put('projects',snapshot.id,snapshot)){
  const stamp=++revision;
  pending=pending.catch(()=>{}).then(write);
  pending.then(()=>{
    if(stamp===revision&&p?.id===snapshot.id&&!timer){saved='保存済み';showSave();}
  },()=>{
    if(p?.id===snapshot.id){saved='保存失敗';showSave();}
    notify('保存できませんでした。作品を開いたまま再試行するか、制作データを出力してください。');
  });
  return pending;
}
function flush() {
  if(!p)return pending;
  if(timer||saved==='保存失敗'){
    clearTimeout(timer);timer=null;
    return enqueue(copy(p));
  }
  return pending;
}
function schedule(){
  p.updatedAt=new Date().toISOString();
  saved='保存中';
  showSave();
  clearTimeout(timer);
  timer=setTimeout(()=>{timer=null;enqueue(copy(p));},350);
}
function edit(action,full=true,record=true){
  if(record){
    history.push(copy(p));
    if(history.length>80)history.shift();
  }
  future=[];
  action();
  schedule();
  if(full)render();
}
function undo(){
  if(!history.length)return;
  future.push(copy(p));p=history.pop();schedule();render();
}
function refreshLabels(){
  const byId=(items,value)=>items.find(item=>item.id===value);
  const fill=(selector,value)=>{const node=root.querySelector(selector);if(node)node.textContent=value;};
  fill('.editor-title',p.title);
  const scenes=new Map(p.scenes.map(s=>[s.id,s]));
  const current=scenes.get(state.sceneId)??p.scenes[0];
  for(const node of root.querySelectorAll('[data-scene-name]'))node.textContent=scenes.get(node.dataset.sceneName).name;
  for(const node of root.querySelectorAll('[data-managed]'))node.textContent=byId([...p.characters,...p.parameters],node.dataset.managed)?.name??'';
  if(!current)return;
  fill('.timeline h1',current.name);
  fill('.mini-preview strong',current.name);
  const selected=byId(current.blocks,state.blockId);
  if(selected)fill('.mini-preview p',previewText(p,selected));
  for(const card of root.querySelectorAll('[data-block-id]')){
    const block=byId(current.blocks,card.dataset.blockId);
    const sum=card.querySelector('.block-summary');
    if(sum)sum.textContent=previewText(p,block);
    for(const choice of card.querySelectorAll('[data-choice-id]')){
      const o=byId(block.data.options,choice.dataset.choiceId);
      choice.textContent='◇ '+(o.text||'空欄')+(o.effects.length?' · '+o.effects.map(effect=>effectText(p,effect)).join(' ／ '):'');
    }
  }
}
function redo(){
  if(!future.length)return;
  history.push(copy(p));p=future.pop();schedule();render();
}
function assetsFor(project) {
  return Promise.all(project.assets.map(async a=>{
    const key=imageKey(project.id,a.id);
    if(images.has(key))return;
    const blob=await get('images',key);
    if(blob&&!images.has(key))images.set(key,URL.createObjectURL(blob));
  }));
}
function assetUrl(assetId,project=p){return project&&images.get(imageKey(project.id,assetId));}
function paint(node,key,project=p){
  node.style.background=Object.hasOwn(gradients,key)?gradients[key]:'';
  const url=assetUrl(key,project);
  if(url)node.style.backgroundImage='url('+JSON.stringify(url)+')';
}
function closeDialog(){dialog.close();}
function ask(title,...content){
  dialog.replaceChildren(el('div',{class:'dialog-body stack'},el('div',{class:'row split'},el('h2',{},title),
    button('閉じる',closeDialog,'quiet')),content));
  if(!dialog.open)dialog.showModal();
}
function confirm(title,text,handler){
  ask(title,el('p',{class:'prewrap'},text),el('div',{class:'row wrap'},button('キャンセル',closeDialog),
    button('削除する',()=>{closeDialog();handler();},'danger filled')));
}
function pickFile(accept){
  return new Promise(resolve=>{
    const field=el('input',{type:'file',accept});
    field.onchange=()=>resolve(field.files[0]);
    field.oncancel=()=>resolve(null);
    field.click();
  });
}
async function guarded(action){
  try{return await action();}
  catch(error){notify(error?.message||'操作に失敗しました。');}
}
function runTask(key,action){
  if(tasks.has(key))return;
  tasks.add(key);
  return guarded(action).finally(()=>tasks.delete(key));
}
async function upload(kind,apply){
  const owner=p?.id;
  try{
    const file=await pickFile(mime.join(','));
    if(!file||p?.id!==owner)return;
    if(!mime.includes(file.type))throw Error('PNG、JPEG、WebP、GIFの画像を選択してください。');
    const asset={id:id(),name:file.name,kind,mime:file.type};
    await flush();
    if(p?.id!==owner)return;
    // Store the image first so every persisted project snapshot can resolve it.
    const key=imageKey(owner,asset.id);
    await put('images',key,file);
    if(p?.id!==owner)return;
    images.set(key,URL.createObjectURL(file));
    edit(()=>{p.assets.push(asset);apply?.(asset.id);});
  } catch(error){notify(error?.message||'画像を保存できませんでした。');}
}
function setSpeaker(v){state.speaker=v;}
function goScene(sceneId,blockId=''){
  state.tab='story';state.sceneId=sceneId;state.blockId=blockId;state.mobile='timeline';
  state.scrollToBlock=!!blockId;
  render();
}
function addScene(apply) {
  const field=el('input',{value:'新しいシーン',required:true});
  const form=el('form',{class:'stack'},label('シーン名',field),el('button',{type:'submit',class:'primary'},'シーンを作成'));
  form.onsubmit=e=>{
    e.preventDefault();closeDialog();
    edit(()=>{
      const scene=makeScene(field.value.trim()||'新しいシーン');
      p.scenes.push(scene);if(!p.startSceneId)p.startSceneId=scene.id;apply?.(scene);
    });
  };
  ask('シーンを追加',form);field.select();
}
function convertParameter(parameter){
  const boolean=parameter.type==='boolean';
  parameter.initialValue=boolean?Boolean(parameter.initialValue):Number(parameter.initialValue);
  if(boolean){parameter.minValue=null;parameter.maxValue=null;}
  for(const scene of p.scenes)for(const {data} of scene.blocks){
    const effects=[...(data.effects??[]),...(data.options??[]).flatMap(o=>o.effects)];
    const conditions=[...(data.routes??[]).flatMap(r=>r.condition.conditions),...(data.options??[]).flatMap(o=>o.visibilityCondition.conditions.concat(o.enabledCondition.conditions))];
    for(const e of effects)if(e.parameterId===parameter.id){e.value=boolean?Boolean(e.value):Number(e.value);if(boolean)e.operation='set';}
    for(const c of conditions)if(c.parameterId===parameter.id){c.value=boolean?Boolean(c.value):Number(c.value);if(boolean&&!['==','!='].includes(c.operator))c.operator='==';}
  }
}
const exportProject=(project,type)=>runTask('export:'+project.id+':'+type,async()=>{
  if(project.id===p?.id&&timer)await flush();
  await (type==='html'?exportHTML:exportJSON)(project);
  notify('ダウンロードを開始しました。');
});
function context(){
  return {p,state,edit,goScene,ask,rerender:render,refreshLabels,notify,closeDialog,confirm,setSpeaker,addScene,upload,assetUrl,paint,convertParameter,
    saveState:()=>saved,home:showHome,undo,redo,canUndo:()=>history.length,canRedo:()=>future.length,
    test,quickPlay:scene=>play(p,{sceneId:scene.id,debug:true},'editor'),export:type=>exportProject(p,type)};
}
function test(scene,selected){
  const settings={scope:'start',backgroundAssetId:'',sprites:[],customArt:false};
  const values=Object.fromEntries(p.parameters.map(parameter=>[parameter.id,parameter.initialValue]));
  const config=el('div',{class:'stack'});
  const f=forms({...context(),upload:undefined,edit:action=>{action();update();}});
  function update(){
    config.replaceChildren(label('開始位置',select(settings.scope,[['start','作品の最初から'],...(scene?[['scene','編集中のシーンから']]:[]),...(selected?[['block','選択中のブロックから']]:[])],v=>{settings.scope=v;update();})));
    if(settings.scope!=='start'){
      if(p.parameters.length)config.append(el('h3',{},'開始時のパラメータ'));
      for(const param of p.parameters)config.append(label(param.name,input(values[param.id],v=>values[param.id]=v??0,{type:param.type==='boolean'?'checkbox':'number'})));
      config.append(label('開始時の背景と立ち絵を指定',input(settings.customArt,v=>{settings.customArt=v;update();},{type:'checkbox'})));
      if(settings.customArt)config.append(f.asset(settings,'backgroundAssetId','開始時の背景','background'),f.sprites(settings.sprites));
    }
    config.append(button('テストプレイを開始',()=>{
      closeDialog();
      const opts={debug:true};
      if(settings.scope!=='start'){
        Object.assign(opts,{sceneId:scene.id,values,index:settings.scope==='block'?scene.blocks.indexOf(selected):0});
        if(settings.customArt)Object.assign(opts,{background:settings.backgroundAssetId,sprites:settings.sprites});
      }
      play(p,opts,'editor');
    },'primary'));
  }
  update();
  ask('テストプレイ',config);
}
function play(project,options={},returnTo='home'){
  if(player)return;
  if(returnTo==='editor')flush().catch(()=>{});
  const snapshot=copy(project);
  const key=project.id+(options.debug?':test':':play');
  page='play';
  player=startPlayer(root,snapshot,{...options,names,assetUrl:id=>assetUrl(id,project),save:value=>put('saves',key,value),load:()=>get('saves',key),
    close:()=>{player=null;page=returnTo;render();}});
}
async function openEditor(project){
  p=project;page='editor';state=fresh(p.startSceneId);history=[];future=[];saved='保存済み';render();
  await guarded(async()=>{await assetsFor(project);if(page==='editor'&&p===project)render();});
}
async function showHome(){
  if(page==='editor'){
    try{await flush();}catch{return;}
  }
  p=null;page='home';projects=await all('projects');render();
}
function createProject(){
  const title=el('input',{placeholder:'無題のストーリー',maxLength:120});
  const form=el('form',{class:'stack'},label('作品名',title),el('button',{type:'submit',class:'primary'},'作品を作成'));
  form.onsubmit=e=>{
    e.preventDefault();
    runTask('create',async()=>{
      const entry=project(title.value.trim()||undefined);
      await put('projects',entry.id,entry);closeDialog();await openEditor(entry);
    });
  };
  ask('新しい作品',form);
}
function importProject(){
  runTask('import',async()=>{
    const file=await pickFile('.json,application/json');
    if(!file)return;
    const entry=await importJSON(file);
    await openEditor(entry);notify('作品を読み込みました。');
  });
}
function toggleTheme(){
  theme=theme==='dark'?'light':'dark';
  document.documentElement.dataset.theme=theme;
  try{localStorage.setItem('story-editor:theme',theme);}catch{}
  render();
}
function homeView(){
  const brand=el('div',{class:'brand'},el('span',{class:'brand-mark','aria-hidden':'true'},'◇'),el('strong',{},'ストーリーエディター'));
  const header=el('header',{class:'home-header'},brand,button(theme==='dark'?'☀ ライトモード':'☾ ダークモード',toggleTheme,'quiet'));
  const controls=el('div',{class:'row wrap'},button('JSONを読み込む',importProject,'secondary'),button('＋ 新しい作品',createProject,'primary'));
  const intro=el('div',{class:'home-intro stack'},el('h1',{},'あなたの作品'),el('p',{class:'muted'},'セリフを書き、選択肢を置いて、物語の続きをつくろう。'));
  const cards=el('div',{class:'project-grid'});
  for(const project of [...projects].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))){
    function menu(){
      ask(project.title,el('div',{class:'stack'},
        button('作品を複製',()=>runTask('clone:'+project.id,async()=>{closeDialog();await cloneProject(project);await refreshHome();})),
        button('制作データ（JSON）を出力',()=>exportProject(project,'json')),
        button('ゲームHTMLを出力',()=>exportProject(project,'html')),
        button('作品を削除',()=>confirm('作品を削除','「'+project.title+'」とそのプレイデータを削除します。',()=>runTask('delete:'+project.id,async()=>{
          await deleteProject(project.id);
          await refreshHome();
          for(const [key,value] of images)if(key.startsWith(project.id+'/')){URL.revokeObjectURL(value);images.delete(key);}
        })),'danger')));
    }
    const cover=el('div',{class:'project-cover',role:'img','aria-label':project.title+'のサムネイル'});
    paint(cover,project.thumbnailAssetId||'builtin:night',project);
    if(!assetUrl(project.thumbnailAssetId,project))cover.append(el('div',{class:'cover-mark','aria-hidden':'true'},'◇'));
    cards.append(el('article',{class:'project-card'},cover,el('div',{class:'project-content stack'},
      el('div',{class:'row split'},el('h2',{},project.title),button('⋯',menu,'quiet square',{'aria-label':project.title+'のその他の操作'})),
      el('p',{class:'project-description'},project.description||'あらすじは未設定です。'),
      el('div',{class:'project-meta'},project.scenes.length+' シーン',el('time',{dateTime:project.updatedAt},date.format(new Date(project.updatedAt)))),
      el('div',{class:'row wrap'},button('編集',()=>openEditor(project),'primary'),button('▶ プレイ',()=>runTask('play',async()=>{await assetsFor(project);if(page==='home')play(project);}), 'secondary')))));
  }
  if(!projects.length)cards.append(el('div',{class:'paper stack'},el('h2',{},'まだ作品がありません'),button('作品をつくる',createProject,'primary')));
  return el('div',{class:'home'},header,el('main',{class:'home-content stack'},el('div',{class:'home-heading'},intro,controls),cards,
    el('footer',{class:'muted'},'作品と画像はこのブラウザーに保存されます。')));
}
function render(){
  if(page==='play')return;
  const positions=Object.fromEntries(['.timeline','.scene-sidebar','.details-panel','.management'].map(key=>[key,root.querySelector(key)?.scrollTop??0]));
  const expanded=[...root.querySelectorAll('.details-panel details')].map(d=>d.open);
  root.replaceChildren(page==='editor'&&p?editor(context()):homeView());
  showSave();
  for(const [key,value] of Object.entries(positions)){const pane=root.querySelector(key);if(pane)pane.scrollTop=value;}
  if(state.focusDetails){
    state.focusDetails=false;
    state.mobile=window.matchMedia('(max-width:730px)').matches?'details':state.mobile;
    root.querySelector('.workspace')?.setAttribute('class','workspace mobile-'+state.mobile);
    if(state.mobile==='details')root.querySelectorAll('.mobile-nav button').forEach((b,i)=>b.classList.toggle('active',i===2));
    (root.querySelector('.details-panel textarea')??root.querySelector('.details-panel input,.details-panel select'))?.focus();
  }else root.querySelectorAll('.details-panel details').forEach((d,i)=>d.open=expanded[i]??false);
  if(state.focusComposer){state.focusComposer=false;root.querySelector('.composer textarea')?.focus();}
  if(state.scrollToBlock){state.scrollToBlock=false;root.querySelector('.story-block.selected')?.scrollIntoView({block:'nearest'});}
}
async function refreshHome(){
  projects=await all('projects');
  await Promise.all(projects.map(assetsFor));
  render();
}
window.addEventListener('keydown',e=>{
  if(page!=='editor'||dialog.open||e.target.closest('input,textarea,[contenteditable]')||!(e.ctrlKey||e.metaKey))return;
  if(e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}
  if(e.key.toLowerCase()==='y'){e.preventDefault();redo();}
});
window.addEventListener('pagehide',()=>{flush().catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush().catch(()=>{});});
root.append(el('p',{class:'loading'},'作品を読み込んでいます…'));
try{
  const installed=await get('settings','sample-installed');
  if(!installed){
    const demo=sample();
    await installSample(demo,await sampleImages(demo));
  }
  await refreshHome();
}catch(error){
  root.replaceChildren(el('div',{class:'paper stack'},el('h1',{},'ストーリーエディター'),el('p',{},'ブラウザーの保存領域を開けませんでした。'),button('再読み込み',()=>location.reload())));
  notify(error.message);
}
