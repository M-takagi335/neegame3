import {el,button,input,label,select,listOf} from './dom.js';
import {names,icons,block,duplicateBlock,duplicateScene,makeCharacter,makeParameter} from './model.js';
import {forms,effectText,conditionText} from './forms.js';
import {graph} from './graph.js';
import {references,validate} from './validation.js';
import {kinds} from './export.js';
const tabs=[['story','ストーリー'],['characters','キャラクター'],['parameters','パラメータ'],['assets','画像素材'],['map','分岐マップ'],['checks','エラー確認'],['settings','作品設定']];
export const previewText=(p,b)=>{
  const d=b.data;
  const scene=id=>p.scenes.find(s=>s.id===id)?.name??'未設定';
  const art=id=>p.assets.find(a=>a.id===id)?.name??({'builtin:dusk':'夕暮れ','builtin:day':'青空','builtin:night':'夜','builtin:paper':'アイボリー'}[id]??'未設定');
  switch(b.type){
    case 'dialogue':case 'narration':return d.text||'本文を入力';
    case 'choice':return d.text||d.options.length+' 件の選択肢';
    case 'effect':return d.effects.map(e=>effectText(p,e)).join(' ／ ')||'変動なし';
    case 'branch':return [...d.routes.map(r=>conditionText(p,r.condition)+' → '+scene(r.target.sceneId)),'それ以外 → '+scene(d.fallback.sceneId)].join(' ／ ');
    case 'stage':return d.name||'新しい場面';
    case 'background':return art(d.backgroundAssetId);
    case 'sprite':return (p.characters.find(c=>c.id===d.characterId)?.name??'キャラクター未選択')+' ／ '+({show:'登場',hide:'退場',expression:'表情変更',image:'立ち絵変更',position:'位置変更',size:'サイズ変更',flip:'左右反転'}[d.operation]);
    case 'jump':return scene(d.target.sceneId);
    case 'ending':return d.name;
  }
};
export function editor(ctx) {
  const {p,state,edit,goScene,ask,rerender,notify}=ctx;
  const {tab}=state;
  const scene=p.scenes.find(s=>s.id===state.sceneId)??p.scenes[0];
  const selected=scene?.blocks.find(b=>b.id===state.blockId);
  const f=forms(ctx);
  const listActions=(list,index,duplicate,remove)=>{
    const move=step=>edit(()=>list.splice(index+step,0,list.splice(index,1)[0]));
    return el('div',{class:'row wrap item-actions'},
      button('上へ',()=>move(-1),'quiet',{disabled:index===0}),button('下へ',()=>move(1),'quiet',{disabled:index===list.length-1}),
      duplicate && button('複製',duplicate,'quiet'),button('削除',remove,'quiet danger'));
  };
  const saveBadge=el('span',{class:'save-state','data-save':'',role:'status'},ctx.saveState());
  const top=el('header',{class:'editor-top'},el('div',{class:'row top-left'},button('作品一覧',ctx.home,'quiet'),el('strong',{class:'editor-title'},p.title),saveBadge),
    el('div',{class:'row wrap'},button('元に戻す',ctx.undo,'quiet',{disabled:!ctx.canUndo(),'data-undo':''}),button('やり直す',ctx.redo,'quiet',{disabled:!ctx.canRedo(),'data-redo':''}),
      button('テストプレイ',()=>ctx.test(scene,selected),'primary')));
  const nav=el('nav',{class:'editor-nav','aria-label':'編集メニュー'},tabs.map(([key,name])=>button(name,()=>{state.tab=key;state.mobile='timeline';rerender();},tab===key?'active':'',{ 'aria-pressed':String(tab===key)})));
  function story() {
    const sidebar=el('aside',{class:'scene-sidebar stack'},el('div',{class:'row split'},el('h2',{},'シーン'),button('＋',()=>ctx.addScene(s=>{state.sceneId=s.id;state.blockId='';}),'square',{'aria-label':'シーンを追加'})),
      el('div',{class:'scene-list stack'},p.scenes.map(s=>el('button',{type:'button',class:'scene-link '+(s.id===scene?.id?'active':''),onclick:()=>goScene(s.id)},
        el('span',{'data-scene-name':s.id},s.name),s.id===p.startSceneId&&el('small',{},'開始')))),
      el('div',{class:'sidebar-cast stack'},el('h3',{},'登場人物'),p.characters.map(c=>{
        const chip=el('span',{class:'cast-dot'},c.name.slice(0,1));chip.style.background=c.color;
        return el('div',{class:'row'},chip,c.name);
      }),button('キャラクターを管理',()=>{state.tab='characters';rerender();},'quiet')));
    if(!scene)return el('div',{class:'two-pane'},sidebar,el('main',{class:'empty stack'},el('h2',{},'シーンを作成しましょう'),button('シーンを追加',()=>ctx.addScene(s=>state.sceneId=s.id),'primary')));
    const timeline=el('main',{class:'timeline stack'});
    timeline.append(el('div',{class:'timeline-heading'},el('h1',{},scene.name),el('p',{class:'muted'},scene.blocks.length+' ブロック')));
    function appendBlock(type,index) {
      edit(()=>{
        const lastSpeaker=state.speaker===''||p.characters.some(c=>c.id===state.speaker)?state.speaker:p.characters[0]?.id??'';
        const data=type==='dialogue'?{characterId:lastSpeaker}:{};
        const entry=block(type,data);
        scene.blocks.splice(index,0,entry);
        state.blockId=entry.id;
        state.focusDetails=true;
      });
    }
    function insert(index) {
      const b=button('＋',()=>ask('ブロックを追加',el('div',{class:'block-picker'},Object.entries(names).map(([type,name])=>
        button(icons[type]+'  '+name,()=>{ctx.closeDialog();appendBlock(type,index);},'type-'+type)))),'insert-button',{'aria-label':(index+1)+'番目にブロックを挿入'});
      return el('div',{class:'insertion'},b);
    }
    timeline.append(insert(0));
    for(const [i,b] of scene.blocks.entries()) {
      const speaker=p.characters.find(c=>c.id===b.data.characterId);
      const type=el('span',{class:'block-type'},icons[b.type]+'  '+names[b.type]);
      const main=el('button',{type:'button',class:'block-main',onclick:()=>{state.blockId=b.id;state.focusDetails=true;rerender();}},type,
        speaker&&b.type==='dialogue'&&el('span',{class:'speaker'},speaker.name),
        !state.collapsed.has(b.id)&&el('span',{class:'block-summary'},previewText(p,b)),
        !state.collapsed.has(b.id)&&b.type==='choice'&&el('span',{class:'choice-summary'},b.data.options.map(o=>el('span',{'data-choice-id':o.id},'◇ '+(o.text||'空欄')+
          (o.effects.length?' · '+o.effects.map(e=>effectText(p,e)).join(' ／ '):'')))));
      const card=el('article',{class:'story-block type-'+b.type+(selected===b?' selected':''),draggable:true,'data-block-id':b.id},main,
        el('div',{class:'block-tools'},button(state.collapsed.has(b.id)?'展開':'折りたたむ',()=>{
          if(state.collapsed.has(b.id))state.collapsed.delete(b.id);else state.collapsed.add(b.id);rerender();
        },'quiet'),listActions(scene.blocks,i,()=>edit(()=>{const n=duplicateBlock(b);scene.blocks.splice(i+1,0,n);state.blockId=n.id;}),
          ()=>edit(()=>{scene.blocks.splice(i,1);if(state.blockId===b.id)state.blockId='';}))));
      card.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',b.id);event.dataTransfer.effectAllowed='move';});
      card.addEventListener('dragover',event=>{event.preventDefault();card.classList.add('drop');});
      card.addEventListener('dragleave',()=>card.classList.remove('drop'));
      card.addEventListener('drop',event=>{
        event.preventDefault();card.classList.remove('drop');
        const old=scene.blocks.findIndex(candidate=>candidate.id===event.dataTransfer.getData('text/plain'));
        if(old>=0&&old!==i)edit(()=>scene.blocks.splice(i,0,scene.blocks.splice(old,1)[0]));
      });
      timeline.append(card,insert(i+1));
    }
    const composer=el('form',{class:'composer stack'},el('label',{},el('span',{},'すばやくセリフを追加'),
      el('textarea',{placeholder:'セリフを書く…',rows:2,required:true})),
      el('div',{class:'row split wrap'},select(state.speaker??p.characters[0]?.id??'',[['','話者なし'],...listOf(p.characters)],v=>ctx.setSpeaker(v)),
        el('button',{type:'submit',class:'primary'},'セリフを追加')),
      el('small',{class:'muted'},'Ctrl / ⌘ + Enter で追加'));
    const draft=composer.querySelector('textarea');
    draft.value=state.draft;
    draft.oninput=()=>state.draft=draft.value;
    draft.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();composer.requestSubmit();}};
    composer.onsubmit=e=>{e.preventDefault();if(!draft.value.trim())return;
      edit(()=>{scene.blocks.push(block('dialogue',{text:draft.value,characterId:composer.querySelector('select').value}));state.draft='';state.focusComposer=true;});
    };
    timeline.append(composer);
    const panel=el('aside',{class:'details-panel stack'},el('div',{class:'panel-heading row split'},el('h2',{},'詳細設定'),
      selected&&button('シーン設定',()=>{state.blockId='';rerender();},'quiet')));
    const preview=el('div',{class:'mini-preview stack'},el('small',{},'プレビュー'),el('strong',{},scene.name),el('p',{},selected?previewText(p,selected):'このシーンを確認'),
      button('このシーンを再生',()=>ctx.quickPlay(scene),'quiet'));
    ctx.paint(preview,selected?.data.backgroundAssetId||scene.backgroundAssetId||'builtin:dusk');
    panel.append(preview);
    if(selected){
      panel.append(el('h3',{},icons[selected.type]+' '+names[selected.type]),f.blockFields(selected));
    } else {
      panel.append(el('h3',{},'シーン設定'),f.scene(scene),
        button(scene.id===p.startSceneId?'開始シーンに設定済み':'開始シーンに設定',()=>edit(()=>p.startSceneId=scene.id),'secondary',{disabled:scene.id===p.startSceneId}),
        listActions(p.scenes,p.scenes.indexOf(scene),()=>edit(()=>{const s=duplicateScene(scene);p.scenes.splice(p.scenes.indexOf(scene)+1,0,s);state.sceneId=s.id;state.blockId='';}),
          ()=>ctx.confirm('シーンを削除','「'+scene.name+'」を削除します。分岐から参照している場合は移動先を確認してください。',()=>edit(()=>{
            p.scenes.splice(p.scenes.indexOf(scene),1);if(p.startSceneId===scene.id)p.startSceneId=p.scenes[0]?.id??'';state.sceneId='';state.blockId='';
          }))));
    }
    const stack=el('div',{class:'workspace mobile-'+state.mobile},sidebar,timeline,panel);
    const mobile=el('nav',{class:'mobile-nav','aria-label':'ストーリーの編集パネル'},[['scenes','シーン'],['timeline','タイムライン'],['details','詳細']].map(([key,name])=>
      button(name,()=>{state.mobile=key;rerender();},state.mobile===key?'active':'')));
    return [mobile,stack];
  }
  function manage(which) {
    const cast=which==='characters';
    const list=cast?p.characters:p.parameters;
    const noun=cast?'キャラクター':'パラメータ';
    const key=cast?'characterId':'parameterId';
    const current=list.find(o=>o.id===state[key])??list[0];
    const add=()=> {
      const item=cast?makeCharacter():makeParameter();
      if(!cast){edit(()=>{list.push(item);state[key]=item.id;});return;}
      const field=el('input',{type:'text',value:item.name});
      const affinity=el('input',{type:'checkbox'});
      const form=el('form',{class:'stack'},label('名前',field),label('好感度パラメータも作成する',affinity),
        el('button',{type:'submit',class:'primary'},'キャラクターを作成'));
      form.onsubmit=e=>{e.preventDefault();ctx.closeDialog();edit(()=>{
        item.name=field.value.trim()||item.name;list.push(item);state[key]=item.id;
        if(affinity.checked)p.parameters.push({...makeParameter(),name:item.name+'の好感度',color:item.color});
      });};
      ask('キャラクターを追加',form);
    };
    return el('div',{class:'manage-grid'},el('aside',{class:'stack'},
      button('＋ '+noun+'を追加',add,'primary'),list.map(o=>button(o.name,()=>{state[key]=o.id;rerender();},'manage-link '+(current===o?'active':''),{'data-managed':o.id}))),
      el('section',{class:'paper stack'},current?[el('h2',{'data-managed':current.id},current.name),
        cast?f.characterFields(current):f.parameterFields(current),
        listActions(list,list.indexOf(current),()=>edit(()=>{
          const clone=structuredClone(current);
          const fresh=cast?makeCharacter():makeParameter();
          clone.id=fresh.id;clone.name+='（コピー）';
          if(cast)clone.sprites=clone.sprites.map(s=>({...s,id:makeCharacter().id}));
          list.splice(list.indexOf(current)+1,0,clone);state[key]=clone.id;
        }),()=>ctx.confirm(noun+'を削除','「'+current.name+'」を削除します。参照しているブロックはエラー確認で探せます。',
          ()=>edit(()=>list.splice(list.indexOf(current),1))))]:el('p',{class:'muted'},noun+'を追加してください。')));
  }
  function assets() {
    return el('div',{class:'stack'},Object.entries(kinds).map(([kind,name])=>
      el('section',{class:'paper stack'},el('div',{class:'row split'},el('h2',{},name),button('画像を追加',()=>ctx.upload(kind),'secondary')),
        el('div',{class:'asset-grid'},p.assets.filter(a=>a.kind===kind).map(a=>{
          const url=ctx.assetUrl(a.id);
          const rename=input(a.name,v=>edit(()=>a.name=v.trim()||a.name));
          rename.setAttribute('aria-label','素材名');
          return el('article',{class:'asset-card stack'},url?el('img',{src:url,alt:a.name}):el('p',{},'読み込み中'),rename,
            button('削除',()=>{
              const locations=references(p).filter(r=>r.kind==='画像素材'&&r.id===a.id).map(r=>r.name+'（'+r.field+'）');
              ctx.confirm('画像を削除',locations.length?'使用箇所：\n'+locations.join('\n'):'「'+a.name+'」を削除します。',
                ()=>edit(()=>p.assets.splice(p.assets.indexOf(a),1)));
            },'quiet danger'));
        })))));
  }
  if(tab==='story')return el('div',{class:'editor'},top,nav,story());
  const screen=el('main',{class:'management stack'},el('h1',{},tabs.find(([key])=>key===tab)[1]));
  if(tab==='characters'||tab==='parameters')screen.append(manage(tab));
  if(tab==='assets')screen.append(assets());
  if(tab==='map')screen.append(graph(p,goScene));
  if(tab==='checks'){
    const issues=validate(p);
    screen.append(el('section',{class:'stack'},issues.length?issues.map(i=>button((i.level==='error'?'エラー':'警告')+' ／ '+i.message,()=>{
      if(i.sceneId)goScene(i.sceneId,i.blockId);
      else {state.tab='settings';rerender();}
    },'issue '+i.level)):el('p',{class:'paper'},'問題は見つかりませんでした。')));
  }
  if(tab==='settings')screen.append(el('section',{class:'paper stack form-page'},f.settings(),el('div',{class:'row wrap'},
    button('制作データを出力',()=>ctx.export('json'),'secondary'),button('ゲームHTMLを出力',()=>ctx.export('html'),'primary'))));
  return el('div',{class:'editor'},top,nav,screen);
}
