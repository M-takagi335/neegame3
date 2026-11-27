export const names = {dialogue:'セリフ', narration:'ナレーション', choice:'選択肢', effect:'パラメータ変更', branch:'条件分岐', stage:'場面転換', background:'背景変更', sprite:'立ち絵操作', jump:'シーン移動', ending:'エンディング'};
export const icons = {dialogue:'▤', narration:'≡', choice:'◇', effect:'±', branch:'⑂', stage:'✦', background:'▧', sprite:'♙', jump:'⇥', ending:'⚑'};
export const backgrounds = {'builtin:dusk':'夕暮れ','builtin:day':'青空','builtin:night':'夜','builtin:paper':'アイボリー'};
export const gradients = {'builtin:dusk':'linear-gradient(155deg,#29284e,#754e79 45%,#f2a677)', 'builtin:day':'linear-gradient(155deg,#427caa,#a8d8ea 63%,#eaf2d9)', 'builtin:night':'linear-gradient(155deg,#111734,#42437a)', 'builtin:paper':'#eedec9'};
export const id = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
export const copy = value => structuredClone(value);
export const next = () => ({type:'next',sceneId:''});
export const to = sceneId => ({type:'scene',sceneId});
export const group = () => ({logic:'and', conditions:[]});
export const option = () => ({id:id(),text:'',effects:[],visibilityCondition:group(),enabledCondition:group(),target:next()});
export const effect = () => ({parameterId:'',operation:'add',value:1});
export const condition = () => ({parameterId:'',operator:'>=',value:0});
export const placement = () => ({characterId:'',assetId:'',expressionId:'',position:'center',size:100,flip:false});
export const makeScene = (name='新しいシーン') => ({id:id(),name,backgroundAssetId:'',initialSprites:null,blocks:[],nextSceneId:''});
export const makeCharacter = () => ({id:id(),name:'新しいキャラクター',description:'',color:'#7c55ce',nameColor:'#c6a9ff',iconAssetId:'',defaultSpriteId:'',sprites:[]});
export const makeParameter = () => ({id:id(),name:'新しいパラメータ',description:'',type:'number',initialValue:0,minValue:null,maxValue:null,visible:false,color:'#7c55ce'});
export function block(type, data={}) {
  const defaults = {dialogue:{text:'',characterId:'',assetId:'',expressionId:'',position:'',backgroundAssetId:''},narration:{text:''},choice:{text:'',options:[option(),option()]},effect:{effects:[effect()]},branch:{routes:[{condition:{logic:'and',conditions:[condition()]},target:to('')}],fallback:to('')},stage:{name:'',backgroundAssetId:'',sprites:[],transition:'fade',duration:500},background:{backgroundAssetId:''},sprite:{...placement(),operation:'show'},jump:{target:to('')},ending:{name:'エンディング',text:'',backgroundAssetId:'',kind:'その他'}};
  return {id:id(),type,data:{...defaults[type],...data}};
}
export function project(title='無題のストーリー') {
  const scene = makeScene('はじまり');
  const now = new Date().toISOString();
  return {id:id(),schemaVersion:1,title,description:'',thumbnailAssetId:'',createdAt:now,updatedAt:now,startSceneId:scene.id,settings:{mode:'novel',speed:24},characters:[],parameters:[],scenes:[scene],assets:[]};
}
export function duplicateScene(scene) {
  const result = {...copy(scene),id:id(),name:scene.name+'（コピー）'};
  result.blocks = result.blocks.map(duplicateBlock);
  return result;
}
export function duplicateBlock(item) {
  const result = {...copy(item),id:id()};
  for (const choice of result.data.options ?? []) choice.id = id();
  return result;
}
