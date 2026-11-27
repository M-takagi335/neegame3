import {createEngine} from './engine.js';
import {gradients} from './model.js';
export function mountPlayer(root,project,options,createEngine,gradients) {
  const engine=createEngine(project,options);
  const characters=new Map(project.characters.map(c=>[c.id,c]));
  const url=options.assetUrl;
  let speed=project.settings.speed;
  let timer, disposed=false, playing=true, finishTyping=null, previousBackground='', appliedTransition=null;
  const build=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node;};
  const action=(name,fn,cls='')=>{const b=build('button',cls,name);b.type='button';b.onclick=fn;return b;};
  const stage=build('div','play-stage '+project.settings.mode);
  const panel=build('section','play-panel');
  const top=build('header','play-toolbar');
  const bg=build('div','play-background');
  const scenery=build('div','play-sprites');
  const content=build('div','play-content');
  const feedback=build('div','play-feedback');
  feedback.setAttribute('role','status');
  const debug=build('aside','play-debug');
  const modal=build('dialog','play-dialog');
  const back=action(options.debug?'編集に戻る':'作品一覧へ',()=>{dispose();options.close?.();});
  if(options.close)top.append(back);
  top.append(build('strong','play-title',project.title));
  const save=async()=>{try{await options.save(engine.snapshot());feedback.textContent='プレイを保存しました。';}catch{feedback.textContent='保存できませんでした。';}};
  const load=async()=>{try{
    const state=await options.load();
    if(!state){feedback.textContent='セーブデータがありません。';return;}
    const scene=project.scenes.find(s=>s.id===state.currentSceneId);
    if(!scene||state.event?.blockId&&scene.blocks[state.currentBlockIndex]?.id!==state.event.blockId)throw Error();
    engine.restore(state);playing=true;render();feedback.textContent='プレイを再開しました。';
  }catch{feedback.textContent='セーブデータを読み込めませんでした。';}};
  function history() {
    const box=build('div','play-history');
    box.append(build('h2','', '会話履歴'));
    for(const entry of engine.state().dialogueHistory)box.append(message(entry));
    box.append(action('閉じる',()=>modal.close()));
    modal.replaceChildren(box);
    modal.showModal();
    box.scrollTop=box.scrollHeight;
  }
  function restart() {
    const fresh=createEngine(project,options);
    engine.restore(fresh.snapshot());
    playing=true;
    feedback.textContent='';
    render();
  }
  if(options.save)top.append(action('セーブ',save),action('ロード',load));
  top.append(action('履歴',history),action('タイトル',()=>{playing=false;render();}));
  const speedControl=build('select');
  speedControl.setAttribute('aria-label','文字表示速度');
  for(const [value,name] of [[0,'一括'],[12,'速い'],[24,'標準'],[60,'ゆっくり']]){
    const item=build('option','',name);item.value=value;speedControl.append(item);
  }
  if(![0,12,24,60].includes(speed)){const custom=build('option','','作品設定');custom.value=speed;speedControl.append(custom);}
  speedControl.value=speed;
  speedControl.onchange=()=>{speed=Number(speedControl.value);finishTyping?.();};
  top.append(speedControl);
  stage.append(bg,scenery,content);
  panel.append(top,stage,feedback,debug,modal);
  root.replaceChildren(panel);
  function dispose(){disposed=true;clearTimeout(timer);}
  function paint(element,key) {
    const image=url(key);
    element.style.background=gradients[key]??'#201a35';
    if(image)element.style.backgroundImage='url('+JSON.stringify(image)+')';
  }
  function message(event,includeText=true) {
    const character=characters.get(event.characterId);
    const entry=build('article','play-message '+event.type);
    if(character) {
      const name=build('strong','play-name',character.name);
      name.style.color=character.nameColor;
      const icon=url(character.iconAssetId);
      if(icon){const image=build('img','play-avatar');image.src=icon;image.alt='';entry.append(image);}
      entry.append(name);
    }
    const body=build('p','play-text',includeText?event.text:'');
    entry.append(body);
    return entry;
  }
  function type(text,node,done) {
    clearTimeout(timer);finishTyping=null;
    if(!speed||!text){node.textContent=text;done();return;}
    const chars=[...text];let index=0;
    finishTyping=()=>{
      clearTimeout(timer);node.textContent=text;finishTyping=null;done();
    };
    const tick=()=>{
      if(disposed)return;
      node.append(chars[index++]);
      if(project.settings.mode==='chat')content.scrollTop=content.scrollHeight;
      if(index<chars.length)timer=setTimeout(tick,speed);
      else{finishTyping=null;done();}
    };
    tick();
  }
  function renderDebug(state) {
    debug.replaceChildren();
    if(!options.debug)return;
    const d=build('details','');d.open=debug.dataset.open!=='false';
    d.ontoggle=()=>debug.dataset.open=String(d.open);
    const scene=project.scenes.find(s=>s.id===state.currentSceneId);
    const block=scene?.blocks[state.currentBlockIndex];
    d.append(build('summary','','デバッグ'));
    d.append(build('p','', (scene?.name??'不明')+' ／ ブロック '+(state.currentBlockIndex+1)+(block?' · '+(options.names?.[block.type]??block.type):'')));
    if(state.event?.choices)d.append(build('p','','移動先：'+state.event.choices.map(c=>c.text+' → '+(project.scenes.find(s=>s.id===c.target.sceneId)?.name??'次のブロック')).join(' ／ ')));
    else if(state.status==='input') {
      const probe=createEngine(project,{sceneId:state.currentSceneId,index:state.currentBlockIndex,values:state.parameterValues});
      probe.restore({...state,dialogueHistory:[],trace:[]});
      probe.advance();
      const next=probe.state();
      const nextScene=project.scenes.find(s=>s.id===next.currentSceneId);
      const destination=next.status==='error'?next.message:nextScene?.name+' ／ ブロック '+(next.currentBlockIndex+1);
      d.append(build('p','','次の移動先：'+destination));
    }
    const controls=build('div','play-debug-controls');
    for(const p of project.parameters) {
      const label=build('label','',p.name);
      const field=build('input');field.type=p.type==='boolean'?'checkbox':'number';
      if(p.type==='boolean')field.checked=!!state.parameterValues[p.id];else field.value=state.parameterValues[p.id];
      field.onchange=()=>{engine.setValue(p.id,p.type==='boolean'?field.checked:field.valueAsNumber||0);render();};
      label.append(field);controls.append(label);
    }
    const scenes=build('select');scenes.setAttribute('aria-label','移動するシーン');
    for(const s of project.scenes){const o=build('option','',s.name);o.value=s.id;scenes.append(o);}
    const undo=action('直前に戻る',()=>{engine.back();render();});undo.disabled=!engine.canBack();
    controls.append(scenes,action('指定シーンへ移動',()=>{engine.go(scenes.value);playing=true;render();}),undo);
    d.append(controls,build('pre','',state.trace.slice(-15).join('\n')));
    debug.append(d);
  }
  function render() {
    clearTimeout(timer);finishTyping=null;
    const state=engine.state(), event=state.event;
    content.replaceChildren();
    stage.onclick=null;
    const currentBackground=state.currentBackgroundAssetId;
    if(state.transition&&state.transition!==appliedTransition) {
      const {type,duration}=state.transition;
      appliedTransition=state.transition;
      const animation={fade:[{opacity:0},{opacity:1}],black:[{filter:'brightness(0)'},{filter:'brightness(1)'}],
        crossfade:[{opacity:1},{opacity:0}],slide:[{transform:'translateX(100%)'},{transform:'translateX(0)'}]};
      if(type==='crossfade'&&previousBackground!==currentBackground&&bg.animate) {
        const outgoing=build('div','play-background');
        paint(outgoing,previousBackground);stage.insertBefore(outgoing,scenery);
        outgoing.animate(animation.crossfade,{duration}).finished.then(()=>outgoing.remove(),()=>outgoing.remove());
      } else if(type!=='crossfade'&&animation[type]) bg.animate?.(animation[type],{duration});
    }
    paint(bg,currentBackground);
    previousBackground=currentBackground;
    scenery.replaceChildren();
    for(const sprite of state.visibleSprites) {
      const character=characters.get(sprite.characterId);
      const src=url(sprite.assetId||character?.sprites.find(s=>s.id===sprite.expressionId)?.assetId||character?.defaultSpriteId);
      if(!src)continue;
      const img=build('img','play-sprite '+sprite.position);
      img.src=src;img.alt=character?.name??'';
      img.style.height=Math.max(10,Math.min(200,sprite.size??100))*.84+'%';
      img.style.scale=sprite.flip?'-1 1':'1 1';
      scenery.append(img);
    }
    const visible=project.parameters.filter(p=>p.visible);
    if(visible.length&&playing){
      const stats=build('div','play-stats');
      for(const p of visible){const item=build('span','',p.name+' '+(p.type==='boolean'?(state.parameterValues[p.id]?'オン':'オフ'):state.parameterValues[p.id]));item.style.borderColor=p.color;stats.append(item);}
      content.append(stats);
    }
    renderDebug(state);
    if(!playing) {
      const title=build('div','play-centered');
      title.append(build('h1','',project.title),build('p','',project.description),action('最初から遊ぶ',restart,'play-primary'));
      if(options.load)title.append(action('つづきから',load));
      content.append(title);return;
    }
    if(state.status==='error') {
      const error=build('div','play-centered');
      error.append(build('h2','','プレイを続けられません'),build('p','',state.message),action('最初から遊ぶ',restart));
      content.append(error);return;
    }
    if(state.status==='ended') {
      const ending=build('div','play-centered');
      if(event.kind)ending.append(build('small','',event.kind));
      ending.append(build('h1','',event.name),build('p','',event.text),
        action('最初から遊ぶ',restart,'play-primary'),action('タイトルに戻る',()=>{playing=false;render();}));
      content.append(ending);return;
    }
    const chat=project.settings.mode==='chat';
    if(chat)for(const line of state.dialogueHistory.slice(0,event.text||state.status==='input'?-1:undefined))content.append(message(line));
    const wrapper=build('div','play-current');
    const entry=message(event,false);
    const controls=build('div','play-controls');
    if(event.text||state.status==='input')wrapper.append(entry);
    wrapper.append(controls);content.append(wrapper);
    function advance() {
      if(finishTyping){finishTyping();return;}
      if(engine.advance())render();
    }
    const reveal=()=>{
      if(state.status==='choice') {
        for(const choice of event.choices){
          const option=action(choice.text,()=>{
            if(engine.choose(choice.id,event))render();
          },'play-choice');
          option.disabled=!choice.enabled;controls.append(option);
        }
      } else controls.append(action('次へ',advance,'play-primary'));
      if(chat)content.scrollTop=content.scrollHeight;
    };
    stage.onclick=e=>{
      if(e.target.closest('button,select,input')||getSelection()?.toString())return;
      if(finishTyping||state.status==='input')advance();
    };
    type(event.text,entry.lastElementChild,reveal);
  }
  render();
  return {dispose,engine};
}
export const startPlayer=(root,project,options)=>mountPlayer(root,project,options,createEngine,gradients);
