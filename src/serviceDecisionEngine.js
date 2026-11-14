// Single source of truth for aggregate service intervals and model exceptions.
export const DECISION_RULES={coolant:[320000,36,15],gearOil:[160000,18,6],hubGrease:[80000,12,3],axleOil:[200000,24,12],clutchOil:[80000,18,0.5],steeringOil:[160000,24,1],airFilter:[80000,12,0],fuelFilter:[80000,12,0],defFilter:[120000,18,0],apdaFilter:[200000,24,1],defInline:[80000,12,1]};
export const TIP_RULES={coolant:[5000,36],gearOil:[2000,18],hubGrease:[1500,12],axleOil:[2000,24],clutchOil:[2000,12],steeringOil:[4000,24],airFilter:[1000,12],fuelFilter:[1000,12],defFilter:[1500,18],apdaFilter:[2000,24],defInline:[1500,12]};
export const DEF_FILTER_SHORT_INTERVAL_PART_CODES=new Set(["P5106222","P5105669","XFZ01200","P5106531","P5106533","MB404129","P5105776"]);

export function resolveAggregateSchedule({key,decisionBasis="KM",base=null,records=[],isTipper=false,isCng=false,is320HP=false,isH4=false,isA4=false,isH6=false}){
 let useHours=decisionBasis==="HRS";let interval=0,months=0,dateOnly=false,resolvedBase=base;
 if(key==="engineOil"){
  if(isCng){interval=40000;months=18;}
  else if(is320HP){interval=useHours?(base?2000:500):(base?120000:40000);months=18;}
  else if(useHours){interval=isH4?(base?1500:1000):isA4?(base&&Number(base.serviceQty)>=19?1500:1000):1500;months=18;}
  else{interval=isH4?(base?80000:40000):isA4?(base&&Number(base.serviceQty)>=19?80000:40000):isH6?80000:120000;months=18;}
 }else if(key==="steeringOil"){interval=useHours?4000:160000;months=24;}
 else if(key==="clutchOil"){interval=useHours?2000:80000;months=useHours?12:18;}
 else if(key==="tippingOil"){months=12;dateOnly=true;}
 else if(key==="cngFilter"){interval=40000;months=6;}
 else if(key==="sparkPlug"){interval=20000;dateOnly=decisionBasis==="TIME_ONLY";}
 else{
  const cfg=DECISION_RULES[key];if(!cfg)return null;
  if(key==="defFilter"&&!isTipper){
   const short=records.filter(r=>DEF_FILTER_SHORT_INTERVAL_PART_CODES.has(String(r?.partCode??r?.part_code??"").toUpperCase().replace(/[^A-Z0-9]/g,""))&&Number(r?.qty??r?.quantity??0)>0&&r?.date).sort((a,b)=>new Date(b.date)-new Date(a.date));
   if(short.length){resolvedBase=short[0];interval=40000;months=6;useHours=false;}
  }
  if(!interval){
   if(is320HP&&["gearOil","axleOil","coolant","hubGrease"].includes(key)){
    const x={gearOil:{km:240000,hrs:5000,months:24},axleOil:{km:200000,hrs:2000,months:24},coolant:{km:320000,hrs:5000,months:36},hubGrease:{km:80000,hrs:1500,months:12}}[key];
    interval=useHours?x.hrs:x.km;months=x.months;
   }else{interval=useHours?(TIP_RULES[key]?.[0]||0):cfg[0];months=useHours&&TIP_RULES[key]?TIP_RULES[key][1]:cfg[1];}
  }
 }
 return{key,base:resolvedBase,interval,months,dateOnly,useHours,unit:useHours?"HRS":"KM",deviation:useHours?60:(key==="cngFilter"||key==="sparkPlug"?0:4000)};
}