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
function reset(){if(mesh)B.destroy(mesh);mesh=null;geometry=null;stats=null;$('thickInfo').textContent='No thickness built. Exterior geometry is unchanged.';}
function worldVertex(source,bounds,scale,i){const p=source.positions;return[(p[i]-(bounds.min[0]+bounds.max[0])/2)*scale,(p[i+1]-bounds.min[1])*scale,(p[i+2]-(bounds.min[2]+bounds.max[2])/2)*scale];}
function triangleSoup(source){
 const a=[],sc=B.getScale(),bounds=source.rawBounds;
 for(let i=0;i<source.materials.length;i++){
  const p=[worldVertex(source,bounds,sc,i*9),worldVertex(source,bounds,sc,i*9+3),worldVertex(source,bounds,sc,i*9+6)];
  a.push({p,n:norm(...p),material:source.materials[i]});
 }
 return a;
}
function makeTree(tris){
 const centers=tris.map(t=>centre3(...t.p));
 function build(ids){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const id of ids)for(const p of tris[id].p)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
  if(ids.length<=24)return{lo,hi,ids};
  const lengths=hi.map((n,k)=>n-lo[k]),axis=lengths.indexOf(Math.max(...lengths));
  ids.sort((a,b)=>centers[a][axis]-centers[b][axis]);
  const mid=ids.length>>1;return{lo,hi,left:build(ids.slice(0,mid)),right:build(ids.slice(mid))};
 }
 return build(tris.map((_,i)=>i));
}
function rayBox(origin,dir,box,maxDist){
 let lo=0,hi=maxDist;
 for(let k=0;k<3;k++){
  if(Math.abs(dir[k])<1e-12){if(origin[k]<box.lo[k]-1e-8||origin[k]>box.hi[k]+1e-8)return false;}
  else{const a=(box.lo[k]-origin[k])/dir[k],b=(box.hi[k]-origin[k])/dir[k];lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return false;}
 }
 return true;
}
function rayTriangle(origin,dir,t){
 const [a,b,c]=t.p,e1=vecMinus(b,a),e2=vecMinus(c,a),p=cross(dir,e2),det=dot(e1,p);
 if(Math.abs(det)<1e-11)return Infinity;
 const inv=1/det,offset=vecMinus(origin,a),u=dot(offset,p)*inv;if(u<0||u>1)return Infinity;
 const q=cross(offset,e1),v=dot(dir,q)*inv;if(v<0||u+v>1)return Infinity;
 const hit=dot(e2,q)*inv;return hit>0?hit:Infinity;
}
function nearestObstacle(tree,tris,own,origin,dir,maxDepth,tolerance){
 let distance=maxDepth;const stack=[tree];
 while(stack.length){const node=stack.pop();if(!rayBox(origin,dir,node,distance))continue;
  if(node.ids){for(const idx of node.ids){
    if(idx===own||Math.abs(dot(tris[idx].n,dir))<.55)continue;
    const hit=rayTriangle(origin,dir,tris[idx]);
    if(hit>tolerance&&hit<distance)distance=hit;
  }}
  else stack.push(node.left,node.right);
 }
 return distance;
}
function buildGeometry(){
 const source=B.getSource(),bounds=B.getRawBounds();
 if(!source||!bounds)throw Error('Import a model first.');
 const amount=num('thickAmount',.2);
 if(!(amount>0&&amount<=100000))throw Error('Maximum thickness must be greater than 0 and no more than 100,000 metres.');
 const all=triangleSoup(source),scope=$('thickScope').value,selected=B.getSelected();
 if(scope==='selected'&&!selected.size)throw Error('Select a component in the list or by tapping the model first.');
 if(all.length>180000)throw Error('This beta supports up to 180,000 source triangles. Start with a smaller or simplified mesh.');
 const included=[];
 for(let i=0;i<all.length;i++){
  const mat=all[i].material,id=B.getTrianglePart(i);
  if(!B.isVisible(id))continue;
  if(scope==='selected'&&!selected.has(id))continue;
  if($('thickSkipGlass').checked&&isGlass(mat,source))continue;
  included.push({i,part:id,mat,t:all[i]});
 }
 if(!included.length)throw Error('No eligible triangles. Try Whole model or turn off the glass exclusion.');
 const stop=$('thickStop').checked;
 if(stop&&all.length>50000)throw Error('Collision stopping is limited to 50,000 source triangles in this beta. Turn off the opposing-surface option to test this larger model.');
 const tree=stop?makeTree(all):null;
 const mode=$('thickDirection').value,target=[num('thickPointX',0),num('thickPointY',1),num('thickPointZ',0)];
 const globalCenter=[0,bounds.size[1]*B.getScale()/2,0];
 const tolerance=Math.max(1e-8,Math.max(...bounds.size)*B.getScale()*0.000002),inv=1/tolerance;
 const keyFor=p=>p.map(v=>Math.round(v*inv)).join(',');
 const inner=new Map(),sides=new Map(),edges=new Map(),groupKey=(id,mat,tex)=>String(id)+'|'+String(mat)+'|'+String(tex);
 function group(map,id,mat,tex){
  const key=groupKey(id,mat,tex);
  if(!map.has(key))map.set(key,{partId:id,texId:tex,alpha:source.materialOpacities?.[mat]??1,glass:false,vertex:[]});
  return map.get(key).vertex;
 }
 function addFace(dest,p,uv,color) {
  const n=norm(...p);
  for(let i=0;i<3;i++)dest.push(...p[i],...n,...color[i],...(uv?.[i]||[0,0]));
 }
 let collisions=0,depthSum=0;
 for(const {i,part,mat,t} of included){
  const center=centre3(...t.p);
  let direction;
  if(mode==='down')direction=[0,-1,0];
  else if(mode==='point')direction=unit(vecMinus(target,center));
  else if(mode==='x+')direction=[1,0,0];
  else if(mode==='x-')direction=[-1,0,0];
  else if(mode==='z+')direction=[0,0,1];
  else if(mode==='z-')direction=[0,0,-1];
  else direction=dot(t.n,vecMinus(globalCenter,center))>=0?t.n:t.n.map(v=>-v);
  const epsilon=Math.max(tolerance*2,Math.min(0.0001,amount*.002));
  const depth=stop?nearestObstacle(tree,all,i,center,direction,amount,epsilon):amount;
  if(depth<amount-1e-5)collisions++;
  depthSum+=depth;
  const back=t.p.map(p=>p.map((v,k)=>v+direction[k]*depth));
  const colour=(source.palette?.[mat]||[.42,.79,.82]),tex=source.textureMaterials?.[mat]||0;
  const vertexColours=source.vertexColours;
  const rgb=[0,1,2].map(k=>colour.map((c,component)=>clamp(c*(vertexColours?.[(i*3+k)*3+component]??1),0,1)));
  const uvs=[0,1,2].map(k=>[source.uvs?.[i*6+k*2]||0,source.uvs?.[i*6+k*2+1]||0]);
  addFace(group(inner,part,mat,tex),[back[0],back[2],back[1]],[uvs[0],uvs[2],uvs[1]],[rgb[0],rgb[2],rgb[1]]);
  for(const [a,b] of [[0,1],[1,2],[2,0]]){
   const aa=keyFor(t.p[a]),bb=keyFor(t.p[b]);if(aa===bb)continue;
   const edgeKey=aa<bb?aa+'|'+bb:bb+'|'+aa;
   const entry=edges.get(edgeKey);
   if(entry)entry.count++;
   else edges.set(edgeKey,{count:1,p0:t.p[a],p1:t.p[b],q0:back[a],q1:back[b],id:part,mat,rgb:[rgb[a],rgb[b]]});
  }
 }
 let edgeCount=0;
 for(const edge of edges.values()){
  if(edge.count!==1)continue;edgeCount++;
  const {p0,p1,q0,q1,mat,id,rgb}=edge,out=group(sides,id,mat,0);
  addFace(out,[p0,p1,q1],null,[rgb[0],rgb[1],rgb[1]]);
  addFace(out,[p0,q1,q0],null,[rgb[0],rgb[1],rgb[0]]);
 }
 const groups=[...inner.values(),...sides.values()].filter(g=>g.vertex.length).map(g=>({...g,vertex:new Float32Array(g.vertex)}));
 return{groups,stats:{triangles:included.length,collisions,edgeCount,averageDepth:depthSum/included.length}};
}
function build(){
 const button=$('buildThickness');button.disabled=true;$('thickInfo').textContent='Constructing internal surfaces…';
 setTimeout(()=>{
  try{
   const result=buildGeometry();
   if(mesh)B.destroy(mesh);
   geometry=result;mesh=B.upload(geometry);stats=result.stats;$('shellVisible').checked=true;
   $('thickInfo').textContent=fmt(stats.triangles)+' triangles processed · '+fmt(stats.collisions)+' collision stops · '+fmt(stats.edgeCount)+' boundary edges capped · average depth '+stats.averageDepth.toFixed(3)+' m.';
   B.status('Thickness generated. Original outer geometry is unchanged.','success');
  }catch(e){$('thickInfo').textContent='Build failed: '+e.message;B.status('Thickness build failed: '+e.message,'error');}
  button.disabled=false;
 },40);
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