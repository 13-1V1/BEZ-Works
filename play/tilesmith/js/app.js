// Created by: Brennan Meyer with use of Codex 09/17/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const E = window.TileEngine;
  const backgroundMode = new URLSearchParams(location.search).has('background');
  if (!E) { $('status').textContent = 'The drawing engine could not load. Keep the js folder beside index.html.'; return; }
  const icons = {
    plus:'M12 5v14M5 12h14',minus:'M5 12h14',close:'m6 6 12 12M18 6 6 18',arrow:'M4 12h15m-6-6 6 6-6 6',
    folder:'M3 6h7l2 3h9l-2 11H3zM3 6V4h7l2 3h8v2',save:'M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8',
    download:'M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5',help:'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    undo:'M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12',redo:'m16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
    brush:'m14 5 5-3 3 3-9 10-4-4 5-6ZM9 12c-6-1-2 7-7 8 8 3 12-3 7-8Z',pencil:'m15 3 6 6-12 12H3v-6L15 3Zm-2 2 6 6M3 15l6 6',
    eraser:'m14 3 7 7-11 11H6l-5-5L14 3Zm-7 7 7 7M9 21h13',fill:'m10 2 3 3M8 4l11 11-8 7-9-9 6-9Zm-5 9h14m3 3s-3 4-3 5a3 3 0 0 0 6 0c0-1-3-5-3-5',
    pipette:'m14 3 7 7M12 5l7 7M15 8 5 18l-2 3 4-1L18 9M17 2a3 3 0 0 1 5 5l-3 3-5-5 3-3Z',
    line:'M4 20 20 4M3 18v3h3M18 3h3v3',rectangle:'M3 5h18v14H3z',ellipse:'M21 12a9 7 0 1 1-18 0 9 7 0 0 1 18 0',
    hand:'M7 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v6-3a2 2 0 0 1 4 0v6c0 5-4 8-8 8-3 0-5-1-7-4l-5-6a2 2 0 0 1 3-3l3 3',
    repeat:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',square:'M4 4h16v16H4z',
    reset:'M4 4h10v10H4zM10 14v6h10V10h-6',image:'M3 3h18v18H3zM3 17l6-7 5 5 3-3 4 5M16 7h.1',
    up:'m6 14 6-6 6 6',down:'m6 10 6 6 6-6',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
    eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    eyeoff:'m3 3 18 18M10 5h2c6 0 10 7 10 7l-3 4M6 6c-3 2-4 6-4 6s4 7 10 7l4-1',
    wrap:'M4 8a8 8 0 0 1 14-4l3 4M21 2v6h-6M20 16a8 8 0 0 1-14 4l-3-4M3 22v-6h6'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(icons[name] || icons.square)+'"/></svg>'; }
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  const toolList = [['brush','Brush','B'],['pencil','Pencil','P'],['eraser','Eraser','E'],['fill','Fill','G'],['pipette','Eyedropper','I'],['line','Line','L'],['rectangle','Rectangle','R'],['ellipse','Ellipse','O'],['hand','Hand','H']];
  for (const [id,label,key] of toolList) {
    const button = document.createElement('button'); button.className = 'tool-button'; button.dataset.tool = id;
    button.setAttribute('aria-label',label); button.setAttribute('aria-pressed',String(id === 'brush')); button.title = `${label} (${key})`;
    button.innerHTML = icon(id); button.onclick = () => selectTool(id); $('tools').append(button);
  }
  const colors = [['#1E2B42','Midnight'],['#FFFFFF','White'],['#8090AA','Slate'],['#3662D8','Cobalt'],['#79A7ED','Sky'],['#4C8C7A','Fern'],['#8FBB98','Sage'],['#D3DDB3','Pear'],['#E36969','Coral'],['#B34864','Berry'],['#D99A66','Clay'],['#EDC86C','Marigold'],['#F0D9C0','Sand'],['#9B80C9','Iris'],['#CEADD9','Lilac'],['#563F65','Plum']];
  for (const [color,name] of colors) { const button = document.createElement('button'); button.style.background = color; button.dataset.color = color; button.title = `${name} ${color}`; button.setAttribute('aria-label',name); button.onclick = () => setColor(color); $('palette').append(button); }
  const canvas = $('viewport'), ctx = canvas.getContext('2d');
  let doc = new E.Document(512,512,'white');
  let projectName = 'Untitled tile', tool = 'brush', color = '#3662D8', backColor = '#FFFFFF', size = 24, opacity = 1;
  let zoom = 1, origin = {x:0,y:0}, repeat = true, borders = true;
  let dirty = false, revision = 0, draftTimer, toastTimer, recoveryDraft, renderPending = false, compositeDirty = true, hasArtwork = false;
  let pointer = null, space = false, lastMouse = null, initialized = false, busy = false, previewDirty = true;
  let confirmResolve, renameId;
  const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  const shapeTools = ['line','rectangle','ellipse'];
  function setBusy(value) { busy=value; document.querySelector('.app').inert=value; $('new-dialog').inert=value; document.body.style.cursor=value?'wait':''; }
  function status(message) { $('status').textContent = message; }
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true,4200); status(message); }
  function activeModal() { return !!document.querySelector('dialog[open]'); }
  function showDialog(id) { finishPointer(); $('brush-cursor').hidden = true; $(id).showModal(); }
  function confirmAction(message,label='Continue') {
    finishPointer(); $('confirm-message').textContent = message; $('confirm-ok').textContent = label; showDialog('confirm-dialog');
    return new Promise(resolve => { confirmResolve = resolve; });
  }
  function resolveConfirm(value) { $('confirm-dialog').close(); if (confirmResolve) { confirmResolve(value); confirmResolve = null; } }
  $('confirm-ok').onclick = () => resolveConfirm(true); $('confirm-cancel').onclick = () => resolveConfirm(false);
  $('confirm-dialog').addEventListener('cancel',e => { e.preventDefault(); resolveConfirm(false); });
  function requestRender(changed = false) {
    if (changed) { compositeDirty = true; previewDirty = true; }
    if (renderPending) return; renderPending = true;
    requestAnimationFrame(() => { renderPending = false; render(); });
  }
  function render() {
    const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const width = Math.max(1,Math.round(rect.width*dpr)), height = Math.max(1,Math.round(rect.height*dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,rect.width,rect.height);
    const tile = compositeDirty ? doc.composite() : doc._composite; compositeDirty = false;
    ctx.imageSmoothingEnabled = zoom < 1;
    if (repeat) {
      const pattern = ctx.createPattern(tile,'repeat'); pattern.setTransform(new DOMMatrix().translate(origin.x,origin.y).scale(zoom));
      ctx.fillStyle = pattern; ctx.fillRect(0,0,rect.width,rect.height);
    } else {
      ctx.fillStyle = '#242d3d'; ctx.fillRect(0,0,rect.width,rect.height);
      ctx.clearRect(origin.x,origin.y,doc.width*zoom,doc.height*zoom);
      ctx.drawImage(tile,origin.x,origin.y,doc.width*zoom,doc.height*zoom);
    }
    if (borders) {
      const tw = doc.width*zoom, th = doc.height*zoom;
      ctx.strokeStyle = '#5b78b787'; ctx.lineWidth = 1; ctx.setLineDash([4,4]); ctx.beginPath();
      if (repeat) {
        if (tw >= 6) for (let x=E.mod(origin.x,tw);x<rect.width;x+=tw) { ctx.moveTo(Math.round(x)+.5,0); ctx.lineTo(Math.round(x)+.5,rect.height); }
        if (th >= 6) for (let y=E.mod(origin.y,th);y<rect.height;y+=th) { ctx.moveTo(0,Math.round(y)+.5); ctx.lineTo(rect.width,Math.round(y)+.5); }
      }
      ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = '#3662d8'; ctx.lineWidth = 1.5;
      ctx.strokeRect(origin.x,origin.y,tw,th);
    }
    if (previewDirty) { drawPreview(tile); previewDirty = false; }
    $('zoom-value').textContent = `${Math.round(zoom*100)}%`;
  }
  function drawPreview(tile) {
    const preview = $('preview'); const p = preview.getContext('2d'); p.clearRect(0,0,preview.width,preview.height);
    const s = Math.min(preview.width/doc.width,preview.height/doc.height); p.imageSmoothingEnabled = s < 1;
    p.drawImage(tile,(preview.width-doc.width*s)/2,(preview.height-doc.height*s)/2,doc.width*s,doc.height*s);
  }
  function fit() {
    if (pointer) return;
    const r=canvas.getBoundingClientRect(); zoom=clamp(Math.min(r.width/doc.width,r.height/doc.height)*(repeat?.62:.82),1/32,32);
    origin={x:(r.width-doc.width*zoom)/2,y:(r.height-doc.height*zoom)/2}; requestRender();
  }
  function zoomTo(value,x,y) {
    if (pointer) return;
    const r = canvas.getBoundingClientRect(); x ??= r.width/2; y ??= r.height/2;
    const next = clamp(value,1/32,32); origin.x=x-(x-origin.x)*next/zoom; origin.y=y-(y-origin.y)*next/zoom; zoom=next; requestRender(); updateCursor(lastMouse);
  }
  function world(event) { const r=canvas.getBoundingClientRect(); return {x:(event.clientX-r.left-origin.x)/zoom,y:(event.clientY-r.top-origin.y)/zoom}; }
  function inside(p) { return repeat || (p.x>=0 && p.y>=0 && p.x<doc.width && p.y<doc.height); }
  function updateCursor(event) {
    if (!event) return; const r=canvas.getBoundingClientRect(); const cursor=$('brush-cursor');
    const drawTool=['brush','pencil','eraser'].includes(tool) && !space && !activeModal() && inside(world(event));
    cursor.hidden=!drawTool; if (drawTool) { const diameter=Math.max(2,size*zoom); cursor.style.width=diameter+'px'; cursor.style.height=diameter+'px'; cursor.style.left=event.clientX-r.left+'px'; cursor.style.top=event.clientY-r.top+'px'; cursor.style.borderRadius=tool==='pencil'?'0':'50%'; }
    canvas.style.cursor=tool==='hand'||space?(pointer?'grabbing':'grab'):drawTool?'none':'crosshair';
  }
  function selectTool(value) {
    finishPointer(); tool=value; const entry=toolList.find(t=>t[0]===value); $('tool-name').textContent=entry[1];
    document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===value)));
    $('filled-control').hidden=!['rectangle','ellipse'].includes(value);
    $('size').disabled=$('size-number').disabled=['fill','pipette','hand'].includes(value);
    $('opacity').disabled=['pipette','hand'].includes(value);
    status(value==='fill'?'Fill connects matching pixels across tile edges.':value==='eraser'?'Erase the selected layer. Lower layers remain visible.':`${entry[1]} selected. Paint in any repeat.`); updateCursor(lastMouse);
  }
  function setColor(value) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return false; color=value.toUpperCase(); $('color').value=color; $('hex').value=color; $('front-color').style.background=color; $('back-color').style.background=backColor;
    $('color-label').textContent=colors.find(c=>c[0]===color)?.[1]||'Custom';
    document.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color))); return true;
  }
  function setSize(value) { size=clamp(Math.round(Number(value)||1),1,256); $('size').value=size; $('size-number').value=size; updateCursor(lastMouse); }
  function updateUI() {
    $('project-name').value=projectName; document.title=`${dirty?'• ':''}${projectName} — TileSmith`;
    $('dimensions').textContent=$('preview-dimensions').textContent=`${doc.width} × ${doc.height} px`;
    $('undo-btn').disabled=!doc.canUndo; $('redo-btn').disabled=!doc.canRedo; $('add-layer').disabled=doc.layers.length>=8;
    $('delete-layer').disabled=doc.layers.length<=1; const index=doc.layers.indexOf(doc.active);
    $('layer-up').disabled=index===doc.layers.length-1; $('layer-down').disabled=index===0;
    $('layer-opacity').value=Math.round(doc.active.opacity*100); $('layer-opacity-value').textContent=Math.round(doc.active.opacity*100)+'%';
    renderLayers(); $('canvas-hint').hidden=hasArtwork; requestRender(true);
  }
  function renderLayers() {
    const list=$('layer-list'); list.replaceChildren();
    for (const layer of [...doc.layers].reverse()) {
      const row=document.createElement('div'); row.className='layer'+(layer.id===doc.activeId?' active':''); row.dataset.layer=layer.id; row.tabIndex=0; row.setAttribute('role','group'); row.setAttribute('aria-label',`${layer.name}${layer.id===doc.activeId?', selected':''}`);
      const visible=document.createElement('button'); visible.className='icon-button'; visible.innerHTML=icon(layer.visible?'eye':'eyeoff'); visible.title=(layer.visible?'Hide ':'Show ')+layer.name; visible.setAttribute('aria-label',visible.title); visible.setAttribute('aria-pressed',String(layer.visible));
      visible.onclick=e=>{ e.stopPropagation(); finishPointer(); doc.checkpoint('Layer visibility'); layer.visible=!layer.visible; changed('Layer visibility changed.'); };
      const thumbnail=E.createCanvas(40,40); const s=Math.min(40/doc.width,40/doc.height); thumbnail.getContext('2d').drawImage(layer.canvas,(40-doc.width*s)/2,(40-doc.height*s)/2,doc.width*s,doc.height*s);
      const name=document.createElement('span'); name.className='layer-name'; name.textContent=layer.name; name.title='Double-click to rename '+layer.name;
      name.ondblclick=e=>{ e.stopPropagation(); renameId=layer.id; $('rename-value').value=layer.name; showDialog('rename-dialog'); $('rename-value').select(); };
      row.onclick=()=>{ finishPointer(); if(doc.activeId!==layer.id){doc.activeId=layer.id;changed('Selected '+layer.name+'.',false);} };
      row.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();row.click();} if(e.key==='F2'){e.preventDefault();name.dispatchEvent(new MouseEvent('dblclick'));} };
      row.append(visible,thumbnail,name); list.append(row);
    }
  }
  function changed(message,art=true) { dirty=true; revision++; if(art)hasArtwork=true; updateUI(); if(message)status(message); scheduleDraft(); }
  function scheduleDraft() { if(backgroundMode)return; clearTimeout(draftTimer); $('draft-status').textContent='Recovery pending'; draftTimer=setTimeout(saveDraft,900); }
  async function saveDraft() {
    const current=doc, version=revision;
    try { const data=await current.toProject(projectName); await TileStorage.write(data); if(current===doc&&version===revision)$('draft-status').textContent='Recovery up to date'; }
    catch { $('draft-status').textContent='Recovery unavailable'; $('draft-status').title='Download a project to keep your work.'; }
  }
  function setDocument(next,name,art=false,saved=false) {
    finishPointer(); clearTimeout(draftTimer); doc=next; projectName=name.trim()||'Untitled tile'; dirty=!saved&&art; hasArtwork=art; revision++;
    updateUI(); fit(); scheduleDraft();
  }
  function finishPointer(cancel=false) {
    if(!pointer)return; const p=pointer; pointer=null;
    try { canvas.releasePointerCapture(p.id); } catch {}
    if(p.mode==='draw'){ if(cancel)doc.cancelStroke(); else doc.endStroke(); changed(cancel?'Stroke canceled.':'Stroke complete.'); }
    updateCursor(lastMouse);
  }
  function constrain(point,event) {
    if(!event.shiftKey||!pointer||!shapeTools.includes(tool))return point;
    const start=pointer.start,dx=point.x-start.x,dy=point.y-start.y;
    if(tool==='line'){const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,len=Math.hypot(dx,dy);return{x:start.x+Math.cos(angle)*len,y:start.y+Math.sin(angle)*len};}
    const extent=Math.max(Math.abs(dx),Math.abs(dy));return{x:start.x+Math.sign(dx||1)*extent,y:start.y+Math.sign(dy||1)*extent};
  }
  canvas.addEventListener('pointerdown',event=>{
    if(pointer||busy||activeModal()||!event.isPrimary||![0,1].includes(event.button))return;
    event.preventDefault(); canvas.focus({preventScroll:true}); lastMouse=event; const p=world(event);
    if(tool==='hand'||space||event.button===1){pointer={id:event.pointerId,mode:'pan',client:{x:event.clientX,y:event.clientY},origin:{...origin}};canvas.setPointerCapture(event.pointerId);updateCursor(event);return;}
    if(!inside(p))return;
    if(tool==='pipette'||event.altKey){const rgba=doc.pick(p.x,p.y);if(rgba[3]===0)toast('That pixel is transparent.');else{setColor('#'+rgba.slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join(''));status('Color picked from visible artwork.');}return;}
    if(!doc.active.visible){toast('Show the selected layer before painting.');return;}
    if(doc.active.opacity===0){toast('Increase this layer’s opacity before painting.');return;}
    doc.checkpoint(tool==='fill'?'Fill':toolList.find(t=>t[0]===tool)[1]);
    if(tool==='fill'){doc.fill(p.x,p.y,color,opacity);changed('Area filled across connected tile edges.');return;}
    pointer={id:event.pointerId,mode:'draw',start:p}; canvas.setPointerCapture(event.pointerId);
    doc.beginStroke({tool,color,size,opacity,filled:$('filled').checked},p);hasArtwork=true;$('canvas-hint').hidden=true;requestRender(true);updateCursor(event);
  });
  canvas.addEventListener('pointermove',event=>{
    if(!event.isPrimary)return;lastMouse=event;const p=world(event);$('coordinates').textContent=`${Math.floor(E.mod(p.x,doc.width))}, ${Math.floor(E.mod(p.y,doc.height))} px`;
    if(pointer&&event.pointerId===pointer.id){if(pointer.mode==='pan'){origin.x=pointer.origin.x+event.clientX-pointer.client.x;origin.y=pointer.origin.y+event.clientY-pointer.client.y;requestRender();}else{doc.strokeTo(constrain(p,event));requestRender(true);}}
    updateCursor(event);
  });
  canvas.addEventListener('pointerup',event=>{if(pointer?.id===event.pointerId){if(pointer.mode==='draw')doc.strokeTo(constrain(world(event),event));finishPointer();}});
  canvas.addEventListener('pointercancel',event=>{if(pointer?.id===event.pointerId)finishPointer(true);});
  canvas.addEventListener('lostpointercapture',()=>finishPointer());
  canvas.addEventListener('pointerleave',()=>{$('brush-cursor').hidden=true;$('coordinates').textContent='';});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',event=>{event.preventDefault();if(pointer)return;const r=canvas.getBoundingClientRect();zoomTo(zoom*Math.exp(-clamp(event.deltaY,-200,200)*.002),event.clientX-r.left,event.clientY-r.top);},{passive:false});
  window.addEventListener('blur',()=>{space=false;finishPointer();$('brush-cursor').hidden=true;});
  new ResizeObserver(()=>{if(!initialized){initialized=true;fit();}else requestRender();}).observe($('canvas-wrap'));

  $('color').oninput=e=>setColor(e.target.value); $('hex').onchange=e=>{if(!setColor(e.target.value.startsWith('#')?e.target.value:'#'+e.target.value)){e.target.value=color;toast('Use a six-digit color, such as #3662D8.');}};
  $('swap-color').onclick=()=>{const old=color;setColor(backColor);backColor=old;setColor(color);};$('reset-colors').onclick=()=>{backColor='#FFFFFF';setColor('#000000');};
  $('size').oninput=e=>setSize(e.target.value);$('size-number').onchange=e=>setSize(e.target.value);$('opacity').oninput=e=>{opacity=Number(e.target.value)/100;$('opacity-value').textContent=e.target.value+'%';};
  $('eyedropper-btn').onclick=()=>selectTool('pipette');
  $('borders').onchange=e=>{borders=e.target.checked;requestRender();};
  function setRepeat(value){finishPointer();repeat=value;$('repeat-btn').classList.toggle('selected',value);$('single-btn').classList.toggle('selected',!value);$('repeat-btn').setAttribute('aria-pressed',String(value));$('single-btn').setAttribute('aria-pressed',String(!value));document.querySelector('.live-label').style.visibility=value?'visible':'hidden';requestRender();}
  $('repeat-btn').onclick=()=>setRepeat(true);$('single-btn').onclick=()=>setRepeat(false);
  $('zoom-in').onclick=()=>zoomTo(zoom*1.25);$('zoom-out').onclick=()=>zoomTo(zoom/1.25);$('zoom-value').onclick=()=>zoomTo(1);$('fit-btn').onclick=fit;
  $('undo-btn').onclick=()=>{finishPointer();if(doc.undo())changed('Undid the last edit.',false);};$('redo-btn').onclick=()=>{finishPointer();if(doc.redo())changed('Redid the edit.',false);};
  $('add-layer').onclick=()=>{finishPointer();if(doc.layers.length>=8)return;doc.checkpoint('Add layer');doc.addLayer('Layer '+(doc.layers.length+1));changed('New layer added.',false);};
  $('delete-layer').onclick=async()=>{if(doc.layers.length<=1)return;const id=doc.activeId;if(!await confirmAction('Delete this layer? You can bring it back with Undo.','Delete layer'))return;doc.checkpoint('Delete layer');doc.removeLayer(id);changed('Layer deleted.');};
  $('layer-up').onclick=()=>{finishPointer();doc.checkpoint('Move layer');doc.moveLayer(doc.activeId,1);changed('Layer moved up.');};$('layer-down').onclick=()=>{finishPointer();doc.checkpoint('Move layer');doc.moveLayer(doc.activeId,-1);changed('Layer moved down.');};
  let opacityCheckpoint=false;
  $('layer-opacity').oninput=e=>{finishPointer();if(!opacityCheckpoint){doc.checkpoint('Layer opacity');opacityCheckpoint=true;}doc.active.opacity=Number(e.target.value)/100;$('layer-opacity-value').textContent=e.target.value+'%';requestRender(true);};
  $('layer-opacity').onchange=()=>{opacityCheckpoint=false;changed('Layer opacity changed.');};
  $('rename-form').onsubmit=e=>{e.preventDefault();const layer=doc.layers.find(l=>l.id===renameId),name=$('rename-value').value.trim();if(layer&&name){doc.checkpoint('Rename layer');layer.name=name;changed('Layer renamed.',false);$('rename-dialog').close();}};
  $('project-name').onchange=e=>{projectName=e.target.value.trim()||'Untitled tile';changed('Project renamed.',false);};
  $('help-btn').onclick=()=>showDialog('help-dialog');$('brand').onclick=e=>{e.preventDefault();showDialog('help-dialog');};
  document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
  $('new-btn').onclick=()=>{ $('new-error').textContent='';$('recovery').hidden=true;showDialog('new-dialog');};$('close-new').onclick=()=>$('new-dialog').close();
  document.querySelectorAll('[data-size]').forEach(button=>button.onclick=()=>{$('new-width').value=$('new-height').value=button.dataset.size;updatePresets();});
  function updatePresets(){document.querySelectorAll('[data-size]').forEach(b=>b.classList.toggle('active',b.dataset.size===$('new-width').value&&b.dataset.size===$('new-height').value));}
  $('new-width').oninput=$('new-height').oninput=updatePresets;
  $('new-form').onsubmit=async e=>{
    e.preventDefault();const width=Number($('new-width').value),height=Number($('new-height').value);let next;
    try{next=new E.Document(width,height,$('new-background').value);}catch(error){$('new-error').textContent=error.message;return;}
    if(dirty&&!await confirmAction('Create a new tile and replace your current artwork? Save a project first if you want to keep it.','Create new tile'))return;
    setDocument(next,$('new-name').value);$('new-dialog').close();status('Your tile is ready. Draw in any repeat.');canvas.focus();
  };
  $('sample-btn').onclick=async()=>{
    if(dirty&&!await confirmAction('Replace your current artwork with the sample? Save a project first to keep it.','Open sample'))return;
    const next=new E.Document(256,256,'#f5eee3');next.addLayer('Garden shapes');
    const paint=(tool,color,size,filled,a,b)=>{next.beginStroke({tool,color,size,filled,opacity:1},a);next.strokeTo(b);next.endStroke();};
    paint('ellipse','#416c60',5,true,{x:-36,y:28},{x:40,y:118});paint('ellipse','#88a990',5,true,{x:170,y:191},{x:224,y:280});
    paint('ellipse','#d49b69',5,true,{x:93,y:64},{x:157,y:128});paint('ellipse','#e8b691',5,true,{x:99,y:70},{x:151,y:122});
    paint('line','#416c60',7,false,{x:131,y:208},{x:155,y:145});paint('ellipse','#416c60',5,true,{x:110,y:157},{x:142,y:177});paint('ellipse','#88a990',5,true,{x:142,y:140},{x:169,y:160});
    paint('brush','#d49b69',11,false,{x:61,y:195},{x:61,y:195});paint('brush','#d49b69',7,false,{x:82,y:210},{x:82,y:210});paint('brush','#d49b69',9,false,{x:207,y:46},{x:207,y:46});
    setDocument(next,'Garden rhythm',true);$('new-dialog').close();toast('Sample loaded. Try painting across a tile border.');
  };
  $('restore-btn').onclick=async()=>{if(busy||!recoveryDraft)return;setBusy(true);try{const loaded=await E.Document.fromProject(recoveryDraft.project);setDocument(loaded.document,loaded.name,true);$('new-dialog').close();toast('Recovery draft restored. Save a project to keep a portable copy.');}catch(error){$('new-error').textContent='Could not restore draft: '+error.message;}finally{setBusy(false);}};

  function safeName(){return (projectName.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/,'').slice(0,80)||'TileSmith');}
  async function download(blob,name){
    if(window.TileSmithDesktop){const kind=name.endsWith('.tilesmith')?'project':'png';let data;if(kind==='project')data=await blob.text();else data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});return TileSmithDesktop.saveFile({kind,suggestedName:name,data});}
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);return{canceled:false};
  }
  $('save-btn').onclick=async()=>{
    if(busy)return;finishPointer();setBusy(true);const current=doc,version=revision;
    try{const data=await doc.toProject(projectName);const saved=await download(new Blob([JSON.stringify(data)],{type:'application/json'}),safeName()+'.tilesmith');if(saved.canceled){status('Save canceled.');return;}if(doc===current&&revision===version){dirty=false;updateUI();}toast(window.TileSmithDesktop?'Project saved with editable layers.':'Project download started. It keeps your editable layers.');}catch(error){toast('Could not save project: '+error.message);}finally{setBusy(false);}
  };
  function exportInfo(){const n=Number($('export-mode').value);$('export-size').textContent=`${doc.width*n} × ${doc.height*n} px · ${n===1?'One seamless tile':'Nine identical repeats'}`;}
  $('export-btn').onclick=()=>{exportInfo();showDialog('export-dialog');};$('export-mode').onchange=exportInfo;
  $('export-form').onsubmit=async event=>{
    event.preventDefault();if(busy)return;setBusy(true);const button=$('export-form').querySelector('button[type=submit]');button.disabled=true;
    try{const n=Number($('export-mode').value),tile=doc.composite(),output=E.createCanvas(doc.width*n,doc.height*n),c=output.getContext('2d');
      if($('export-white').checked){c.fillStyle='#fff';c.fillRect(0,0,output.width,output.height);}for(let x=0;x<n;x++)for(let y=0;y<n;y++)c.drawImage(tile,x*doc.width,y*doc.height);
      const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw new Error('The browser could not encode this image. Try a single tile.');const saved=await download(blob,safeName()+(n===1?'':'-repeat')+'.png');output.width=output.height=1;if(saved.canceled){status('Export canceled.');return;}$('export-dialog').close();toast(window.TileSmithDesktop?'PNG exported.':'PNG download started. Tile borders are not included.');
    }catch(error){toast('Could not export: '+error.message);}finally{setBusy(false);button.disabled=false;}
  };
  const readImage=file=>TileRaster.read(file);
  $('open-btn').onclick=()=>$('open-file').click();$('import-btn').onclick=()=>{if(doc.layers.length>=8){toast('This project already has 8 layers. Delete a layer before importing.');return;}$('import-file').click();};
  $('open-file').onchange=async event=>{const file=event.target.files[0];event.target.value='';if(!file||busy)return;finishPointer();setBusy(true);try{
    let loaded;
    if(/\.(tilesmith|json)$/i.test(file.name)){if(file.size>190*1024*1024)throw new Error('Project file is too large.');loaded=await E.Document.fromProject(JSON.parse(await file.text()));}
    else{const image=await readImage(file);if(image.width>2048||image.height>2048)throw new Error('Opening an image keeps its size. Choose an image up to 2048 × 2048 px, or use Import image to fit it into this tile.');const next=new E.Document(image.width,image.height,'transparent');next.active.name='Imported image';next.active.canvas.getContext('2d').drawImage(image,0,0);loaded={document:next,name:file.name.replace(/\.[^.]+$/,'')};}
    if(dirty&&!await confirmAction('Open this file and replace your current artwork? Save a project first to keep your changes.','Open file'))return;
    setDocument(loaded.document,loaded.name,true,true);$('new-dialog').close();toast('Opened '+loaded.name+'.');
  }catch(error){toast('Could not open file: '+error.message);}finally{setBusy(false);}};
  $('import-file').onchange=async event=>{const file=event.target.files[0];event.target.value='';if(!file||busy)return;finishPointer();setBusy(true);try{
    const image=await readImage(file);if(doc.layers.length>=8)throw new Error('The project already has 8 layers.');doc.checkpoint('Import image');const layer=doc.addLayer(file.name.replace(/\.[^.]+$/,'')),s=Math.min(1,doc.width/image.width,doc.height/image.height);layer.canvas.getContext('2d').drawImage(image,(doc.width-image.width*s)/2,(doc.height-image.height*s)/2,image.width*s,image.height*s);changed('Image imported as a layer.');toast(s<1?'Image centered and scaled down to fit your tile.':'Image imported as a new layer.');
  }catch(error){toast('Could not import image: '+error.message);}finally{setBusy(false);}};
  document.addEventListener('keydown',event=>{
    if(activeModal()||busy)return;const typing=/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable;
    const key=event.key.toLowerCase(),mod=event.ctrlKey||event.metaKey;
    if(mod){if(key==='s'){event.preventDefault();$('save-btn').click();}else if(key==='o'){event.preventDefault();$('open-btn').click();}else if(key==='z'&&!typing){event.preventDefault();$(event.shiftKey?'redo-btn':'undo-btn').click();}else if(key==='y'&&!typing){event.preventDefault();$('redo-btn').click();}else if(key==='e'&&event.shiftKey){event.preventDefault();$('export-btn').click();}else if(key==='n'&&event.altKey){event.preventDefault();$('new-btn').click();}return;}
    if(typing)return;
    if(event.code==='Space'){event.preventDefault();space=true;updateCursor(lastMouse);return;}
    if(key==='escape'){finishPointer(true);return;}
    const found=toolList.find(t=>t[2].toLowerCase()===key);if(found){event.preventDefault();selectTool(found[0]);return;}
    if(key==='['||key===']'){event.preventDefault();setSize(size+(key==='['?-1:1)*(size<10?1:5));}
    else if(key==='t'){$('borders').click();}else if(key==='f'){fit();}else if(key==='x'){$('swap-color').click();}else if(key==='d'){$('reset-colors').click();}else if(key==='?'||key==='/'){showDialog('help-dialog');}else if(key==='+'||key==='='){zoomTo(zoom*1.25);}else if(key==='-'){zoomTo(zoom/1.25);}
  });
  document.addEventListener('keyup',event=>{if(event.code==='Space'){space=false;updateCursor(lastMouse);}});
  window.addEventListener('beforeunload',event=>{if(dirty&&!backgroundMode){event.preventDefault();event.returnValue='';}});
  setColor(color);updateUI();fit();if(!backgroundMode)showDialog('new-dialog');
  if(!backgroundMode)TileStorage.read().then(draft=>{if(draft){recoveryDraft=draft;$('recovery').hidden=false;}}).catch(()=>{$('draft-status').textContent='Recovery unavailable';});
  if(window.installTileSmithAutomation)installTileSmithAutomation({getDoc:()=>doc,getName:()=>projectName,getRevision:()=>revision,isDirty:()=>dirty,isBusy:()=>busy,isPointer:()=>!!pointer,hasBlockingModal:action=>[...document.querySelectorAll('dialog[open]')].some(el=>el.id!=='new-dialog'||!['create','openData'].includes(action)),closeNew:()=>$('new-dialog').close(),setDocument,changed,updateUI,setBusy,markSaved:()=>{dirty=false;updateUI();}});
  if(window.TileSmithDesktop){document.body.classList.add('desktop-app');$('draft-status').textContent='Desktop workspace';TileSmithDesktop.onCommand(command=>{const focused=document.activeElement;if(['undo','redo'].includes(command)&&focused&&(/INPUT|TEXTAREA/.test(focused.tagName)||focused.isContentEditable)){document.execCommand(command);return;}if(busy||activeModal())return;const ids={new:'new-btn',save:'save-btn',open:'open-btn',export:'export-btn',undo:'undo-btn',redo:'redo-btn'};if(ids[command])$(ids[command]).click();});}
})();
