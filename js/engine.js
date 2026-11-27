export function createEngine(project, options={}) {
  const scenes = new Map(project.scenes.map(scene => [scene.id,scene]));
  const parameters = new Map(project.parameters.map(parameter => [parameter.id,parameter]));
  const characters = new Map(project.characters.map(character => [character.id,character]));
  const clone = value => structuredClone(value);
  const bounded = (p,value) => p.type === 'boolean' ? Boolean(value) :
    Math.min(p.maxValue ?? Infinity, Math.max(p.minValue ?? -Infinity, Number(value)));
  const frames = [];
  let state = {
    currentSceneId:'',currentBlockIndex:0,parameterValues:Object.fromEntries(
      [...parameters].map(([id,p]) => [id,bounded(p,options.values?.[id] ?? p.initialValue)])),
    currentBackgroundAssetId:'',visibleSprites:[],dialogueHistory:[],reachedEndingId:'',
    status:'ready',message:'',event:null,trace:[],transition:null
  };
  function log(text) {
    state.trace.push(text);
    if (state.trace.length > 100) state.trace.shift();
  }
  function remember() {
    if (!options.debug) return;
    frames.push(clone(state));
    if (frames.length > 50) frames.shift();
  }
  function fail(message) {
    state.status = 'error';
    state.message = message;
  }
  function enter(id,index=0) {
    const scene = scenes.get(id);
    if (!scene) return fail('移動先のシーンが見つかりません。');
    state.currentSceneId = id;
    state.currentBlockIndex = index;
    if (scene.backgroundAssetId) state.currentBackgroundAssetId = scene.backgroundAssetId;
    if (scene.initialSprites !== null) state.visibleSprites = clone(scene.initialSprites ?? []);
    log('移動先：'+scene.name);
  }
  function matches(group) {
    if (!group?.conditions.length) return true;
    const compare = ({parameterId,operator,value}) => {
      if (!parameters.has(parameterId)) return false;
      const actual = state.parameterValues[parameterId];
      switch (operator) {
        case '>=': return actual >= value;
        case '<=': return actual <= value;
        case '>': return actual > value;
        case '<': return actual < value;
        case '==': return actual === value;
        case '!=': return actual !== value;
        default: return false;
      }
    };
    return group.logic === 'or' ? group.conditions.some(compare) : group.conditions.every(compare);
  }
  function change(effects) {
    for (const {parameterId,operation,value} of effects) {
      const p = parameters.get(parameterId);
      if (!p || (p.type === 'boolean' && operation !== 'set')) continue;
      const before = state.parameterValues[parameterId];
      const after = bounded(p,operation === 'add' ? before+value : operation === 'subtract' ? before-value : value);
      state.parameterValues[parameterId] = after;
      log(p.name+'：'+before+' → '+after);
    }
  }
  function target(t) {
    if (t?.type === 'scene') enter(t.sceneId);
    else state.currentBlockIndex++;
  }
  function sprite(data,operation) {
    if (!characters.has(data.characterId)) return;
    const index = state.visibleSprites.findIndex(item => item.characterId === data.characterId);
    const previous = state.visibleSprites[index];
    if (operation === 'hide') {
      if (previous) state.visibleSprites.splice(index,1);
      return;
    }
    if (!previous && operation !== 'show' && operation !== 'dialogue') return;
    const result = {...(previous ?? {characterId:data.characterId,position:'center',size:100,flip:false,assetId:'',expressionId:''})};
    if (operation === 'show' || operation === 'dialogue') {
      if (data.position) result.position = data.position;
      if (data.size) result.size = data.size;
      if (data.flip !== undefined) result.flip = data.flip;
    }
    if (operation === 'expression' || data.expressionId && ['show','dialogue'].includes(operation)) {
      result.expressionId = data.expressionId;
      result.assetId = '';
    }
    if (operation === 'image' || data.assetId && ['show','dialogue'].includes(operation)) {
      result.assetId = data.assetId;
      result.expressionId = '';
    }
    if (operation === 'position') result.position = data.position;
    if (operation === 'size') result.size = data.size;
    if (operation === 'flip') result.flip = data.flip;
    if (previous) state.visibleSprites[index] = result;
    else state.visibleSprites.push(result);
  }
  function run() {
    state.event = null;
    for (let count=0; count<=1000 && state.status === 'ready'; count++) {
      const scene = scenes.get(state.currentSceneId);
      if (!scene) return fail('開始シーンを設定してください。');
      const item = scene.blocks[state.currentBlockIndex];
      const data = item?.data;
      if (item?.type === 'dialogue' || item?.type === 'narration') {
        if (data.backgroundAssetId) state.currentBackgroundAssetId = data.backgroundAssetId;
        if (data.assetId || data.expressionId || data.position) sprite(data,'dialogue');
        state.event = {type:item.type,text:data.text,characterId:data.characterId,blockId:item.id};
        state.dialogueHistory.push(state.event);
        state.status = 'input';
        return;
      }
      if (item?.type === 'choice') {
        const choices = data.options.filter(o => matches(o.visibilityCondition)).map(o => ({...o,enabled:matches(o.enabledCondition)}));
        if (!choices.some(o => o.enabled)) {
          state.event = {type:item.type,text:data.text,choices,blockId:item.id};
          return fail('選べる選択肢がありません。');
        }
        state.event = {type:item.type,text:data.text,choices,blockId:item.id};
        if (data.text) state.dialogueHistory.push({type:'narration',text:data.text});
        state.status = 'choice';
        return;
      }
      if (item?.type === 'ending') {
        if (data.backgroundAssetId) state.currentBackgroundAssetId = data.backgroundAssetId;
        state.event = {type:'ending',...data,blockId:item.id};
        state.reachedEndingId = item.id;
        state.status = 'ended';
        return;
      }
      if (count === 1000) return fail('自動処理が1000件を超えたため停止しました。シーンの移動先を確認してください。');
      if (!item) {
        if (scene.nextSceneId) enter(scene.nextSceneId);
        else {
          state.event = {type:'ending',name:'おしまい',text:''};
          state.status = 'ended';
        }
        continue;
      }
      switch (item.type) {
        case 'effect': change(data.effects); break;
        case 'branch': {
          const route = data.routes.find(({condition},index) => {
            const result = matches(condition);
            log('条件 '+(index+1)+'：'+(result ? '一致' : '不一致'));
            return result;
          });
          if (!route) log('それ以外の場合');
          target(route?.target ?? data.fallback);
          continue;
        }
        case 'jump': target(data.target); continue;
        case 'background': state.currentBackgroundAssetId = data.backgroundAssetId; break;
        case 'stage':
          state.currentBackgroundAssetId = data.backgroundAssetId || state.currentBackgroundAssetId;
          state.visibleSprites = clone(data.sprites);
          state.transition = {type:data.transition,duration:data.duration};
          break;
        case 'sprite': sprite(data,data.operation); break;
      }
      state.currentBlockIndex++;
    }
  }
  enter(options.sceneId ?? project.startSceneId,options.index ?? 0);
  if (options.background !== undefined) state.currentBackgroundAssetId = options.background;
  if (options.sprites !== undefined) state.visibleSprites = clone(options.sprites);
  run();
  return {
    state: () => state,
    snapshot: () => clone(state),
    restore(snapshot) { state = clone(snapshot); frames.length = 0; },
    advance() {
      if (state.status !== 'input') return false;
      remember();
      state.transition = null;
      state.status = 'ready';
      state.currentBlockIndex++;
      run();
      return true;
    },
    choose(choiceId,expectedEvent) {
      if (state.status !== 'choice' || expectedEvent && expectedEvent !== state.event) return false;
      const choice = state.event.choices.find(o => o.id === choiceId && o.enabled);
      if (!choice) return false;
      remember();
      state.transition = null;
      state.status = 'ready';
      state.dialogueHistory.push({type:'selected',text:choice.text});
      change(choice.effects);
      target(choice.target);
      run();
      return true;
    },
    setValue(id,value) {
      if (!options.debug || !parameters.has(id)) return;
      remember();
      change([{parameterId:id,operation:'set',value}]);
      if (state.event?.type === 'choice') {
        if (state.status === 'choice' && state.event.text) state.dialogueHistory.pop();
        state.status = 'ready';
        run();
      }
    },
    go(id) {
      if (!options.debug || !scenes.has(id)) return;
      remember();
      state.status = 'ready';
      state.transition = null;
      enter(id);
      run();
    },
    back() {
      if (!frames.length) return false;
      state = frames.pop();
      return true;
    },
    canBack: () => frames.length > 0
  };
}
