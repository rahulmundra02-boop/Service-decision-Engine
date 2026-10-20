import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const defaultCorners=(w,h)=>[{x:w*.035,y:h*.035},{x:w*.965,y:h*.035},{x:w*.965,y:h*.965},{x:w*.035,y:h*.965}];

function autoCorners(image){
  const w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;
  const scale=Math.min(1,700/Math.max(w,h)),sw=Math.max(1,Math.round(w*scale)),sh=Math.max(1,Math.round(h*scale));
  const canvas=document.createElement("canvas");canvas.width=sw;canvas.height=sh;
  const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)return defaultCorners(w,h);
  ctx.drawImage(image,0,0,sw,sh);
  const data=ctx.getImageData(0,0,sw,sh).data;
  const pixel=(x,y)=>{const i=(clamp(y,0,sh-1)*sw+clamp(x,0,sw-1))*4;return [data[i],data[i+1],data[i+2]];};
  const border=[];
  const stride=Math.max(1,Math.floor(Math.min(sw,sh)/160));
  for(let x=0;x<sw;x+=stride){border.push(pixel(x,0),pixel(x,Math.min(sh-1,2)),pixel(x,sh-1),pixel(x,Math.max(0,sh-3)));}
  for(let y=0;y<sh;y+=stride){border.push(pixel(0,y),pixel(Math.min(sw-1,2),y),pixel(sw-1,y),pixel(Math.max(0,sw-3),y));}
  const median=arr=>{arr.sort((a,b)=>a-b);return arr[Math.floor(arr.length/2)]||0;};
  const bg=[0,1,2].map(k=>median(border.map(p=>p[k])));
  const distances=border.map(p=>Math.sqrt((p[0]-bg[0])**2+(p[1]-bg[1])**2+(p[2]-bg[2])**2));
  const noise=median(distances),threshold=clamp(noise*2.8+15,22,62);
  const total=sw*sh,mask=new Uint8Array(total),visited=new Uint8Array(total);
  let foreground=0;
  for(let y=1;y<sh-1;y++)for(let x=1;x<sw-1;x++){
    const i=(y*sw+x)*4,dr=data[i]-bg[0],dg=data[i+1]-bg[1],db=data[i+2]-bg[2];
    const distance=Math.sqrt(dr*dr+dg*dg+db*db);
    if(distance>threshold){mask[y*sw+x]=1;foreground++;}
  }
  // Find the largest connected foreground object. This avoids selecting text,
  // shadows or isolated background texture as document corners.
  let best=null,bestCount=0;
  if(foreground>total*.025){
    const queue=new Int32Array(total);
    for(let idx=0;idx<total;idx++){
      if(!mask[idx]||visited[idx])continue;
      let head=0,tail=0,minX=sw,minY=sh,maxX=0,maxY=0,count=0;
      queue[tail++]=idx;visited[idx]=1;
      while(head<tail){
        const p=queue[head++],x=p%sw,y=(p/sw)|0;count++;
        if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
        let n;
        if(x>0){n=p-1;if(!visited[n]&&mask[n]){visited[n]=1;queue[tail++]=n;}}
        if(x+1<sw){n=p+1;if(!visited[n]&&mask[n]){visited[n]=1;queue[tail++]=n;}}
        if(y>0){n=p-sw;if(!visited[n]&&mask[n]){visited[n]=1;queue[tail++]=n;}}
        if(y+1<sh){n=p+sw;if(!visited[n]&&mask[n]){visited[n]=1;queue[tail++]=n;}}
      }
      if(count>bestCount){bestCount=count;best={minX,minY,maxX,maxY,count};}
    }
  }
  if(best&&best.count>total*.035&&(best.maxX-best.minX)>sw*.22&&(best.maxY-best.minY)>sh*.22){
    // Use the component's diagonal extremes for a perspective-aware four-corner estimate.
    let tl=null,tr=null,br=null,bl=null,tlScore=Infinity,trScore=-Infinity,brScore=-Infinity,blScore=Infinity;
    for(let y=best.minY;y<=best.maxY;y++)for(let x=best.minX;x<=best.maxX;x++){
      if(!mask[y*sw+x])continue;
      const sum=x+y,diff=x-y;
      if(sum<tlScore){tlScore=sum;tl={x,y};}
      if(diff>trScore){trScore=diff;tr={x,y};}
      if(sum>brScore){brScore=sum;br={x,y};}
      if(diff<blScore){blScore=diff;bl={x,y};}
    }
    const points=[tl,tr,br,bl];
    if(points.every(Boolean)){
      const corners=points.map(p=>({x:clamp(p.x/scale,0,w),y:clamp(p.y/scale,0,h)}));
      const area=Math.abs((corners[1].x-corners[0].x)*(corners[3].y-corners[0].y)-(corners[3].x-corners[0].x)*(corners[1].y-corners[0].y));
      if(area>w*h*.04)return corners;
    }
  }
  // Fallback for documents whose colour is too close to the surrounding surface.
  const lum=(x,y)=>{const i=(clamp(y,0,sh-1)*sw+clamp(x,0,sw-1))*4;return .299*data[i]+.587*data[i+1]+.114*data[i+2];};
  const step=Math.max(1,Math.floor(Math.min(sw,sh)/500)),points=[];
  for(let y=2;y<sh-2;y+=step)for(let x=2;x<sw-2;x+=step){
    const gx=Math.abs(lum(x+step,y)-lum(x-step,y)),gy=Math.abs(lum(x,y+step)-lum(x,y-step));
    if(gx+gy>34)points.push({x,y,score:gx+gy});
  }
  if(points.length<20)return defaultCorners(w,h);
  const cx=points.reduce((s,p)=>s+p.x,0)/points.length,cy=points.reduce((s,p)=>s+p.y,0)/points.length;
  const pick=(scoreFn)=>{let chosen=null,score=-Infinity;for(const p of points){const v=scoreFn(p);if(v>score){score=v;chosen=p;}}return chosen;};
  const fallback=[
    pick(p=>-(p.x+p.y)-Math.hypot(p.x-cx,p.y-cy)*.08),
    pick(p=>(p.x-p.y)-Math.hypot(p.x-cx,p.y-cy)*.08),
    pick(p=>(p.x+p.y)-Math.hypot(p.x-cx,p.y-cy)*.08),
    pick(p=>(p.y-p.x)-Math.hypot(p.x-cx,p.y-cy)*.08)
  ];
  if(fallback.some(p=>!p))return defaultCorners(w,h);
  return fallback.map(p=>({x:clamp(p.x/scale,0,w),y:clamp(p.y/scale,0,h)}));
}
function solve(a,b){const n=b.length,m=a.map((r,i)=>r.concat(b[i]));for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(m[r][c])>Math.abs(m[p][c]))p=r;if(Math.abs(m[p][c])<1e-10)return null;[m[c],m[p]]=[m[p],m[c]];let v=m[c][c];for(let j=c;j<=n;j++)m[c][j]/=v;for(let r=0;r<n;r++)if(r!==c){v=m[r][c];for(let j=c;j<=n;j++)m[r][j]-=v*m[c][j];}}return m.map(r=>r[n]);}
async function scanImage(file,corners,filter,sizeScale=1){
  const sourceUrl=URL.createObjectURL(file),img=new Image();
  try{
    await new Promise((ok,bad)=>{img.onload=ok;img.onerror=()=>bad(new Error("The selected image could not be opened."));img.src=sourceUrl;});
    const originalPts=corners||autoCorners(img),sourceScale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));
    const src=document.createElement("canvas");src.width=Math.max(1,Math.round(img.naturalWidth*sourceScale));src.height=Math.max(1,Math.round(img.naturalHeight*sourceScale));
    const sourceCtx=src.getContext("2d",{willReadFrequently:true});if(!sourceCtx)throw new Error("Your browser could not allocate image-processing memory.");
    sourceCtx.drawImage(img,0,0,src.width,src.height);
    const sd=sourceCtx.getImageData(0,0,src.width,src.height).data,pts=originalPts.map(p=>({x:p.x*sourceScale,y:p.y*sourceScale})),[tl,tr,br,bl]=pts;
    let w=Math.round(Math.max(Math.hypot(tr.x-tl.x,tr.y-tl.y),Math.hypot(br.x-bl.x,br.y-bl.y))),h=Math.round(Math.max(Math.hypot(bl.x-tl.x,bl.y-tl.y),Math.hypot(br.x-tr.x,br.y-tr.y)));
    w=Math.max(300,w);h=Math.max(300,h);const capScale=Math.min(1,2200/Math.max(w,h));w=Math.max(1,Math.round(w*capScale*sizeScale));h=Math.max(1,Math.round(h*capScale*sizeScale));
    const target=[{x:0,y:0},{x:w-1,y:0},{x:w-1,y:h-1},{x:0,y:h-1}],a=[],b=[];
    pts.forEach((p,i)=>{const X=target[i].x,Y=target[i].y;a.push([X,Y,1,0,0,0,-p.x*X,-p.x*Y],[0,0,0,X,Y,1,-p.y*X,-p.y*Y]);b.push(p.x,p.y);});
    const H=solve(a,b),out=document.createElement("canvas");out.width=w;out.height=h;const ctx=out.getContext("2d",{willReadFrequently:true});if(!ctx)throw new Error("Your browser could not allocate output-image memory.");
    const frame=ctx.createImageData(w,h),dd=frame.data,sw=src.width,sh=src.height;
    if(H){for(let y=0;y<h;y++)for(let x=0;x<w;x++){const den=H[6]*x+H[7]*y+1,sx=(H[0]*x+H[1]*y+H[2])/den,sy=(H[3]*x+H[4]*y+H[5])/den,i=(y*w+x)*4;if(sx<0||sy<0||sx>=sw-1||sy>=sh-1){dd[i]=dd[i+1]=dd[i+2]=255;dd[i+3]=255;continue;}const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0,k=(y0*sw+x0)*4;for(let z=0;z<3;z++)dd[i+z]=sd[k+z]*(1-fx)*(1-fy)+sd[k+4+z]*fx*(1-fy)+sd[k+sw*4+z]*(1-fx)*fy+sd[k+sw*4+4+z]*fx*fy;dd[i+3]=255;}ctx.putImageData(frame,0,0);}else ctx.drawImage(img,0,0,w,h);
    if(filter!=="original"){const f=ctx.getImageData(0,0,w,h),d=f.data;for(let i=0;i<d.length;i+=4){if(filter==="magic"){const r=d[i],g=d[i+1],b=d[i+2],lum=.299*r+.587*g+.114*b;const contrast=1.16,bright=5,saturation=1.32;d[i]=clamp((lum+(r-lum)*saturation-128)*contrast+128+bright,0,255);d[i+1]=clamp((lum+(g-lum)*saturation-128)*contrast+128+bright,0,255);d[i+2]=clamp((lum+(b-lum)*saturation-128)*contrast+128+bright,0,255);}else{const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];const v=clamp((g-128)*(filter==="bright"?1.25:1.12)+(filter==="bright"?153:142),0,255);d[i]=d[i+1]=d[i+2]=v;}}ctx.putImageData(f,0,0);}
    const blob=await new Promise(resolve=>out.toBlob(resolve,"image/jpeg",.94));if(!blob)throw new Error("The browser could not create the output image.");
    return {blob,url:URL.createObjectURL(blob),width:w,height:h,corners:originalPts};
  }catch(e){if(e instanceof Error)throw e;throw new Error("Unexpected image-processing error.");}
  finally{URL.revokeObjectURL(sourceUrl);}
}
function crc32(bytes){let crc=-1;for(let i=0;i<bytes.length;i++){crc^=bytes[i];for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^-1)>>>0;}
async function makeZip(files){
  const enc=new TextEncoder(),local=[],central=[];let offset=0;
  const put16=(v)=>[v&255,(v>>>8)&255],put32=(v)=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
  for(const file of files){
    const name=enc.encode(file.name),data=new Uint8Array(await file.blob.arrayBuffer()),crc=crc32(data);
    const lh=new Uint8Array([...put32(0x04034b50),...put16(20),...put16(0),...put16(0),...put16(0),...put16(0),...put32(crc),...put32(data.length),...put32(data.length),...put16(name.length),...put16(0),...name]);
    local.push(lh,data);
    const ch=new Uint8Array([...put32(0x02014b50),...put16(20),...put16(20),...put16(0),...put16(0),...put16(0),...put16(0),...put32(crc),...put32(data.length),...put32(data.length),...put16(name.length),...put16(0),...put16(0),...put16(0),...put16(0),...put32(0),...put32(offset),...name]);
    central.push(ch);offset+=lh.length+data.length;
  }
  const centralSize=central.reduce((n,p)=>n+p.length,0),end=new Uint8Array([...put32(0x06054b50),...put16(0),...put16(0),...put16(files.length),...put16(files.length),...put32(centralSize),...put32(offset),...put16(0)]);
  return new Blob([...local,...central,end],{type:"application/zip"});
}

export default function DocumentScanner({onBack}){
  const [pages,setPages]=useState([]),[active,setActive]=useState(null),[filter,setFilter]=useState("magic"),[sizeScale,setSizeScale]=useState(1),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState(""),[groupCount,setGroupCount]=useState(1),[lens,setLens]=useState(null);
  const imgRef=useRef(null),lensCanvas=useRef(null),inputRef=useRef(null),cameraInputRef=useRef(null),drag=useRef(null),previewUrlRef=useRef(null);
  const current=pages.find(p=>p.id===active)||pages[0]||null;
  useEffect(()=>()=>pages.forEach(p=>{URL.revokeObjectURL(p.url);if(p.doneUrl)URL.revokeObjectURL(p.doneUrl);}),[]);
  useEffect(()=>{if(!current||current.corners||current.cropped)return;const im=new Image();im.onload=()=>setPages(old=>old.map(p=>p.id===current.id&&!p.corners?{...p,corners:autoCorners(im)}:p));im.src=current.url;},[current?.id,current?.corners,current?.cropped,current?.url]);
  useEffect(()=>{if(!lens||!current||!lensCanvas.current)return;const im=new Image();im.onload=()=>{const c=lensCanvas.current,ctx=c.getContext("2d");if(!ctx)return;ctx.clearRect(0,0,c.width,c.height);const sw=Math.min(im.naturalWidth,Math.max(70,im.naturalWidth*.13)),sh=Math.min(im.naturalHeight,Math.max(70,im.naturalHeight*.13)),zoom=Math.min(c.width/sw,c.height/sh),px=c.width/2,py=c.height/2;ctx.fillStyle="#f8fafc";ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(im,px-lens.x*zoom,py-lens.y*zoom,im.naturalWidth*zoom,im.naturalHeight*zoom);ctx.lineCap="butt";ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(8,py);ctx.lineTo(c.width-8,py);ctx.moveTo(px,8);ctx.lineTo(px,c.height-8);ctx.stroke();ctx.strokeStyle="#111827";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(8,py);ctx.lineTo(c.width-8,py);ctx.moveTo(px,8);ctx.lineTo(px,c.height-8);ctx.stroke();ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);ctx.fillStyle="#1687ff";ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=1;ctx.stroke();};im.src=current.url;},[lens,current?.id,current?.url]);
  useEffect(()=>{let cancelled=false;const timer=window.setTimeout(async()=>{if(!current)return;try{const result=await scanImage(current.file,current.corners,filter,sizeScale);if(cancelled){URL.revokeObjectURL(result.url);return;}if(previewUrlRef.current)URL.revokeObjectURL(previewUrlRef.current);previewUrlRef.current=result.url;setPreview({url:result.url,size:result.blob.size,width:result.width,height:result.height,scale:sizeScale});}catch(e){if(!cancelled)setPreview(null);}},220);return()=>{cancelled=true;window.clearTimeout(timer);};},[current?.id,current?.file,current?.corners,filter,sizeScale]);
  useEffect(()=>()=>{if(previewUrlRef.current)URL.revokeObjectURL(previewUrlRef.current);},[]);
  const add=files=>{const list=Array.from(files||[]).filter(f=>f.type.startsWith("image/"));if(!list.length){setError("No supported image was selected. Choose a JPG, PNG, or another browser-supported image.");return;}const next=list.map(f=>({id:Math.random().toString(36).slice(2)+Date.now()+Math.random(),file:f,name:f.name,url:URL.createObjectURL(f),corners:null,blob:null,doneUrl:null,group:1,cropped:false}));setPages(old=>old.concat(next));setActive(next[0].id);setError("");setMessage(list.length+" photo(s) added. Automatic corner detection is running.");};
  const patch=(id,changes)=>{const existing=pages.find(p=>p.id===id);if(changes.corners&&existing?.doneUrl)URL.revokeObjectURL(existing.doneUrl);setPages(old=>old.map(p=>p.id!==id?p:changes.corners?{...p,...changes,blob:null,doneUrl:null,cropped:false}:{...p,...changes}));};
  const processAll=async(nextFilter=filter)=>{if(!pages.length)return;setBusy(true);setError("");try{const results=[];for(const p of pages){results.push({id:p.id,...(await scanImage(p.file,p.corners,nextFilter,sizeScale))});}pages.forEach(p=>{if(p.doneUrl)URL.revokeObjectURL(p.doneUrl);});setPages(old=>old.map(p=>{const r=results.find(x=>x.id===p.id);return r?{...p,...r,doneUrl:r.url,blob:r.blob,cropped:true}:p;}));setMessage("The selected filter was applied to all "+pages.length+" photos.");}catch(e){setError("Image processing failed. Try a smaller output size or check available device memory."+(e?.message?" Details: "+e.message:""));}finally{setBusy(false);}};
  const cropOne=async(p)=>{if(!p)return;setBusy(true);setError("");try{const r=await scanImage(p.file,p.corners,filter,sizeScale);if(p.doneUrl)URL.revokeObjectURL(p.doneUrl);setPages(old=>old.map(x=>x.id===p.id?{...x,...r,doneUrl:r.url,blob:r.blob,cropped:true}:x));setMessage(p.name+" was processed successfully.");}catch(e){setError("Photo processing failed. Try a smaller output size or check available device memory."+(e?.message?" Details: "+e.message:""));}finally{setBusy(false);}};
  const move=(index,delta)=>setPages(old=>{const n=[...old],j=index+delta;if(j<0||j>=n.length)return n;[n[index],n[j]]=[n[j],n[index]];return n;});
  const remove=id=>{const p=pages.find(x=>x.id===id);if(p){URL.revokeObjectURL(p.url);if(p.doneUrl)URL.revokeObjectURL(p.doneUrl);}const n=pages.filter(x=>x.id!==id);setPages(n);if(active===id)setActive(n[0]?.id||null);};
  const download=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),4000);};
  const exportPhotos=async()=>{if(!pages.length){setError("Add at least one photo before exporting.");return;}setBusy(true);setError("");try{const ready=[];for(const p of pages){const r=await scanImage(p.file,p.corners,filter,sizeScale);ready.push({...p,...r});}setPages(old=>old.map(p=>{const r=ready.find(x=>x.id===p.id);return r?{...p,...r,doneUrl:r.url,blob:r.blob,cropped:true}:p;}));if(ready.length===1){const p=ready[0];download(p.blob,p.name.replace(/\.[^.]+$/,"")+".jpg");setMessage("Photo exported with the current size and filter settings.");}else{const files=ready.map((p,i)=>({name:String(i+1).padStart(2,"0")+"-"+p.name.replace(/\.[^.]+$/,"")+".jpg",blob:p.blob}));download(await makeZip(files),"scanned-photos.zip");setMessage("Photos exported with the current size and filter settings.");}}catch(e){setError("Photo export failed. Please try again."+(e?.message?" Details: "+e.message:""));}finally{setBusy(false);}};
  const exportPdfs=async()=>{if(!pages.length){setError("Add at least one photo before exporting.");return;}setBusy(true);setError("");try{const ready=[];for(const p of pages){const r=await scanImage(p.file,p.corners,filter,sizeScale);ready.push({...p,...r});}setPages(old=>old.map(p=>{const r=ready.find(x=>x.id===p.id);return r?{...p,...r,doneUrl:r.url,blob:r.blob,cropped:true}:p;}));const ids=[...new Set(ready.map(p=>Number(p.group)||1))].sort((x,y)=>x-y),files=[];for(const id of ids){const pdf=await PDFDocument.create();for(const p of ready.filter(x=>(Number(x.group)||1)===id)){const image=await pdf.embedJpg(await p.blob.arrayBuffer()),pw=p.width>p.height?842:595,ph=p.width>p.height?595:842,scale=Math.min(pw/image.width,ph/image.height),page=pdf.addPage([pw,ph]);page.drawImage(image,{x:(pw-image.width*scale)/2,y:(ph-image.height*scale)/2,width:image.width*scale,height:image.height*scale});}files.push({name:"scanned-document-"+id+".pdf",blob:new Blob([await pdf.save()],{type:"application/pdf"})});}if(files.length===1){download(files[0].blob,files[0].name);setMessage("PDF exported with the current size and filter settings.");}else{download(await makeZip(files),"scanned-documents.zip");setMessage("PDFs exported with the current size and filter settings.");}}catch(e){setError("PDF export failed. Please try again."+(e?.message?" Details: "+e.message:""));}finally{setBusy(false);}};
  const pointerMove=e=>{if(drag.current===null||!current||!imgRef.current)return;const r=imgRef.current.getBoundingClientRect(),i=drag.current,x=clamp((e.clientX-r.left)/r.width,0,1)*imgRef.current.naturalWidth,y=clamp((e.clientY-r.top)/r.height,0,1)*imgRef.current.naturalHeight;setPages(old=>old.map(p=>p.id!==current.id?p:{...p,corners:p.corners.map((q,j)=>j===i?{x,y}:q),blob:null,doneUrl:null,cropped:false}));setLens({x,y});};
  const pointerDown=(e,i)=>{e.preventDefault();e.stopPropagation();drag.current=i;const svg=e.currentTarget.ownerSVGElement;if(svg&&svg.setPointerCapture)svg.setPointerCapture(e.pointerId);const r=imgRef.current.getBoundingClientRect();setLens({x:clamp((e.clientX-r.left)/r.width,0,1)*imgRef.current.naturalWidth,y:clamp((e.clientY-r.top)/r.height,0,1)*imgRef.current.naturalHeight});};
  const ready=pages.length>0&&pages.every(p=>p.blob);
  return <div className="docscan"><style>{".docscan{padding:18px;max-width:1400px;margin:auto;color:var(--text-color,#1f2937)}.docscan *{box-sizing:border-box}.ds-head,.ds-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center;justify-content:space-between}.ds-card{min-width:0;padding:14px;border:1px solid #d5dde7;border-radius:12px;background:var(--panel-bg,#fff);margin-top:12px}.ds-btn{border:1px solid #cbd5e1;border-radius:9px;padding:10px 13px;background:var(--card-bg,#f8fafc);color:var(--text-color,#1f2937);font-weight:750;cursor:pointer;min-height:40px}.ds-btn:disabled{opacity:.45;cursor:not-allowed}.ds-primary{background:#1976d2;color:white;border-color:#1976d2}.ds-upload{display:block;border:2px dashed #9aabba;border-radius:12px;padding:20px;text-align:center;cursor:pointer}.ds-upload input{display:none}.ds-layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);gap:12px}.ds-preview-wrap{display:grid;grid-template-columns:minmax(0,1fr) 140px;gap:12px;align-items:start}.ds-preview{position:relative;display:block;max-width:100%;line-height:0;touch-action:none;margin:auto}.ds-preview img{display:block;width:auto;max-width:100%;max-height:65vh;height:auto;object-fit:contain;user-select:none;-webkit-user-drag:none}.ds-preview svg{position:absolute;inset:0;width:100%;height:100%;touch-action:none;overflow:visible}.ds-point-hit{fill:transparent;stroke:transparent;stroke-width:1;cursor:move;pointer-events:all;touch-action:none}.ds-point{fill:#1687ff;stroke:#fff;stroke-width:3;pointer-events:none}.ds-loupe{position:sticky;top:12px;text-align:center;font-size:11px;color:#64748b}.ds-loupe canvas{width:132px;height:132px;border:3px solid #1687ff;border-radius:50%;background:#f8fafc;box-shadow:0 2px 12px #0002}.ds-muted{font-size:12px;color:#64748b;line-height:1.45;margin:7px 0}.ds-pages{display:grid;gap:10px}.ds-page{border:1px solid #dbe2ea;border-radius:10px;padding:9px;display:grid;grid-template-columns:66px minmax(0,1fr);gap:9px;align-items:center}.ds-page.active{border:2px solid #1976d2;background:#eff6ff}.ds-page img{width:66px;height:72px;object-fit:contain;background:#f1f5f9;border-radius:5px}.ds-page-name{font-size:12px;font-weight:750;overflow-wrap:anywhere}.ds-page-name small{display:block;font-weight:500;color:#64748b;margin-top:3px}.ds-tools{display:flex;gap:5px;flex-wrap:wrap;grid-column:1/-1}.ds-tools .ds-btn{flex:1;padding:7px 9px;font-size:12px;min-height:35px}.ds-group{display:grid;grid-template-columns:minmax(0,1fr) 85px;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #e2e8f0;font-size:12px}.ds-group select,.ds-field select,.ds-field input{padding:9px;border:1px solid #cbd5e1;border-radius:8px;background:var(--card-bg,#fff);color:var(--text-color,#1f2937);max-width:100%;width:100%}.ds-field{display:grid;gap:6px;margin:12px 0}.ds-field label{font-weight:800;font-size:12px}.ds-size-preview{display:grid;gap:6px;margin-top:8px;padding:10px;border:1px solid #dbe2ea;border-radius:10px;background:var(--card-bg,#f8fafc)}.ds-preview-stage{display:flex;align-items:center;justify-content:center;min-height:180px;padding:8px;background:repeating-conic-gradient(#e5e7eb 0% 25%,#fff 0% 50%) 50%/16px 16px;border-radius:6px}.ds-size-preview img{display:block;max-width:100%;max-height:240px;height:auto;object-fit:contain;margin:auto;border-radius:6px;transition:width .12s ease}.ds-note{margin-top:10px;padding:10px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:13px;line-height:1.45}.ds-error{background:#fef2f2;color:#b91c1c}.ds-bottom-actions{display:flex;gap:9px;flex-wrap:wrap}.ds-bottom-actions .ds-btn{flex:1;min-width:180px}.ds-status{font-size:12px;color:#64748b;margin-top:8px}@media(max-width:800px){.ds-layout{grid-template-columns:1fr}.docscan{padding:10px}.ds-card{padding:11px}.ds-preview-wrap{grid-template-columns:minmax(0,1fr) 94px;gap:6px}.ds-preview img{max-height:52vh}.ds-loupe canvas{width:88px;height:88px}.ds-bottom-actions .ds-btn{min-width:calc(50% - 8px)}}@media(max-width:480px){.ds-preview-wrap{grid-template-columns:minmax(0,1fr) 78px}.ds-loupe canvas{width:72px;height:72px}.ds-btn{padding:9px 10px}.ds-tools .ds-btn{font-size:11px}.ds-page{grid-template-columns:54px minmax(0,1fr)}.ds-page img{width:54px;height:62px}}"} </style>
    <div className="ds-head"><div><h1 style={{margin:0,fontSize:27}}>Document Scanner</h1><p className="ds-muted">Better auto corners · easy drag · live zoom loupe · crop · PDF &amp; photo export</p></div><button className="ds-btn" onClick={onBack}>⌂ Home</button></div>
    <section className="ds-card"><div className="ds-actions" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10}}><label className="ds-upload"><b style={{fontSize:18}}>＋ Add multiple photos</b><p className="ds-muted">Select multiple images from your gallery or files.</p><input ref={inputRef} type="file" accept="image/*" multiple onChange={e=>{add(e.target.files);e.target.value="";}}/></label><label className="ds-upload" style={{borderStyle:"solid",borderColor:"#1976d2",background:"#eff7ff"}}><b style={{fontSize:18}}>📷 Capture from camera</b><p className="ds-muted">Open your phone camera and take a document photo.</p><input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={e=>{add(e.target.files);e.target.value="";}}/></label></div></section>
    {pages.length>0&&<div className="ds-layout">
      <section className="ds-card"><h3 style={{marginTop:0}}>Selected photo &amp; corners</h3>{current&&<><div className="ds-actions" style={{justifyContent:"flex-start",marginBottom:10}}><b style={{fontSize:12,overflowWrap:"anywhere"}}>{current.name}</b><button className="ds-btn" disabled={busy} onClick={()=>{const im=new Image();im.onload=()=>patch(current.id,{corners:autoCorners(im)});im.src=current.url;}}>Auto-detect again</button><button className="ds-btn" disabled={busy} onClick={()=>patch(current.id,{corners:defaultCorners(imgRef.current?.naturalWidth||1000,imgRef.current?.naturalHeight||1400)})}>Reset corners</button></div>
      <div className="ds-preview-wrap"><div className="ds-preview"><img key={current.doneUrl||current.url} ref={imgRef} src={current.doneUrl||current.url} alt="Selected document" draggable="false"/>{current.corners&&!current.cropped&&imgRef.current&&<svg viewBox={"0 0 "+imgRef.current.naturalWidth+" "+imgRef.current.naturalHeight} preserveAspectRatio="none" onPointerMove={pointerMove} onPointerUp={e=>{drag.current=null;setLens(null);try{e.currentTarget.releasePointerCapture(e.pointerId);}catch{}}} onPointerCancel={()=>{drag.current=null;setLens(null);}}><polygon points={current.corners.map(p=>p.x+","+p.y).join(" ")} fill="rgba(25,118,210,.14)" stroke="#1687ff" strokeWidth={Math.max(imgRef.current.naturalWidth,imgRef.current.naturalHeight)*.003}/>{current.corners.map((p,i)=><g key={i}><circle className="ds-point-hit" cx={p.x} cy={p.y} r={Math.max(imgRef.current.naturalWidth,imgRef.current.naturalHeight)*.045} onPointerDown={e=>pointerDown(e,i)}/><circle className="ds-point" cx={p.x} cy={p.y} r={Math.max(imgRef.current.naturalWidth,imgRef.current.naturalHeight)*.012}/></g>)}</svg>}</div><div className="ds-loupe"><canvas ref={lensCanvas} width="240" height="240"/><div>Live zoom loupe</div><div>Fixed centre crosshair</div></div></div>
      <p className="ds-muted">Drag a blue corner handle. The side loupe shows the exact corner centre with a thin crosshair.</p>
      <div className="ds-actions" style={{justifyContent:"flex-start"}}><button className="ds-btn ds-primary" disabled={busy} onClick={()=>cropOne(current)}>{current.cropped?"Re-crop photo":"Crop this photo"}</button></div>
      <div className="ds-field">{preview&&<div className="ds-size-preview"><b>Live output preview · target {Math.round(preview.scale*100)}%</b><div className="ds-preview-stage"><img src={preview.url} alt="Live output-size preview"/></div><div className="ds-status">Estimated file size: {preview.size<1024*1024?(preview.size/1024).toFixed(0)+" KB":(preview.size/(1024*1024)).toFixed(2)+" MB"}</div><div className="ds-status">Output resolution: {preview.width} × {preview.height} px · full size: {Math.round(preview.width/Math.max(.01,preview.scale))} × {Math.round(preview.height/Math.max(.01,preview.scale))} px</div></div>}<label>Target file size: {Math.round(sizeScale*100)}% of full-size output</label><input aria-label="Output image size" type="range" min=".2" max="1" step=".05" value={sizeScale} onChange={e=>setSizeScale(Number(e.target.value))}/><div className="ds-status">The preview keeps a readable size while output resolution and estimated file size change with the slider. JPEG quality stays high (94%). At 20%, each dimension is about one-fifth of full size (roughly 4% of the pixels).</div></div>
      </>}</section>
      {pages.length>1&&<section className="ds-card"><h3 style={{marginTop:0}}>All photos &amp; order</h3><p className="ds-muted">Use the controls below each photo to crop, remove, or reorder pages.</p><div className="ds-pages">{pages.map((p,i)=><div key={p.id} className={"ds-page "+(current?.id===p.id?"active":"")} onClick={()=>{setActive(p.id);setLens(null);}}><img src={p.doneUrl||p.url} alt="Photo thumbnail"/><div className="ds-page-name">{i+1}. {p.name}<small>{p.cropped?"Cropped / processed ✓":"Not cropped yet"} · PDF group {p.group}</small></div><div className="ds-tools"><button className="ds-btn" disabled={busy||i===0} onClick={e=>{e.stopPropagation();move(i,-1);}}>↑ Move up</button><button className="ds-btn" disabled={busy||i===pages.length-1} onClick={e=>{e.stopPropagation();move(i,1);}}>↓ Move down</button><button className="ds-btn" disabled={busy} onClick={e=>{e.stopPropagation();cropOne(p);}}>Crop</button><button className="ds-btn" disabled={busy} onClick={e=>{e.stopPropagation();remove(p.id);}}>Remove</button></div><div className="ds-group" style={{gridColumn:"1/-1"}}><label>Include in PDF group</label><select value={p.group} onClick={e=>e.stopPropagation()} onChange={e=>patch(p.id,{group:Number(e.target.value)})}>{Array.from({length:Math.max(groupCount,p.group)},(_,j)=><option key={j+1} value={j+1}>PDF {j+1}</option>)}</select></div></div>)}</div>{pages.length>1&&<div className="ds-field"><label>Number of PDF groups</label><input type="number" min="1" max="20" value={groupCount} onChange={e=>{const n=clamp(Number(e.target.value)||1,1,20);setGroupCount(n);setPages(old=>old.map(p=>p.group>n?{...p,group:1}:p));}}/></div>}<p className="ds-muted">Pages assigned to the same PDF group are combined into one PDF, in the order shown above.</p></section>}
    </div>}
    <section className="ds-card"><h3 style={{marginTop:0}}>Global filter</h3><p className="ds-muted">Choose a filter and apply it to every photo at once.</p><div className="ds-field"><label>Apply one filter to all photos</label><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="magic">Magic Color (recommended)</option><option value="bright">Bright Scan</option><option value="soft">Clean Grayscale</option><option value="original">Original colour</option></select></div><button className="ds-btn ds-primary" disabled={busy||!pages.length} onClick={()=>processAll(filter)}>{busy?"Processing photos…":"Apply filter to all photos"}</button></section>
    <section className="ds-card"><h3 style={{marginTop:0}}>Export &amp; session</h3><p className="ds-muted">One photo or PDF downloads directly. Multiple photos or PDF groups download as a ZIP.</p><div className="ds-bottom-actions"><button className="ds-btn ds-primary" disabled={busy||!ready} onClick={exportPdfs}>Download PDFs (PDF / ZIP)</button><button className="ds-btn ds-primary" disabled={busy||!ready} onClick={exportPhotos}>Download photos (JPG / ZIP)</button><button className="ds-btn" disabled={busy||!pages.length} onClick={()=>{pages.forEach(p=>{URL.revokeObjectURL(p.url);if(p.doneUrl)URL.revokeObjectURL(p.doneUrl);});setPages([]);setActive(null);setLens(null);setMessage("Session cleared. No files were saved to a server.");setError("");}}>Clear session</button></div><div className="ds-status">Export ready: {pages.filter(p=>p.blob).length} / {pages.length} photos processed. No DB, no server upload, no auto-save.</div>{message&&<div className="ds-note">{message}</div>}{error&&<div className="ds-note ds-error">{error}</div>}</section>
    {!pages.length&&<section className="ds-card" style={{textAlign:"center"}}><h3>Ready to scan</h3><p className="ds-muted">Add photos to detect corners, crop and filter images, then export them here.</p>{message&&<div className="ds-note">{message}</div>}{error&&<div className="ds-note ds-error">{error}</div>}</section>}
  </div>;
}
