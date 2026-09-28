import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable,
  SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { restoreSession, login, logout, getVehicleByRegistration, getPartRate, saveEstimate } from './src/api';
import { AGGREGATES, buildServiceItems, makeManualItem, rateForManualPart, totals } from './src/estimateLogic';

const money = n => `₹${Number(n || 0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const newEstimateNo = () => {
  const d = new Date();
  const p = n => String(n).padStart(2,'0');
  return `EST-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

function Button({title,onPress,secondary=false,disabled=false}) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.button,secondary&&styles.secondaryButton,disabled&&styles.disabled]}>
    <Text style={[styles.buttonText,secondary&&styles.secondaryText]}>{title}</Text>
  </Pressable>;
}

function Field({label,value,onChangeText,placeholder,keyboardType='default',onBlur,onSubmitEditing,returnKeyType='done'}) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={String(value??'')} onChangeText={onChangeText} onBlur={onBlur} onSubmitEditing={onSubmitEditing} returnKeyType={returnKeyType} placeholder={placeholder} keyboardType={keyboardType} autoCapitalize="characters" style={styles.input}/></View>;
}

function ItemCard({item,onChange,onDelete,onRateLookup,rateLoading=false}) {
  const set=(k,v)=>onChange({...item,[k]:v});
  const isAutomatic=Boolean(item.serviceKey);
  return <View style={styles.itemCard}>
    <View style={styles.rowBetween}>
      <View style={styles.itemHeadingRow}>
        <Text style={styles.itemTitle}>{item.type==='part'?'Part':'Labour'}</Text>
        <Text style={[styles.badge,isAutomatic?styles.autoBadge:styles.manualBadge]}>{isAutomatic?'AUTO':'MANUAL'}</Text>
      </View>
      <Pressable onPress={onDelete}><Text style={styles.delete}>Delete</Text></Pressable>
    </View>
    {item.type==='part' && <Field label="Part No." value={item.partNo} onChangeText={v=>set('partNo',v.toUpperCase())} onBlur={()=>onRateLookup(item)} placeholder="Enter part number"/>}
    <Field label="Description" value={item.description} onChangeText={v=>set('description',v)} placeholder="Description"/>
    <View style={styles.twoCol}>
      <View style={styles.col}><Field label="Qty" value={item.qty} onChangeText={v=>set('qty',v)} keyboardType="decimal-pad"/></View>
      <View style={styles.col}><Field label={item.type==='part'?'Rate (Incl. GST)':'Rate'} value={item.rate} onChangeText={v=>set('rate',v)} keyboardType="decimal-pad"/></View>
    </View>
    {item.type==='part' && <Button title={rateLoading?'Getting Historical Rate...':'Get Historical Rate'} secondary onPress={()=>onRateLookup(item)} disabled={rateLoading||!String(item.partNo||'').trim()}/>} 
    <Text style={styles.lineAmount}>Amount: {money((Number(item.qty)||0)*(Number(item.rate)||0))}</Text>
    {item.source ? <Text style={styles.source}>{item.source}</Text> : null}
  </View>;
}

function LoginScreen({onLogin}) {
  const [identifier,setIdentifier]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(!identifier.trim()||!password){Alert.alert('Login','Enter email/mobile and password.');return;}
    setBusy(true);
    try{const data=await login(identifier,password);onLogin(data.user);}catch(e){Alert.alert('Login failed',e.message);}finally{setBusy(false);}
  };
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <View style={styles.loginWrap}>
      <Text style={styles.brand}>SERVICE ESTIMATE</Text>
      <Text style={styles.sub}>Ashok Leyland • Estimate App</Text>
      <Field label="Email / Mobile" value={identifier} onChangeText={setIdentifier} placeholder="Enter login"/>
      <Field label="Password" value={password} onChangeText={setPassword} placeholder="Password"/>
      <Button title={busy?'Signing in...':'Sign In'} onPress={submit} disabled={busy}/>
    </View></KeyboardAvoidingView></SafeAreaView>;
}

function VehicleScreen({mode,onVehicle}) {
  const [reg,setReg]=useState('');
  const [busy,setBusy]=useState(false);
  const lookup=async()=>{
    if(!reg.trim()){Alert.alert('Vehicle','Enter vehicle registration number.');return;}
    setBusy(true);
    try{
      const data=await getVehicleByRegistration(reg);
      if(!data.vehicle){Alert.alert('Vehicle not found','No vehicle data found for this registration number.');return;}
      onVehicle(data);
    }catch(e){Alert.alert('Vehicle lookup failed',e.message);}finally{setBusy(false);}
  };
  return <SafeAreaView style={styles.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
    <Text style={styles.heading}>{mode==='service'?'Service Estimate':'Repair Estimate'}</Text>
    <Text style={styles.helper}>{mode==='service'?'Vehicle → Aggregate → Automatic Parts/Labour':'Vehicle → Manual Parts/Labour'}</Text>
    <Field label="Vehicle No." value={reg} onChangeText={setReg} placeholder="e.g. GJ39XX0000" onSubmitEditing={lookup} returnKeyType="search"/>
    <Button title={busy?'Loading vehicle...':'Load Vehicle'} onPress={()=>{Keyboard.dismiss();lookup();}} disabled={busy}/>
    <Text style={styles.lookupHint}>Vehicle data, service history and applicable estimate information will be loaded from the existing backend.</Text>
  </ScrollView></SafeAreaView>;
}

function EstimateScreen({mode,data,user,onBack}) {
  const vehicle=data.vehicle||{};
  const rows=data.rows||[];
  const modelRows=data.modelRows||[];
  const globalRates=data.globalPartRates||[];
  const [selected,setSelected]=useState([]);
  const [parts,setParts]=useState([]);
  const [labour,setLabour]=useState([]);
  const [saving,setSaving]=useState(false);
  const [rateLoadingId,setRateLoadingId]=useState(null);
  const [estimateNo]=useState(newEstimateNo());

  const toggleAggregate=(key)=>{
    const next=selected.includes(key)?selected.filter(x=>x!==key):[...selected,key];
    setSelected(next);
    if(mode==='service'){
      const currentManualParts=parts.filter(x=>!x.serviceKey);
      const currentManualLabour=labour.filter(x=>!x.serviceKey);
      const items=buildServiceItems(rows,modelRows,globalRates,next);
      setParts([...items.filter(x=>x.type==='part'),...currentManualParts]);
      setLabour([...items.filter(x=>x.type==='labour'),...currentManualLabour]);
    }
  };

  const updatePart=(id,item)=>setParts(list=>list.map(x=>x.id===id?item:x));
  const updateLabour=(id,item)=>setLabour(list=>list.map(x=>x.id===id?item:x));
  const addPart=()=>setParts(x=>[...x,makeManualItem('part')]);
  const addLabour=()=>setLabour(x=>[...x,makeManualItem('labour')]);
  const remove=(setter,id)=>setter(list=>list.filter(x=>x.id!==id));

  const lookupRate=async(item)=>{
    setRateLoadingId(item.id);
    try{
      const response=await getPartRate(item.partNo);
      const result=rateForManualPart(item.partNo,response);
      setParts(list=>list.map(x=>x.id===item.id?{...x,rate:result.rate,description:x.description||result.description,source:result.rate?'Historical DB (Post Warranty / Paid Order, 18% GST added)':'Manual'}:x));
      if(!result.rate) Alert.alert('Historical rate','No qualifying Post Warranty / Paid Order rate found. Enter rate manually.');
    }catch(e){Alert.alert('Rate lookup failed',e.message);}
    finally{setRateLoadingId(null);}
  };

  const save=async()=>{
    if(!vehicle.registration){Alert.alert('Estimate','Vehicle information is missing.');return;}
    setSaving(true);
    try{
      await saveEstimate({
        estimateNo, vehicleNo:vehicle.registration,
        vehicle,
        selectedServices:selected.map(k=>AGGREGATES.find(x=>x[1]===k)?.[0]).filter(Boolean),
        parts, labour
      });
      Alert.alert('Saved',`${estimateNo} saved successfully.`);
    }catch(e){Alert.alert('Save failed',e.message);}finally{setSaving(false);}
  };

  const print=async()=>{
    const allParts=parts||[];
    const allLabour=labour||[];
    const t=totals(allParts,allLabour);
    const labourSubtotal=allLabour.reduce((sum,x)=>sum+(Number(x.qty)||0)*(Number(x.rate)||0),0);
    const labourGst=labourSubtotal*0.18;
    const currentReading=latestReading(rows);
    const selectedNames=selected.map(key=>AGGREGATES.find(x=>x[1]===key)?.[0]).filter(Boolean);
    const moneyPdf=n=>`INR ${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    const esc=v=>String(v??'-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const partRows=allParts.length ? allParts.map(x=>`<tr><td>${esc(x.partNo||'-')}</td><td>${esc(x.description||'-')}</td><td class="center">${esc(x.qty||0)}</td><td class="right">${moneyPdf(x.rate)}</td><td class="right">${moneyPdf((Number(x.qty)||0)*(Number(x.rate)||0))}</td></tr>`).join('') : '<tr><td>-</td><td>No parts added</td><td class="center">-</td><td class="right">-</td><td class="right">INR 0.00</td></tr>';
    const labourRows=allLabour.length ? allLabour.map(x=>`<tr><td colspan="2">${esc(x.description||'-')}</td><td class="center">${esc(x.qty||0)}</td><td class="right">${moneyPdf(x.rate)}</td><td class="right">${moneyPdf((Number(x.qty)||0)*(Number(x.rate)||0))}</td></tr>`).join('') : '<tr><td colspan="2">No labour added</td><td class="center">-</td><td class="right">-</td><td class="right">INR 0.00</td></tr>';
    const html=`<html><head><style>
      @page{size:A4;margin:10mm}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:10px}
      .title{text-align:center;font-size:20px;font-weight:700;margin:0 0 4px}
      .workshop{text-align:center;font-size:11px;font-weight:700;margin-bottom:3px}
      .note{text-align:center;font-size:8px;color:#666;margin-bottom:8px}
      .topline{display:flex;justify-content:space-between;font-size:8px;margin-bottom:7px}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      td,th{border:1px solid #999;padding:5px;vertical-align:middle;word-wrap:break-word}
      th{font-weight:700;background:#f1f1f1}
      .info td{width:33.33%;height:28px}
      .section{font-weight:700;font-size:11px;margin:9px 0 4px}
      .services{border:1px solid #999;padding:6px;min-height:15px}
      .center{text-align:center}.right{text-align:right}
      .total{width:42%;margin-left:auto;margin-top:8px}
      .total td{padding:5px}.grand td{font-weight:700;font-size:11px}
      .sign{margin-top:22px;width:32%;margin-left:auto;text-align:center;border-top:1px solid #555;padding-top:4px}
    </style></head><body>
      <div class="title">${mode==='service'?'SERVICE ESTIMATE':'REPAIR ESTIMATE'}</div>
      <div class="workshop">Ashok Leyland • Estimate App</div>
      <div class="note">Estimate only - subject to actual inspection and applicable rates.</div>
      <div class="topline"><span>Estimate No. (Session): ${esc(estimateNo)}</span><span>Prepared: ${formatDateOnly(new Date())}</span></div>
      <table class="info"><tr>
        <td><b>Customer</b><br/>${esc(vehicle.customer_name||'-')}</td>
        <td><b>Reg. No.</b><br/>${esc(vehicle.registration||'-')}</td>
        <td><b>VIN</b><br/>${esc(vehicle.vin||'-')}</td>
      </tr><tr>
        <td><b>Model</b><br/>${esc(vehicle.model||'-')}</td>
        <td><b>Current Reading</b><br/>${esc(currentReading)}</td>
        <td><b>Sale Date</b><br/>${esc(formatDateOnly(vehicle.sale_date))}</td>
      </tr></table>
      <div class="section">Selected Aggregate Services</div>
      <div class="services">${selectedNames.length?esc(selectedNames.join(', ')):'No aggregate service selected'}</div>
      <div class="section">Parts</div>
      <table><thead><tr><th style="width:15%">Part No.</th><th style="width:43%">Description</th><th style="width:10%">Qty</th><th style="width:16%">Rate (Incl. GST)</th><th style="width:16%">Amount</th></tr></thead><tbody>${partRows}</tbody></table>
      <div class="section">Labour</div>
      <table><thead><tr><th colspan="2" style="width:58%">Description</th><th style="width:10%">Qty</th><th style="width:16%">Rate</th><th style="width:16%">Amount</th></tr></thead><tbody>${labourRows}</tbody></table>
      <table class="total"><tr><td><b>Parts Total (GST Incl.)</b></td><td class="right">${moneyPdf(t.partsTotal)}</td></tr><tr><td>Labour Subtotal</td><td class="right">${moneyPdf(labourSubtotal)}</td></tr><tr><td>GST on Labour (18%)</td><td class="right">${moneyPdf(labourGst)}</td></tr><tr class="grand"><td>Grand Total</td><td class="right">${moneyPdf(t.total)}</td></tr></table>
      <div class="sign">Authorized Signatory</div>
    </body></html>`;
    try{
      const result=await Print.printToFileAsync({html});
      if(await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri,{mimeType:'application/pdf',dialogTitle:'Share Estimate PDF'});
      else await Share.share({message:`Estimate ${estimateNo} Total ${money(t.total)}`});
    }catch(e){Alert.alert('PDF',e.message);}
  };

  const t=useMemo(()=>{
    const base=totals(parts,labour);
    const labourSubtotal=labour.reduce((sum,x)=>sum+(Number(x.qty)||0)*(Number(x.rate)||0),0);
    const labourGst=labourSubtotal*0.18;
    return {...base, partsTotal:parts.reduce((sum,x)=>sum+(Number(x.qty)||0)*(Number(x.rate)||0),0), labourSubtotal, labourGst, total:base.partsTotal+labourSubtotal+labourGst};
  },[parts,labour]);
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
      <View style={styles.rowBetween}>
        <View><Text style={styles.heading}>{mode==='service'?'Service Estimate':'Repair Estimate'}</Text><Text style={styles.muted}>{estimateNo}</Text></View>
        <Pressable onPress={onBack}><Text style={styles.back}>Vehicle</Text></Pressable>
      </View>

      <View style={styles.vehicleCard}>
        <Text style={styles.cardTitle}>Vehicle</Text>
        <Text style={styles.vehicleMain}>{vehicle.registration||'-'}</Text>
        <Text style={styles.vehicleDetail}>Customer: {vehicle.customer_name||'-'}</Text>
        <Text style={styles.vehicleDetail}>Model: {vehicle.model||'-'}</Text>
        <Text style={styles.vehicleDetail}>Engine: {vehicle.engine||'-'}</Text>
        <Text style={styles.vehicleDetail}>Chassis: {vehicle.vin||'-'}</Text>
        <Text style={styles.vehicleDetail}>Sale Date: {vehicle.sale_date||'-'}</Text>
      </View>

      {mode==='service' && <View style={styles.card}>
        <View style={styles.sectionHeader}><View><Text style={styles.cardTitle}>Select Aggregate Service</Text><Text style={styles.sectionHint}>Select one or more services. Applicable parts and labour will load automatically.</Text></View></View>
        {AGGREGATES.map(([label,key])=><Pressable key={key} onPress={()=>toggleAggregate(key)} style={[styles.aggregate,selected.includes(key)&&styles.aggregateSelected]}>
          <Text style={styles.aggregateText}>{selected.includes(key)?'✓  ':'○  '}{label}</Text>
        </Pressable>)}
      </View>}

      <View style={styles.card}>
        <View style={styles.rowBetween}><Text style={styles.cardTitle}>Parts</Text><Pressable onPress={addPart}><Text style={styles.add}>+ Add Part</Text></Pressable></View>
        {parts.map(item=><ItemCard key={item.id} item={item} onChange={x=>updatePart(item.id,x)} onDelete={()=>remove(setParts,item.id)} onRateLookup={lookupRate} rateLoading={rateLoadingId===item.id}/>)}
        {!parts.length&&<Text style={styles.empty}>No parts added.</Text>}
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}><Text style={styles.cardTitle}>Labour</Text><Pressable onPress={addLabour}><Text style={styles.add}>+ Add Labour</Text></Pressable></View>
        {labour.map(item=><ItemCard key={item.id} item={item} onChange={x=>updateLabour(item.id,x)} onDelete={()=>remove(setLabour,item.id)} onRateLookup={()=>{}}/>)}
        {!labour.length&&<Text style={styles.empty}>No labour added.</Text>}
      </View>

      <View style={styles.totalCard}><View><Text style={styles.totalLabel}>Grand Total</Text><Text style={styles.totalHint}>All rates shown inclusive of GST</Text></View><Text style={styles.total}>{money(t.total)}</Text></View>
      <Button title={saving?'Saving...':'Save Estimate'} onPress={save} disabled={saving}/>
      <Button title="Print / Share PDF" secondary onPress={print}/>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

function formatDateOnly(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value).slice(0,10);
  return d.toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'});
}

function latestReading(rows) {
  const valid=(rows||[]).filter(r=>r?.cumulative_reading!==undefined && r?.cumulative_reading!==null && String(r.cumulative_reading).trim()!=='')
    .sort((a,b)=>new Date(b.job_date||0)-new Date(a.job_date||0));
  if (!valid.length) return '-';
  return `${valid[0].cumulative_reading} ${valid[0].cumulative_unit||''}`.trim();
}

export default function App(){
  const [loading,setLoading]=useState(true);
  const [user,setUser]=useState(null);
  const [mode,setMode]=useState(null);
  const [vehicleData,setVehicleData]=useState(null);

  React.useEffect(()=>{restoreSession().then(setUser).finally(()=>setLoading(false));},[]);

  React.useEffect(()=>{
    const onBackPress=()=>{
      if(vehicleData){setVehicleData(null);return true;}
      if(mode){setMode(null);return true;}
      return false;
    };
    const subscription=BackHandler.addEventListener('hardwareBackPress',onBackPress);
    return ()=>subscription.remove();
  },[mode,vehicleData]);

  if(loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large"/><Text style={styles.muted}>Loading...</Text></View></SafeAreaView>;
  if(!user) return <LoginScreen onLogin={setUser}/>;
  if(!mode) return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.brand}>SERVICE ESTIMATE</Text><Text style={styles.sub}>Welcome {user.personName||''}</Text>
    <View style={styles.modeCard}>
      <Text style={styles.modeTitle}>Create Estimate</Text>
      <Text style={styles.modeHint}>Choose the estimate type to continue.</Text>
      <Button title="Service Estimate" onPress={()=>setMode('service')}/>
      <Button title="Repair Estimate" onPress={()=>setMode('repair')} secondary/>
    </View>
    <Button title="Logout" onPress={async()=>{await logout();setUser(null);}} secondary/>
  </ScrollView></SafeAreaView>;
  if(!vehicleData) return <VehicleScreen mode={mode} onVehicle={setVehicleData}/>;
  return <EstimateScreen mode={mode} data={vehicleData} user={user} onBack={()=>{setVehicleData(null);}}/>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f4f7f9'},container:{padding:16,paddingBottom:40},
  loginWrap:{flex:1,justifyContent:'center',padding:20},center:{flex:1,justifyContent:'center',alignItems:'center'},
  brand:{fontSize:28,fontWeight:'800',color:'#12304a',marginBottom:6},sub:{fontSize:15,color:'#607080',marginBottom:24},
  heading:{fontSize:24,fontWeight:'800',color:'#12304a'},helper:{color:'#607080',marginBottom:18,marginTop:6},
  field:{marginBottom:12},label:{fontSize:13,fontWeight:'700',color:'#425466',marginBottom:6},
  input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d6dde4',borderRadius:10,paddingHorizontal:12,paddingVertical:11,fontSize:16},
  button:{backgroundColor:'#12304a',paddingVertical:14,borderRadius:10,alignItems:'center',marginVertical:7},
  secondaryButton:{backgroundColor:'#fff',borderWidth:1,borderColor:'#12304a'},buttonText:{color:'#fff',fontSize:16,fontWeight:'800'},
  secondaryText:{color:'#12304a'},disabled:{opacity:.5},rowBetween:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  card:{backgroundColor:'#fff',borderRadius:14,padding:14,marginTop:14,shadowColor:'#000',shadowOpacity:.05,shadowRadius:8,elevation:2},
  vehicleCard:{backgroundColor:'#eaf2f7',borderRadius:14,padding:14,marginTop:14},cardTitle:{fontSize:17,fontWeight:'800',color:'#12304a',marginBottom:10},
  vehicleMain:{fontSize:20,fontWeight:'800',marginBottom:3},vehicleDetail:{marginTop:2,color:'#344554'},muted:{color:'#6b7785',marginTop:4},back:{color:'#c46b17',fontWeight:'800'},
  aggregate:{padding:13,borderWidth:1,borderColor:'#e0e5ea',borderRadius:9,marginBottom:8},aggregateSelected:{borderColor:'#12304a',backgroundColor:'#edf4f8'},
  aggregateText:{fontSize:15,fontWeight:'700',color:'#23313f'},add:{color:'#c46b17',fontWeight:'800'},empty:{color:'#8793a0',paddingVertical:8},
  itemCard:{borderTopWidth:1,borderTopColor:'#edf0f2',paddingTop:12,marginTop:12},itemTitle:{fontWeight:'800',color:'#12304a'},delete:{color:'#b3261e',fontWeight:'700'},
  twoCol:{flexDirection:'row',gap:10},col:{flex:1},lineAmount:{fontWeight:'800',marginTop:3},source:{fontSize:11,color:'#71808f',marginTop:4},
  totalCard:{backgroundColor:'#12304a',borderRadius:14,padding:18,marginTop:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  totalLabel:{color:'#fff',fontSize:16,fontWeight:'700'},total:{color:'#fff',fontSize:22,fontWeight:'900'},
  totalHint:{color:'#dbe5ec',fontSize:11,marginTop:3},sectionHint:{color:'#71808f',fontSize:12,marginTop:-6,marginBottom:10},
  sectionHeader:{marginBottom:2},itemHeadingRow:{flexDirection:'row',alignItems:'center',gap:7},
  badge:{fontSize:9,fontWeight:'900',paddingHorizontal:7,paddingVertical:3,borderRadius:10},autoBadge:{backgroundColor:'#e7f1f7',color:'#12304a'},
  manualBadge:{backgroundColor:'#fff0e2',color:'#a75b12'},modeCard:{backgroundColor:'#fff',borderRadius:16,padding:16,marginTop:18,elevation:2},
  modeTitle:{fontSize:19,fontWeight:'800',color:'#12304a'},modeHint:{fontSize:13,color:'#71808f',marginTop:-5,marginBottom:8},
  lookupHint:{fontSize:12,color:'#71808f',lineHeight:18,marginTop:8}
});
