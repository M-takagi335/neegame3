const database = new Promise((resolve,reject) => {
  const request = indexedDB.open('story-editor',1);
  request.onupgradeneeded = () => {
    for (const name of ['projects','images','saves','settings']) request.result.createObjectStore(name);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function tx(stores,mode,action) {
  const db = await database;
  return new Promise((resolve,reject) => {
    const t = db.transaction(stores,mode);
    const result = action(t);
    t.oncomplete = () => resolve(result?.result);
    t.onabort = () => reject(t.error ?? new Error('保存が中断されました。'));
  });
}
export const get = (store,key) => tx(store,'readonly',t=>t.objectStore(store).get(key));
export const put = (store,key,value) => tx(store,'readwrite',t=>t.objectStore(store).put(value,key));
export const all = store => tx(store,'readonly',t=>t.objectStore(store).getAll());
export function saveBundle(project,images) {
  return tx(['projects','images'],'readwrite',t=>{
    t.objectStore('projects').put(project,project.id);
    for (const [key,blob] of images) t.objectStore('images').put(blob,key);
  });
}
export function installSample(project,images) {
  return tx(['projects','images','settings'],'readwrite',t=>{
    const settings=t.objectStore('settings');
    const request=settings.get('sample-installed');
    request.onsuccess=()=>{
      if(request.result)return;
      t.objectStore('projects').put(project,project.id);
      for(const [key,blob] of images)t.objectStore('images').put(blob,key);
      settings.put(true,'sample-installed');
    };
  });
}
export function deleteProject(projectId) {
  return tx(['projects','images','saves'],'readwrite',t=>{
    t.objectStore('projects').delete(projectId);
    const images=t.objectStore('images');
    images.delete(IDBKeyRange.bound(projectId+'/',projectId+'0',false,true));
    for(const suffix of [':play',':test'])t.objectStore('saves').delete(projectId+suffix);
  });
}
