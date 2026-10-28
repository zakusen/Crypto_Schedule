// Original geometry generator. All vertices have actual X/Y/Z coordinates.
export const designs={
 V1:{name:'A3 Lantern',short:'八面の核と透明な肩',n:8,width:1.00,depth:.84,height:1.80,phase:Math.PI/8,table:false},
 V2:{name:'Long Prism',short:'六面の縦長カット',n:6,width:.89,depth:.81,height:2.00,phase:Math.PI/6,table:false},
 V3:{name:'Crown',short:'広い冠面と深い底',n:8,width:1.12,depth:1.02,height:1.75,phase:Math.PI/8,table:true},
 V4:{name:'Twin Crown',short:'十面の対称な二つの冠',n:10,width:1.05,depth:.94,height:1.73,phase:Math.PI/10,table:false},
 V5:{name:'Fine Rose',short:'十二面の細いベベル',n:12,width:1.00,depth:.89,height:1.84,phase:Math.PI/12,table:false}
};
const profiles=[
 [[-.36,.86],[.36,.86]],
 [[-.55,.55],[0,.98],[.55,.55]],
 [[-.62,.50],[-.23,.94],[.23,.94],[.62,.50]],
 [[-.66,.48],[-.38,.84],[0,1],[.38,.84],[.66,.48]],
 [[-.72,.42],[-.50,.70],[-.12,.98],[.12,.98],[.50,.70],[.72,.42]]
];
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const length=a=>Math.hypot(...a);
export function model(design='V1',stage=0,quality='high'){
 const d=designs[design]||designs.V1,level=Math.max(0,Math.min(4,Math.floor(stage))),n=quality==='low'?Math.min(6,d.n):d.n;
 const profile=structuredClone(profiles[quality==='low'?Math.min(1,level):level]);if(d.table)profile[profile.length-1]=[.80,.28];
 const vertices=[],faces=[],faceIds=[];
 for(const[y,r]of profile)for(let i=0;i<n;i++){const a=d.phase+i*2*Math.PI/n;vertices.push([d.width*r*Math.cos(a),d.height*y,d.depth*r*Math.sin(a)])}
 const bottom=vertices.push([0,-d.height,0])-1,top=vertices.push([0,d.table?d.height*profile.at(-1)[0]:d.height,0])-1;
 let id=0;
 function tri(a,b,c,facet){const normal=cross(sub(vertices[b],vertices[a]),sub(vertices[c],vertices[a])),center=vertices[a].map((v,k)=>(v+vertices[b][k]+vertices[c][k])/3);faces.push(dot(normal,center)>0?[a,b,c]:[a,c,b]);faceIds.push(facet)}
 for(let i=0;i<n;i++)tri(bottom,i,(i+1)%n,id++);
 for(let r=0;r<profile.length-1;r++)for(let i=0;i<n;i++){const a=r*n+i,b=r*n+(i+1)%n,c=(r+1)*n+i,e=(r+1)*n+(i+1)%n;tri(a,b,e,id);tri(a,e,c,id++);}
 const offset=(profile.length-1)*n;for(let i=0;i<n;i++)tri(top,offset+(i+1)%n,offset+i,d.table?id:id++);
 const normals=faces.map(([a,b,c])=>{const norm=cross(sub(vertices[b],vertices[a]),sub(vertices[c],vertices[a]));return norm.map(v=>v/length(norm))});
 const result={design,stage:level,quality,n,vertices,faces,faceIds,normals,facetCount:new Set(faceIds).size};result.validation=validateModel(result);return result;
}
export function validateModel(m){
 const edges=new Map();let volume=0,minArea=Infinity,minOutward=Infinity,normalError=0,convexError=0;
 for(let i=0;i<m.faces.length;i++){const[a,b,c]=m.faces[i],va=m.vertices[a],vb=m.vertices[b],vc=m.vertices[c],norm=cross(sub(vb,va),sub(vc,va));minArea=Math.min(minArea,length(norm)/2);volume+=dot(va,cross(vb,vc))/6;normalError=Math.max(normalError,Math.abs(length(m.normals[i])-1));minOutward=Math.min(minOutward,dot(norm,va));
 for(const p of m.vertices)convexError=Math.max(convexError,dot(m.normals[i],sub(p,va)));
 for(const[x,y]of [[a,b],[b,c],[c,a]]){const key=Math.min(x,y)+':'+Math.max(x,y);const v=edges.get(key)||{count:0,direction:0};v.count++;v.direction+=x<y?1:-1;edges.set(key,v)}
 }
 const incidence2=[...edges.values()].every(v=>v.count===2&&v.direction===0),euler=m.vertices.length-edges.size+m.faces.length;
 const bounds=[0,1,2].map(k=>{const v=m.vertices.map(p=>p[k]);return [Math.min(...v),Math.max(...v)]});
 return {closed:incidence2,euler,volume,minArea,minOutward,normalError,convexError,bounds,triangles:m.faces.length,vertices:m.vertices.length,edges:edges.size,valid:incidence2&&euler===2&&volume>1e-5&&minArea>1e-8&&minOutward>1e-8&&normalError<1e-8&&convexError<1e-6&&bounds.every(([lo,hi])=>hi-lo>.1)};
}
export function visibleEdges(m){
 const edges=new Map();m.faces.forEach((f,i)=>{for(let k=0;k<3;k++){const a=f[k],b=f[(k+1)%3],key=Math.min(a,b)+':'+Math.max(a,b);const e=edges.get(key)||{a,b,faces:[]};e.faces.push(i);edges.set(key,e)}});
 return [...edges.values()].filter(e=>dot(m.normals[e.faces[0]],m.normals[e.faces[1]])<.9995).map(e=>[e.a,e.b]);
}
