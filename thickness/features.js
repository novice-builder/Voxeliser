/* Voxel Lab Thickness Lab beta — standalone additions to the existing model importer/viewer.
   Source geometry and UVs are unchanged. Imported models stay local to this browser. */
(()=>{'use strict';
const B=window.ThicknessBridge,$=id=>document.getElementById(id);
if(!B){document.getElementById('thickInfo').textContent='Thickness engine could not initialise.';return;}
let geometry=null,mesh=null,stats=null,exporting=false;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),fmt=n=>Number(n).toLocaleString('en-AU');
function vecMinus(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function unit(a){const l=Math.hypot(...a);return l>1e-10?a.map(x=>x/l):[0,-1,0];}
function norm(a,b,c){return unit(cross(vecMinus(b,a),vecMinus(c,a)));}
function centre3(a,b,c){return[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];}
const num=(id,fallback)=>{const v=Number($(id).value);return Number.isFinite(v)?v:fallback;};
const isGlass=(mat,source)=>((source.materialOpacities?.[mat]??1)<.999)||/(window|glass|glaz|pane|fenetre|fenêtre)/i.test(source.materialNames?.[mat]||'');
function reset(){buildToken++;$('buildThickness').disabled=false;if(mesh)B.destroy(mesh);mesh=null;geometry=null;stats=null;$('thickInfo').textContent='No thickness built. Exterior geometry is unchanged.';}
function worldVertex(source,bounds,scale,i){const p=source.positions;return[(p[i]-(bounds.min[0]+bounds.max[0])/2)*scale,(p[i+1]-bounds.min[1])*scale,(p[i+2]-(bounds.min[2]+bounds.max[2])/2)*scale];}

/* Memory-conscious indexed collision tree; no per-triangle JS object allocation. */
function makeCollisionTree(source){
 const pos=source.positions,count=source.materials.length;
 const indices=new Uint32Array(count),centroids=new Float32Array(count*3);
 for(let i=0;i<count;i++){indices[i]=i;const o=i*9;for(let k=0;k<3;k++)centroids[i*3+k]=(pos[o+k]+pos[o+3+k]+pos[o+6+k])/3;}
 function build(start,end){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],cmin=[Infinity,Infinity,Infinity],cmax=[-Infinity,-Infinity,-Infinity];
  for(let i=start;i<end;i++){const id=indices[i],o=id*9;
   for(let k=0;k<3;k++){const centroid=centroids[id*3+k];cmin[k]=Math.min(cmin[k],centroid);cmax[k]=Math.max(cmax[k],centroid);
    for(let v=0;v<3;v++){const p=pos[o+v*3+k];lo[k]=Math.min(lo[k],p);hi[k]=Math.max(hi[k],p);}
   }
  }
  const node={lo,hi,start,end};
  if(end-start<=32)return node;
  const ranges=cmax.map((v,k)=>v-cmin[k]),axis=ranges.indexOf(Math.max(...ranges)),midpoint=(cmin[axis]+cmax[axis])/2;
  let left=start,right=end-1;
  while(left<=right){
   if(centroids[indices[left]*3+axis]<midpoint)left++;
   else{const tmp=indices[left];indices[left]=indices[right];indices[right--]=tmp;}
  }
  if(left===start||left===end)return node;
  node.left=build(start,left);node.right=build(left,end);return node;
 }
 return{indices,root:build(0,count)};
}
function rayBox(origin,dir,node,maxDist){
 let lo=0,hi=maxDist;
 for(let k=0;k<3;k++){
  if(Math.abs(dir[k])<1e-12){if(origin[k]<node.lo[k]-1e-8||origin[k]>node.hi[k]+1e-8)return false;}
  else{const a=(node.lo[k]-origin[k])/dir[k],b=(node.hi[k]-origin[k])/dir[k];lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return false;}
 }
 return true;
}
function rawHit(pos,index,origin,dir,epsilon){
 const o=index*9;
 const ax=pos[o],ay=pos[o+1],az=pos[o+2],e1x=pos[o+3]-ax,e1y=pos[o+4]-ay,e1z=pos[o+5]-az;
 const e2x=pos[o+6]-ax,e2y=pos[o+7]-ay,e2z=pos[o+8]-az;
 const nx=e1y*e2z-e1z*e2y,ny=e1z*e2x-e1x*e2z,nz=e1x*e2y-e1y*e2x;
 const normalLength=Math.hypot(nx,ny,nz);if(normalLength<1e-10||Math.abs((nx*dir[0]+ny*dir[1]+nz*dir[2])/normalLength)<.55)return Infinity;
 const px=dir[1]*e2z-dir[2]*e2y,py=dir[2]*e2x-dir[0]*e2z,pz=dir[0]*e2y-dir[1]*e2x;
 const det=e1x*px+e1y*py+e1z*pz;if(Math.abs(det)<1e-12)return Infinity;
 const inv=1/det,tx=origin[0]-ax,ty=origin[1]-ay,tz=origin[2]-az;
 const u=(tx*px+ty*py+tz*pz)*inv;if(u<0||u>1)return Infinity;
 const qx=ty*e1z-tz*e1y,qy=tz*e1x-tx*e1z,qz=tx*e1y-ty*e1x;
 const v=(dir[0]*qx+dir[1]*qy+dir[2]*qz)*inv;if(v<0||u+v>1)return Infinity;
 const hit=(e2x*qx+e2y*qy+e2z*qz)*inv;
 return hit>epsilon?hit:Infinity;
}
function nearestObstacle(tree,source,own,rawCenter,dir,maxDepth,epsilon){
 let distance=maxDepth;const stack=[tree.root],pos=source.positions,order=tree.indices;
 while(stack.length){const node=stack.pop();if(!rayBox(rawCenter,dir,node,distance))continue;
  if(node.left){stack.push(node.left,node.right);continue;}
  for(let j=node.start;j<node.end;j++){const id=order[j];if(id===own)continue;
   const hit=rawHit(pos,id,rawCenter,dir,epsilon);if(hit<distance)distance=hit;
  }
 }
 return distance;
}
const yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
let buildToken=0;
async function buildGeometry(progress=()=>{},token=buildToken){
 const source=B.getSource(),bounds=B.getRawBounds();
 if(!source||!bounds)throw Error('Import a model first.');
 const amount=num('thickAmount',.2);
 if(!(amount>0&&amount<=100000))throw Error('Maximum thickness must be greater than 0 and no more than 100,000 metres.');
 const selected=B.getSelected(),scope=$('thickScope').value;
 if(scope==='selected'&&!selected.size)throw Error('Select a component before using Selected components.');
 const n=source.materials.length,eligible=[],counts=new Map(),skipGlass=$('thickSkipGlass').checked;
 for(let i=0;i<n;i++){
  const mat=source.materials[i],part=B.getTrianglePart(i);
  if(!B.isVisible(part)||scope==='selected'&&!selected.has(part)||skipGlass&&isGlass(mat,source))continue;
  eligible.push(i);
  const key=String(part)+'|'+String(mat);counts.set(key,(counts.get(key)||0)+1);
 }
 if(!eligible.length)throw Error('No eligible triangles. Try Whole model or change glass exclusion.');
 // Each original triangle creates three new vertices. The source mesh remains untouched.
 if(eligible.length>1800000)throw Error('This selection contains '+fmt(eligible.length)+' triangles. Choose individual components for a safer iPhone preview (1.8 million triangle limit).');
 const useCaps=($('thickCaps')?.checked!==false)&&eligible.length<=180000;
 const stopWanted=$('thickStop').checked,stopAllowed=stopWanted&&n<=650000;
 const notes=[];
 if(stopWanted&&!stopAllowed)notes.push('Opposing-surface stopping skipped for this large source; the maximum thickness is used. Select a smaller source to enable collision checking.');
 if($('thickCaps')?.checked!==false&&!useCaps)notes.push('Open-edge caps skipped above 180,000 selected triangles to reduce phone memory use (preview is not watertight). Select smaller components to enable them.');
 const scale=B.getScale(),invScale=1/scale,mid=[(bounds.min[0]+bounds.max[0])/2,bounds.min[1],(bounds.min[2]+bounds.max[2])/2];
 const globalCenter=[0,bounds.size[1]*scale/2,0],tolerance=Math.max(1e-8,Math.max(...bounds.size)*scale*0.000002);
 const maxRaw=amount*invScale,epsilonRaw=Math.max(tolerance*invScale*2,Math.min(.0001,amount*.002)*invScale);
 const keyFor=p=>p.map(v=>Math.round(v/tolerance)).join(',');
 const mode=$('thickDirection').value,target=[num('thickPointX',0),num('thickPointY',1),num('thickPointZ',0)];
 // Preallocate typed arrays exactly once, avoiding large JS number arrays and duplicate copying.
 const groups=new Map(),edges=useCaps?new Map():null;
 for(const [key,count] of counts){const [part,mat]=key.split('|').map(Number),tex=source.textureMaterials?.[mat]||0;
  groups.set(key,{partId:part,texId:tex,glass:false,alpha:source.materialOpacities?.[mat]??1,
   vertex:new Float32Array(count*33),cursor:0});
 }
 function writeTriangle(group,ps,uv,rgb){
  const normal=norm(...ps),v=group.vertex;let o=group.cursor;
  for(let j=0;j<3;j++){for(let k=0;k<3;k++)v[o++]=ps[j][k];
   for(let k=0;k<3;k++)v[o++]=normal[k];
   for(let k=0;k<3;k++)v[o++]=rgb[j][k];
   v[o++]=uv?uv[j][0]:0;v[o++]=uv?uv[j][1]:0;
  }group.cursor=o;
 }
 let tree=null;
 if(stopAllowed){progress('Preparing collision index for '+fmt(n)+' triangles…');await yieldFrame();
  tree=makeCollisionTree(source);await yieldFrame();}
 let stops=0,totalDepth=0;
 const pos=source.positions,uvs=source.uvs,colours=source.vertexColours,palette=source.palette;
 for(let at=0;at<eligible.length;at++){
  if(token!==buildToken)throw Error('Build cancelled.');
  const i=eligible[at],mat=source.materials[i],part=B.getTrianglePart(i),o=i*9;
  const raw=[
   [pos[o],pos[o+1],pos[o+2]],
   [pos[o+3],pos[o+4],pos[o+5]],
   [pos[o+6],pos[o+7],pos[o+8]]
  ];
  const pts=raw.map(p=>[(p[0]-mid[0])*scale,(p[1]-mid[1])*scale,(p[2]-mid[2])*scale]);
  const normal=norm(...pts),center=centre3(...pts);
  let direction;
  if(mode==='down')direction=[0,-1,0];
  else if(mode==='point')direction=unit(vecMinus(target,center));
  else if(mode==='x+')direction=[1,0,0];
  else if(mode==='x-')direction=[-1,0,0];
  else if(mode==='z+')direction=[0,0,1];
  else if(mode==='z-')direction=[0,0,-1];
  else direction=dot(normal,vecMinus(globalCenter,center))>=0?normal:normal.map(v=>-v);
  const rawCenter=centre3(...raw),depth=stopAllowed?nearestObstacle(tree,source,i,rawCenter,direction,maxRaw,epsilonRaw)*scale:amount;
  if(depth<amount-1e-5)stops++;
  totalDepth+=depth;
  const back=pts.map(p=>p.map((v,k)=>v+direction[k]*depth));
  const colour=palette?.[mat]||[.42,.79,.82],rgb=[0,1,2].map(j=>colour.map((v,k)=>clamp(v*(colours?.[(i*3+j)*3+k]??1),0,1)));
  const uv=[0,1,2].map(j=>[uvs?.[i*6+j*2]||0,uvs?.[i*6+j*2+1]||0]);
  writeTriangle(groups.get(String(part)+'|'+String(mat)),[back[0],back[2],back[1]],[uv[0],uv[2],uv[1]],[rgb[0],rgb[2],rgb[1]]);
  if(edges){
   for(const [a,b] of [[0,1],[1,2],[2,0]]){
    const A=keyFor(pts[a]),C=keyFor(pts[b]);if(A===C)continue;
    const key=A<C?A+'|'+C:C+'|'+A,entry=edges.get(key);
    if(entry)entry.count++;
    else edges.set(key,{count:1,p0:pts[a],p1:pts[b],q0:back[a],q1:back[b],part,mat,c0:rgb[a],c1:rgb[b]});
   }
  }
  if((at+1)%2500===0){progress('Building thickness… '+Math.round((at+1)/eligible.length*100)+'% · '+fmt(at+1)+' / '+fmt(eligible.length)+' triangles');await yieldFrame();}
 }
 tree=null;
 let edgeCount=0;
 if(edges){
  const boundaryByGroup=new Map();
  for(const e of edges.values())if(e.count===1){edgeCount++;const key=String(e.part)+'|'+String(e.mat);boundaryByGroup.set(key,(boundaryByGroup.get(key)||0)+1);}
  const sideGroups=new Map();
  for(const [key,count] of boundaryByGroup){const [part,mat]=key.split('|').map(Number);
   sideGroups.set(key,{partId:part,texId:0,glass:false,alpha:source.materialOpacities?.[mat]??1,vertex:new Float32Array(count*66),cursor:0});
  }
  let processed=0;
  for(const e of edges.values()){
   if(e.count===1){const g=sideGroups.get(String(e.part)+'|'+String(e.mat));
    writeTriangle(g,[e.p0,e.p1,e.q1],null,[e.c0,e.c1,e.c1]);
    writeTriangle(g,[e.p0,e.q1,e.q0],null,[e.c0,e.c1,e.c0]);
   }
   if((++processed)%30000===0){progress('Finishing boundary caps…');await yieldFrame();}
  }
  for(const [key,g] of sideGroups)groups.set('side'+key,g);
 }
 const allGroups=[...groups.values()].filter(g=>g.cursor>0);
 for(const g of allGroups){if(g.cursor!==g.vertex.length)g.vertex=g.vertex.subarray(0,g.cursor);delete g.cursor;}
 return{groups:allGroups,stats:{triangles:eligible.length,collisions:stops,edgeCount,averageDepth:totalDepth/eligible.length,
  collisionEnabled:stopAllowed,capsEnabled:useCaps,notes}};
}
async function build(){
 const button=$('buildThickness');button.disabled=true;const token=++buildToken;
 const display=msg=>{$('thickInfo').textContent=msg;};
 display('Preparing thickness construction…');
 try{
  const result=await buildGeometry(display,token);
  if(token!==buildToken)return;
  // Only replace a previously working result after successful geometry generation.
  const uploaded=B.upload(result);
  if(mesh)B.destroy(mesh);
  geometry=result;mesh=uploaded;stats=result.stats;$('shellVisible').checked=true;
  display(fmt(stats.triangles)+' triangles processed · '+fmt(stats.collisions)+' collision stops · '+fmt(stats.edgeCount)+' capped boundary edges · average depth '+stats.averageDepth.toFixed(3)+' m.'+
  (stats.notes.length?'\n'+stats.notes.join(' '):''));
  B.status('Thickness generated; original outer surfaces retained.','success');
 }catch(e){if(token===buildToken){display('Build failed: '+e.message);B.status('Thickness build failed: '+e.message,'error');}}
 finally{if(token===buildToken)button.disabled=false;}
}
function draw(proj,view){
 if(!mesh||!$('shellVisible').checked)return;
 for(const group of mesh.groups)if(B.isVisible(group.partId))B.drawMesh(group,proj,view,1,1);
}
function softwareMeshes(){return mesh&&$('shellVisible').checked?mesh.groups.filter(m=>B.isVisible(m.partId)):[];}
function download(filename,blob){
 const link=document.createElement('a'),url=URL.createObjectURL(blob);
 link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
const filename=()=>B.getName().replace(/\.[^.]+$/,'').replace(/[^A-Za-z0-9 _-]/g,'_')||'model';
function settings(){
 const original=B.getSource();
 return{schema:'voxel-lab-thickness-settings-v1',sourceName:B.getName(),sourceTriangles:original?.materials?.length||0,
 units:'metres',sourceScale:B.getScale(),thickness:{built:!!geometry,visible:$('shellVisible').checked,
 scope:$('thickScope').value,direction:$('thickDirection').value,maxMetres:num('thickAmount',.2),
 stopAtOpposingSurface:$('thickStop').checked,excludeGlass:$('thickSkipGlass').checked,
 targetPoint:[num('thickPointX',0),num('thickPointY',1),num('thickPointZ',0)],stats},
 appearance:{preset:$('lightingPreset').value,brightness:num('brightness',120)/100,ambient:num('ambientLight',90)/100,
 sun:B.getLighting().sun,glassStrength:B.getGlassStrength()},modelNote:'Original exterior retained; new thickness geometry may require watertight mesh repair.'};
}
function saveSettings(){download(filename()+' - Thickness settings.json',new Blob([JSON.stringify(settings(),null,2)],{type:'application/json'}));}
function saveReference(){
 const canvas=B.getCanvas();
 if(!canvas)return;
 canvas.toBlob(blob=>{if(blob)download(filename()+' - Reference.png',blob);else $('exportLookInfo').textContent='Could not capture PNG; try again after orbiting the model.';},'image/png');
}
const srgbToLinear=x=>{const v=clamp(x,0,1);return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);};
async function texturePNG(tex){
 const canvas=document.createElement('canvas');canvas.width=tex.width;canvas.height=tex.height;
 const c=canvas.getContext('2d');if(!c)throw Error('Cannot create texture image canvas.');
 c.putImageData(new ImageData(new Uint8ClampedArray(tex.pixels),tex.width,tex.height),0,0);
 return new Uint8Array(await new Promise((resolve,reject)=>canvas.toBlob(async blob=>blob?resolve(await blob.arrayBuffer()):reject(Error('PNG texture encoding failed')),'image/png')));
}
/* GLB export: triangle arrays -> accessors, material-unlit vertex colour bake -> embedded PNGs.
   Textures are not altered so UV details remain; per-face lighting is baked into COLOR_0.
   Appearance equivalence across viewers is approximate, since their colour management differs. */
async function buildGLB(){
 const source=B.getSource(),external=B.getSourceGeometry();
 if(!source||!external)throw Error('No source model is loaded.');
 const visible=external.groups.filter(g=>B.isVisible(g.partId)),thick=geometry&&$('shellVisible').checked?geometry.groups.filter(g=>B.isVisible(g.partId)):[];
 const groups=[...visible.map(g=>({...g,type:'original'})),...thick.map(g=>({...g,type:'thickness'}))];
 if(!groups.length)throw Error('No visible mesh geometry to export.');
 const vertCount=groups.reduce((n,g)=>n+g.vertex.length/11,0);
 if(vertCount>1400000)throw Error('Export would contain '+fmt(vertCount)+' vertices. Hide unwanted groups or reduce model detail (limit 1.4 million vertices).');
 const doc={asset:{version:'2.0',generator:'Voxel Lab Thickness Lab beta',extras:{voxelLabAppearance:settings()}},scene:0,
 scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[],
 images:[],samplers:[],textures:[],extensionsUsed:['KHR_materials_unlit'],extensionsRequired:['KHR_materials_unlit']};
 let chunks=[],offset=0;
 function bytes(data){
  const arr=data instanceof Uint8Array?data:new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
  const padding=(4-(offset%4))%4;if(padding){chunks.push(new Uint8Array(padding));offset+=padding;}
  const start=offset;chunks.push(arr);offset+=arr.byteLength;
  const index=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:start,byteLength:arr.byteLength});
  return index;
 }
 function accessor(arr,type,components,componentType=5126,normalised=false){
  const view=bytes(arr),count=arr.length/components;
  const obj={bufferView:view,componentType,count,type};
  if(normalised)obj.normalized=true;
  if(type==='VEC3'&&componentType===5126){
   const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
   if(components===3){for(let i=0;i<arr.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],arr[i+k]);max[k]=Math.max(max[k],arr[i+k]);}
    obj.min=min;obj.max=max;}
  }
  const index=doc.accessors.length;doc.accessors.push(obj);return index;
 }
 const texMap=new Map(),alphaTexture=new Map();
 for(const g of groups)if(g.texId&&!texMap.has(g.texId)){
  const tex=source.textures?.[g.texId-1];if(!tex)continue;
  const png=await texturePNG(tex),view=bytes(png),imgIndex=doc.images.length;
  doc.images.push({bufferView:view,mimeType:'image/png',name:tex.label||'Texture'});
  const sampler=doc.samplers.length;doc.samplers.push({magFilter:9729,minFilter:9729,
   wrapS:tex.wrapS??10497,wrapT:tex.wrapT??10497});
  const ti=doc.textures.length;doc.textures.push({sampler,source:imgIndex});texMap.set(g.texId,ti);
  let transparent=false;for(let i=3;i<tex.pixels.length;i+=4)if(tex.pixels[i]<250){transparent=true;break;}
  alphaTexture.set(g.texId,transparent);
 }
 const light=B.getLighting(),sun=unit([.48,.84,.49]),glassStrength=B.getGlassStrength();
 for(const g of groups){
  const a=g.vertex,count=a.length/11;
  if(count<3)continue;
  const pos=new Float32Array(count*3),normals=new Float32Array(count*3),colour=new Float32Array(count*3),uv=new Float32Array(count*2);
  for(let j=0;j<count;j++){
   const o=j*11,k=j*3,normal=unit([a[o+3],a[o+4],a[o+5]]);
   pos[k]=a[o];pos[k+1]=a[o+1];pos[k+2]=a[o+2];
   normals.set(normal,k);
   const shade=(light.ambient+light.sun*Math.max(0,dot(normal,sun)))*light.exposure;
   colour[k]=srgbToLinear(a[o+6]*shade);colour[k+1]=srgbToLinear(a[o+7]*shade);colour[k+2]=srgbToLinear(a[o+8]*shade);
   uv[j*2]=a[o+9];uv[j*2+1]=1-a[o+10];
  }
  const p=accessor(pos,'VEC3',3),n=accessor(normals,'VEC3',3),c=accessor(colour,'VEC3',3),t=accessor(uv,'VEC2',2);
  const alpha=clamp((g.alpha??1)*(g.glass?glassStrength:1),0,1),usesAlpha=alpha<.999||alphaTexture.get(g.texId)===true;
  const pbr={baseColorFactor:[1,1,1,alpha],metallicFactor:0,roughnessFactor:1};
  if(texMap.has(g.texId))pbr.baseColorTexture={index:texMap.get(g.texId)};
  const material=doc.materials.length;
  doc.materials.push({name:(g.type==='original'?'Exterior ':'Thickness ')+String(g.partId),pbrMetallicRoughness:pbr,
   alphaMode:usesAlpha?'BLEND':'OPAQUE',doubleSided:true,extensions:{KHR_materials_unlit:{}}});
  const model=doc.meshes.length;doc.meshes.push({primitives:[{attributes:{POSITION:p,NORMAL:n,COLOR_0:c,TEXCOORD_0:t},material,mode:4}],name:'Part '+g.partId+' '+g.type});
  const node=doc.nodes.length;doc.nodes.push({mesh:model,name:'Part '+g.partId+' '+g.type});doc.scenes[0].nodes.push(node);
 }
 doc.buffers=[{byteLength:offset}];
 const utf8=new TextEncoder(),jsonBytes=utf8.encode(JSON.stringify(doc));
 const jsonPad=(4-jsonBytes.length%4)%4,binPad=(4-offset%4)%4,total=12+8+jsonBytes.length+jsonPad+8+offset+binPad;
 const out=new Uint8Array(total),view=new DataView(out.buffer);
 view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,total,true);
 view.setUint32(12,jsonBytes.length+jsonPad,true);view.setUint32(16,0x4e4f534a,true);
 out.set(jsonBytes,20);out.fill(32,20+jsonBytes.length,20+jsonBytes.length+jsonPad);
 const binStart=20+jsonBytes.length+jsonPad;view.setUint32(binStart,offset+binPad,true);view.setUint32(binStart+4,0x004e4942,true);
 let cursor=binStart+8;for(const chunk of chunks){out.set(chunk,cursor);cursor+=chunk.length;}
 return{blob:new Blob([out],{type:'model/gltf-binary'}),vertices:vertCount,materials:doc.materials.length};
}
async function exportLook(){
 if(exporting)return;exporting=true;$('exportLookGLB').disabled=true;$('exportLookInfo').textContent='Encoding textures and baked appearance into GLB…';
 try{
  const g=await buildGLB();download(filename()+' - Appearance.glb',g.blob);
  $('exportLookInfo').textContent='GLB exported: '+fmt(g.vertices)+' vertices · '+g.materials+' materials. Lighting is baked, glass opacity included. Compare against the reference PNG in the target app.';
  B.status('Appearance GLB ready.','success');
 }catch(e){$('exportLookInfo').textContent='Export failed: '+e.message;B.status('GLB export error: '+e.message,'error');console.error(e);}
 finally{exporting=false;$('exportLookGLB').disabled=false;}
}
$('thickDirection').addEventListener('change',()=>{$('thickPointBox').classList.toggle('hidden',$('thickDirection').value!=='point');});
$('thickCentre').onclick=()=>{const bounds=B.getRawBounds();if(!bounds)return;$('thickPointX').value=0;$('thickPointY').value=(bounds.size[1]*B.getScale()/2).toFixed(3);$('thickPointZ').value=0;};
$('buildThickness').onclick=build;
$('clearThickness').onclick=reset;
$('exportLookGLB').onclick=exportLook;
$('exportSettings').onclick=saveSettings;
$('exportReference').onclick=saveReference;
window.ThicknessLab={reset,draw,softwareMeshes,buildGeometry,buildGLB};
})();