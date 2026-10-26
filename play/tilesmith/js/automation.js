// Created by: Brennan Meyer with use of Codex 09/17/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
(function(){
  'use strict';
  const E=window.TileEngine;
  const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const number=(value,min,max,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`${label} must be between ${min} and ${max}.`);return value;};
  const hex=value=>{if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw new Error('Use a six-digit hex color such as #3662D8.');return value;};
  const point=p=>{if(!plain(p))throw new Error('Each point needs x and y.');return{x:number(p.x,-1000000,1000000,'x'),y:number(p.y,-1000000,1000000,'y')};};
  window.installTileSmithAutomation=function(host){
    function state(){const d=host.getDoc();return{name:host.getName(),width:d.width,height:d.height,revision:host.getRevision(),dirty:host.isDirty(),activeId:d.activeId,layers:d.layers.map(({id,name,visible,opacity})=>({id,name,visible,opacity}))};}
    function ready(action,args){
      if(host.isBusy()||host.isPointer())throw new Error('TileSmith is busy with a file or brush gesture. Wait for it to finish, then retry.');
      const passive=['state','preview','projectData','exportData','markSaved'].includes(action);
      if(!passive&&host.hasBlockingModal(action))throw new Error('Close the dialog in TileSmith before editing the live canvas.');
      if(args.expectedRevision!==undefined&&args.expectedRevision!==host.getRevision())throw new Error('The canvas changed since you last inspected it. Read state and retry with its revision.');
    }
    function edit(label,fn){const d=host.getDoc(),backup=d.snapshot(),undo=d._undo.slice(),redo=d._redo.slice();try{d.checkpoint(label);fn(d);host.changed(label);return state();}catch(error){d.cancelStroke();d.restore(backup);d._undo=undo;d._redo=redo;host.updateUI();throw error;}}
    async function encoded(repeats=1,white=false,preview=false){
      if(![1,3].includes(repeats))throw new Error('repeat must be 1 or 3.');const d=host.getDoc(),w=d.width*repeats,h=d.height*repeats,s=preview?Math.min(1,1024/w,1024/h):1;
      const c=E.createCanvas(Math.max(1,Math.round(w*s)),Math.max(1,Math.round(h*s))),ctx=c.getContext('2d');ctx.scale(s,s);if(white){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);}const tile=d.composite();
      for(let x=0;x<repeats;x++)for(let y=0;y<repeats;y++)ctx.drawImage(tile,x*d.width,y*d.height);
      const result={png:c.toDataURL('image/png').split(',')[1],width:c.width,height:c.height,state:state()};c.width=c.height=1;return result;
    }
    async function execute(action,args={}){
      if(!plain(args))throw new Error('Tool arguments must be an object.');for(const key of ['replaceExisting','whiteBackground'])if(args[key]!==undefined&&typeof args[key]!=='boolean')throw new Error(key+' must be true or false.');ready(action,args);const d=host.getDoc();
      switch(action){
        case 'state':return state();
        case 'create':{
          if(host.isDirty()&&args.replaceExisting!==true)throw new Error('This canvas has unsaved changes. Save a project or explicitly set replaceExisting to true.');
          const background=args.background??'white';if(!['white','transparent'].includes(background))hex(background);
          const next=new E.Document(args.width,args.height,background);host.closeNew();host.setDocument(next,String(args.name||'Untitled tile').slice(0,80));return state();
        }
        case 'strokes':{
          if(!Array.isArray(args.strokes)||!args.strokes.length||args.strokes.length>200)throw new Error('Send 1–200 strokes per call.');
          if(!d.active.visible||d.active.opacity===0)throw new Error('Select a visible layer with nonzero opacity.');
          let total=0;
          const strokes=args.strokes.map(s=>{if(!plain(s)||!['brush','pencil','eraser','line','rectangle','ellipse'].includes(s.tool))throw new Error('Choose a supported drawing tool.');if(!Array.isArray(s.points)||!s.points.length||s.points.length>2000)throw new Error('Each stroke needs 1–2000 points.');total+=s.points.length;if(total>10000)throw new Error('Limit a batch to 10,000 points.');return{tool:s.tool,color:hex(s.color??'#3662D8'),size:number(s.size??24,1,256,'size'),opacity:number(s.opacity??1,0,1,'opacity'),filled:!!s.filled,points:s.points.map(point)};});
          for(let i=0;i<strokes.length;i++){const s=strokes[i];if(args.strokes[i].filled!==undefined&&typeof args.strokes[i].filled!=='boolean')throw new Error('filled must be true or false.');for(let n=1;n<s.points.length;n++){const a=s.points[['line','rectangle','ellipse'].includes(s.tool)?0:n-1],b=s.points[n],dx=Math.abs(b.x-a.x),dy=Math.abs(b.y-a.y);if(['rectangle','ellipse'].includes(s.tool)){if((dx/d.width+4)*(dy/d.height+4)>65536)throw new Error('This shape spans too many repeats. Draw a smaller shape.');}else if(Math.max(dx,dy)>16384)throw new Error('Consecutive stroke points must be within 16,384 pixels; split a long stroke into smaller segments.');}}
          return edit('Codex painted '+strokes.length+' stroke'+(strokes.length===1?'':'s')+'.',doc=>{for(const s of strokes){doc.beginStroke(s,s.points[0]);for(const p of s.points.slice(1))doc.strokeTo(p);doc.endStroke();}});
        }
        case 'fill':{const p=point(args),color=hex(args.color),opacity=number(args.opacity??1,0,1,'opacity');if(!d.active.visible||!d.active.opacity)throw new Error('Select a visible layer with nonzero opacity.');return edit('Codex filled an area.',doc=>doc.fill(p.x,p.y,color,opacity));}
        case 'layer':{
          const op=args.operation,l=d.layers.find(item=>item.id===(args.id||d.activeId));if(op!=='add'&&!l)throw new Error('Layer not found. Read state for its current ID.');
          if(op==='select'){d.activeId=l.id;host.changed('Codex selected '+l.name+'.',false);return state();}
          if(!['add','remove','rename','visibility','opacity','move'].includes(op))throw new Error('Unknown layer operation.');
          if(op==='add'&&d.layers.length>=8)throw new Error('This project already has eight layers.');
          if(op==='remove'&&d.layers.length<=1)throw new Error('Keep at least one layer.');
          if(['add','rename'].includes(op)&&args.name!==undefined&&(typeof args.name!=='string'||!args.name.trim()||args.name.length>60))throw new Error('Layer names need 1–60 characters.');
          if(op==='rename'&&!args.name)throw new Error('Provide the new layer name.');if(op==='visibility'&&typeof args.visible!=='boolean')throw new Error('visible must be true or false.');if(op==='opacity')number(args.opacity,0,1,'opacity');if(op==='move'&&![-1,1].includes(args.delta))throw new Error('delta must be -1 or 1.');
          return edit('Codex updated layers.',doc=>{if(op==='add')doc.addLayer(args.name);else if(op==='remove')doc.removeLayer(l.id);else if(op==='rename')l.name=args.name;else if(op==='visibility')l.visible=args.visible;else if(op==='opacity')l.opacity=args.opacity;else if(op==='move')doc.moveLayer(l.id,args.delta);});
        }
        case 'history':{if(!['undo','redo'].includes(args.operation))throw new Error('Choose undo or redo.');if(d[args.operation]())host.changed('Codex '+args.operation+'.',false);return state();}
        case 'preview':return encoded(args.repeat??1,false,true);
        case 'exportData':return encoded(args.repeat??1,!!args.whiteBackground,false);
        case 'projectData':return{project:await d.toProject(host.getName()),state:state()};
        case 'markSaved':host.markSaved();return state();
        case 'openData':{
          if(host.isDirty()&&args.replaceExisting!==true)throw new Error('This canvas has unsaved changes. Save it or explicitly set replaceExisting to true.');
          host.setBusy(true);try{const loaded=await E.Document.fromProject(args.project);host.closeNew();host.setDocument(loaded.document,loaded.name,true,true);return state();}finally{host.setBusy(false);}
        }
        case 'importData':{
          if(d.layers.length>=8)throw new Error('This project already has eight layers.');if(typeof args.base64!=='string'||args.base64.length>45*1024*1024)throw new Error('Provide an image up to 32 MiB.');
          host.setBusy(true);try{const bytes=Uint8Array.from(atob(args.base64),c=>c.charCodeAt(0)),image=await TileRaster.read(new Blob([bytes],{type:args.mime||'application/octet-stream'}));
            return edit('Codex imported an image.',doc=>{const l=doc.addLayer(String(args.name||'Imported image').slice(0,60)),s=Math.min(1,doc.width/image.width,doc.height/image.height);l.canvas.getContext('2d').drawImage(image,(doc.width-image.width*s)/2,(doc.height-image.height*s)/2,image.width*s,image.height*s);});
          }finally{host.setBusy(false);}
        }
        default:throw new Error('Unknown TileSmith operation.');
      }
    }
    window.TileSmithAutomation=Object.freeze({execute});
  };
})();
