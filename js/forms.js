import {el,button,label,input,select,listOf,disclosure} from './dom.js';
import {backgrounds,placement,option,effect,condition,to,next,id} from './model.js';
export const positions = [['left','左'],['center','中央'],['right','右']];
const ops = [['add','増やす'],['subtract','減らす'],['set','設定する']];
export const comparisons = [['>=','以上'],['<=','以下'],['>','より大きい'],['<','より小さい'],['==','等しい'],['!=','等しくない']];
const boolean = [['false','いいえ'],['true','はい']];
const endings = ['グッドエンド','バッドエンド','ノーマルエンド','トゥルーエンド','その他'];
const transitions = [['none','なし'],['fade','フェード'],['black','暗転'],['crossfade','クロスフェード'],['slide','スライド']];
const spriteOps = [['show','登場'],['hide','退場'],['expression','表情変更'],['image','立ち絵変更'],['position','表示位置変更'],['size','表示サイズ変更'],['flip','左右反転']];
export function forms(ctx) {
  const {p,edit,addScene,upload,assetUrl} = ctx;
  const field = (o,key,title,options) => label(title,input(o[key],(value,record=true)=>{
    const updated=value ?? (options?.type==='number' && !options.nullable ? 0 : value);
    if(o[key]===updated)return;
    const quiet=!options?.type || options.type==='color';
    edit(()=>o[key]=updated,!quiet,record);
    if(quiet)ctx.refreshLabels?.();
  },options));
  const pick = (o,key,title,items,change) => label(title,select(o[key],items,value=>edit(()=>{o[key]=value;change?.(value);})));
  const flag = (o,key,title) => field(o,key,title,{type:'checkbox'});
  const number = (o,key,title,nullable=false) => field(o,key,title,{type:'number',nullable});
  const text = (o,key,title,multiline=false) => field(o,key,title,{multiline,live:true});
  const color = (o,key,title) => field(o,key,title,{type:'color'});
  function asset(o,key,title,kind,empty='未設定') {
    const items = [['',empty],...(kind==='background' || kind==='thumbnail' ? Object.entries(backgrounds):[]),...listOf(p.assets.filter(a=>a.kind===kind || kind==='background' && a.kind==='event'))];
    const url = assetUrl(o[key]);
    return el('div',{class:'asset-field'},url && el('img',{src:url,alt:''}),pick(o,key,title,items),
      upload && button('画像を追加',()=>upload(kind,newId=>o[key]=newId),'quiet'));
  }
  const character = (o,key='characterId',change) => pick(o,key,'キャラクター',[['','未選択'],...listOf(p.characters)],change);
  function expression(o) {
    const c = p.characters.find(c=>c.id===o.characterId);
    return pick(o,'expressionId','表情',[['','初期表情'],...listOf(c?.sprites ?? [])]);
  }
  function target(o,key,title='移動先',allowNext=true) {
    const current = o[key];
    const value = current?.type==='scene' ? current.sceneId : '';
    return el('div',{class:'inline-fields'},label(title,select(value,[['',allowNext?'この続きへ':'移動先を選択'],...listOf(p.scenes)],v=>edit(()=>o[key]=v||!allowNext?to(v):next()))),
      button('分岐先を作成',()=>addScene(scene=>o[key]=to(scene.id)),'quiet'));
  }
  function items(list,factory,render,addLabel,orderable=false) {
    return el('div',{class:'stack repeating'},list.map((entry,i)=>el('div',{class:'subcard'},render(entry,i),el('div',{class:'row wrap'},
      orderable && i>0 && button('上へ',()=>edit(()=>list.splice(i-1,0,list.splice(i,1)[0])),'quiet'),
      orderable && i<list.length-1 && button('下へ',()=>edit(()=>list.splice(i+1,0,list.splice(i,1)[0])),'quiet'),
      button('削除',()=>edit(()=>list.splice(i,1)),'quiet danger')))),
      button(addLabel,()=>edit(()=>list.push(factory())),'secondary'));
  }
  function parameter(o,reset) {
    return pick(o,'parameterId','パラメータ',[['','未選択'],...listOf(p.parameters)],v=>{
      const entry=p.parameters.find(x=>x.id===v);
      o.value=entry?.type==='boolean'?false:0;
      reset?.(entry);
    });
  }
  function typedValue(o,type) {
    if (type!=='boolean') return number(o,'value','値');
    return label('値',select(String(Boolean(o.value)),boolean,v=>edit(()=>o.value=v==='true')));
  }
  function effects(list) {
    return items(list,effect,o=>{
      const type=p.parameters.find(p=>p.id===o.parameterId)?.type;
      return el('div',{class:'grid-fields'},parameter(o,entry=>o.operation=entry?.type==='boolean'?'set':'add'),
        pick(o,'operation','操作',type==='boolean'?ops.slice(2):ops),typedValue(o,type));
    },'パラメータ変動を追加');
  }
  function conditions(g) {
    return el('div',{class:'stack'},
      pick(g,'logic','組み合わせ',[['and','すべて一致（AND）'],['or','いずれか一致（OR）']]),
      !g.conditions.length && el('small',{},'条件なし'),
      items(g.conditions,condition,o=>{
        const type=p.parameters.find(p=>p.id===o.parameterId)?.type;
        return el('div',{class:'grid-fields'},parameter(o,e=>o.operator=e?.type==='boolean'?'==':'>='),
          pick(o,'operator','比較',type==='boolean'?comparisons.slice(-2):comparisons),typedValue(o,type));
      },'条件を追加'));
  }
  function sprite(o,operation='show') {
    const all=operation==='show';
    return [character(o,'characterId',()=>o.expressionId=''),
      (all||operation==='expression')&&expression(o),
      (all||operation==='image')&&asset(o,'assetId','立ち絵','sprite','キャラクターの初期立ち絵'),
      (all||operation==='position')&&pick(o,'position','表示位置',positions),
      (all||operation==='size')&&label('表示サイズ（%）',input(o.size,v=>edit(()=>o.size=Math.min(200,Math.max(10,v??100))),{type:'number',min:10,max:200})),
      (all||operation==='flip')&&flag(o,'flip','左右反転')];
  }
  const sprites = list => items(list,placement,o=>sprite(o),'立ち絵を追加');
  function blockFields(block) {
    const d=block.data;
    switch(block.type) {
      case 'dialogue': return [pick(d,'characterId','話者',[['','未選択'],...listOf(p.characters)],()=>{d.expressionId='';ctx.setSpeaker(d.characterId);}),text(d,'text','セリフ',true),
        disclosure('表情・立ち絵・背景',expression(d),asset(d,'assetId','立ち絵','sprite'),pick(d,'position','表示位置',[['','変更しない'],...positions]),asset(d,'backgroundAssetId','背景','background'))];
      case 'narration': return [text(d,'text','ナレーション',true)];
      case 'choice': return [text(d,'text','質問・案内',true),items(d.options,option,(c,i)=>[
        text(c,'text','選択肢 '+(i+1)),target(c,'target'),disclosure('パラメータ変動',effects(c.effects)),
        disclosure('表示する条件',conditions(c.visibilityCondition)),disclosure('選択できる条件',conditions(c.enabledCondition))
      ],'選択肢を追加',true)];
      case 'effect': return [effects(d.effects)];
      case 'branch': return [items(d.routes,()=>({condition:{logic:'and',conditions:[condition()]},target:to('')}),(r,i)=>[
        el('strong',{},'条件 '+(i+1)),conditions(r.condition),target(r,'target','一致したとき',false)
      ],'分岐を追加',true),target(d,'fallback','それ以外の場合',false)];
      case 'stage': return [text(d,'name','場面名'),asset(d,'backgroundAssetId','背景','background'),sprites(d.sprites),
        pick(d,'transition','転換エフェクト',transitions),label('転換時間（ミリ秒）',input(d.duration,v=>edit(()=>d.duration=Math.min(10000,Math.max(0,v??0))),{type:'number',min:0,max:10000}))];
      case 'background': return [asset(d,'backgroundAssetId','背景','background','背景を解除')];
      case 'sprite': return [pick(d,'operation','操作',spriteOps),sprite(d,d.operation)];
      case 'jump': return [target(d,'target','移動先',false)];
      case 'ending': return [text(d,'name','エンディング名'),text(d,'text','本文',true),asset(d,'backgroundAssetId','背景','background'),
        pick(d,'kind','種類',endings.map(name=>[name,name]))];
      default: return [];
    }
  }
  function scene(s) {
    return [text(s,'name','シーン名'),asset(s,'backgroundAssetId','初期背景','background','直前の背景を引き継ぐ'),
      flag({get inherit(){return s.initialSprites===null;},set inherit(v){s.initialSprites=v?null:[];}},'inherit','直前の立ち絵を引き継ぐ'),
      s.initialSprites!==null && sprites(s.initialSprites),
      pick(s,'nextSceneId','シーン終了後',[['','作品を終了'],...listOf(p.scenes)])];
  }
  function characterFields(c) {
    return [text(c,'name','名前'),text(c,'description','説明',true),color(c,'color','テーマカラー'),color(c,'nameColor','名前の表示色'),
      asset(c,'iconAssetId','アイコン','icon'),asset(c,'defaultSpriteId','初期立ち絵','sprite'),
      items(c.sprites,()=>({id:id(),name:'新しい表情',assetId:''}),s=>[text(s,'name','表情名'),asset(s,'assetId','画像','sprite')],'表情を追加')];
  }
  function parameterFields(o) {
    return [text(o,'name','名前'),text(o,'description','説明',true),pick(o,'type','データ型',[['number','数値'],['boolean','真偽値']],()=>ctx.convertParameter(o)),
      o.type==='boolean' ? flag(o,'initialValue','初期値をオンにする') : [
        number(o,'initialValue','初期値'),
        label('最小値',input(o.minValue,v=>edit(()=>{o.minValue=v;if(v!==null&&o.maxValue!==null&&v>o.maxValue)o.maxValue=v;}),{type:'number'})),
        label('最大値',input(o.maxValue,v=>edit(()=>{o.maxValue=v;if(v!==null&&o.minValue!==null&&v<o.minValue)o.minValue=v;}),{type:'number'}))
      ],flag(o,'visible','プレイヤーに表示'),color(o,'color','表示色')];
  }
  function settings() {
    return [text(p,'title','作品名'),text(p,'description','あらすじ',true),asset(p,'thumbnailAssetId','サムネイル','thumbnail'),
      pick(p.settings,'mode','プレイ画面',[['novel','ノベルゲーム'],['chat','チャット']]),
      label('文字の表示間隔（ミリ秒、0は一括表示）',input(p.settings.speed,v=>edit(()=>p.settings.speed=Math.min(120,Math.max(0,v??0))),{type:'number',min:0,max:120})),
      pick(p,'startSceneId','開始シーン',[['','未設定'],...listOf(p.scenes)])];
  }
  return {blockFields,scene,characterFields,parameterFields,settings,sprites,asset};
}
export function effectText(p,e) {
  const name=p.parameters.find(x=>x.id===e.parameterId)?.name ?? '未設定のパラメータ';
  const value=typeof e.value==='boolean' ? e.value?'オン':'オフ' : e.value;
  return e.operation==='set' ? name+'を'+value+'に設定' : name+'を'+value+(e.operation==='add'?'増やす':'減らす');
}
export function conditionText(p,g) {
  return g.conditions.map(c=>{
    const name=p.parameters.find(x=>x.id===c.parameterId)?.name ?? '未設定';
    return name+'が '+(typeof c.value==='boolean'?(c.value?'オン':'オフ'):c.value)+' '+(comparisons.find(([op])=>op===c.operator)?.[1]??'');
  }).join(g.logic==='and'?' かつ ':' または ') || '条件なし';
}
