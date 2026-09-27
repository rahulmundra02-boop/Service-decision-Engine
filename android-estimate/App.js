import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { restoreSession, login, logout, getVehicleByRegistration, getPartRate, saveEstimate } from './src/api';
import { AGGREGATES, buildServiceItems, makeManualItem, rateForManualPart, totals } from './src/estimateLogic';

const money = n => `₹${Number(n || 0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})`;
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

function Field({label,value,onChangeText,placeholder,keyboardType='default'}) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={String(value??'')} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} style={styles.input}/></View>;
}

function ItemCard({item,onChange,onDelete,onRateLookup}) {
  const set=(k,v)=>onChange({...item,[k]:v});
  return <View style={styles.itemCard}>
    <View style={styles.rowBetween}><Text style={styles.itemTitle}>{item.type==='part'?'Part':'Labour'}</Text><Pressable onPress={onDelete}><Text style={styles.delete}>Delete</Text></Pressable></View>
    {item.type==='part' && <Field label="Part No." value={item.partNo} onChangeText={v=>set('partNo',v.toUpperCase())} placeholder="Enter part number"/>}
    <Field label="Description" value={item.description} onChangeText={v=>set('description',v)} placeholder="Description"/>
    <View style={styles.twoCol}>
      <View style={styles.col}><Field label="Qty" value={item.qty} onChangeText={v=>set('qty',v)} keyboardType="decimal-pad"/></View>
      <View style={styles.col}><Field label="Rate (Incl. GST)" value={item.rate} onChangeText={v=>set('rate',v)} keyboardType="decimal-pad"/></View>
    </View>
    {item.type==='part' && <Button title="Get Historical Rate" secondary onPress={()=>onRateLookup(item)} disabled={!String(item.partNo||'').trim()}/>}
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
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.heading}>{mode==='service'?'Service Estimate':'Repair Estimate'}</Text>
    <Text style={styles.helper}>{mode==='service'?'Vehicle → Aggregate → Automatic Parts/Labour':'Vehicle → Manual Parts/Labour'}</Text>
    <Field label="Vehicle No." value={reg} onChangeText={setReg} placeholder="e.g. GJ39XX0000"/>
    <Button title={busy?'Loading vehicle...':'Load Vehicle'} onPress={lookup} disabled={busy}/>
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
  const [estimateNo]=useState(newEstimateNo());

  const toggleAggregate=(key)=>{
    const next=selected.includes(key)?selected.filter(x=>x!==key):[...selected,key];
    setSelected(next);
    if(mode==='service'){
      const items=buildServiceItems(rows,modelRows,globalRates,next);
      setParts(items.filter(x=>x.type==='part'));
      setLabour(items.filter(x=>x.type==='labour'));
    }
  };

  const updatePart=(id,item)=>setParts(list=>list.map(x=>x.id===id?item:x));
  const updateLabour=(id,item)=>setLabour(list=>list.map(x=>x.id===id?item:x));
  const addPart=()=>setParts(x=>[...x,makeManualItem('part')]);
  const addLabour=()=>setLabour(x=>[...x,makeManualItem('labour')]);
  const remove=(setter,id)=>setter(list=>list.filter(x=>x.id!==id));

  const lookupRate=async(item)=>{
    try{
      const response=await getPartRate(item.partNo);
      const result=rateForManualPart(item.partNo,response);
      setParts(list=>list.map(x=>x.id===item.id?{...x,rate:result.rate,description:x.description||result.description,source:result.rate?'Historical DB (Post Warranty / Paid Order, 18% GST added)':'Manual'}:x));
      if(!result.rate) Alert.alert('Historical rate','No qualifying Post Warranty / Paid Order rate found. Enter rate manually.');
    }catch(e){Alert.alert('Rate lookup failed',e.message);}
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
    const all=[...parts,...labour];
    const lines=all.map(x=>`<tr><td>${x.type==='part'?x.partNo:x.partNo||''}</td><td>${x.description||''}</td><td>${x.qty||0}</td><td>${Number(x.rate||0).toFixed(2)}</td><td>${(Number(x.qty)||0)*(Number(x.rate)||0).toFixed(2)}</td></tr>`).join('');
    const t=totals(parts,labour);
    const html=`<html><body style="font-family:Arial;padding:24px"><h2>Service Estimate</h2><p><b>Estimate No:</b> ${estimateNo}</p><p><b>Vehicle:</b> ${vehicle.registration||''}<br/><b>Customer:</b> ${vehicle.customer_name||''}<br/><b>Model:</b> ${vehicle.model||''}<br/><b>Chassis:</b> ${vehicle.vin||''}</p><table style="width:100%;border-collapse:collapse" border="1" cellpadding="6"><tr><th>Part/Labour</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>${lines}</table><h3>Total: ${money(t.total)}</h3></body></html>`;
    try{
      const result=await Print.printToFileAsync({html});
      if(await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri,{mimeType:'application/pdf',dialogTitle:'Share Estimate PDF'});
      else await Share.share({message:`Estimate ${estimateNo} Total ${money(t.total)}`});
    }catch(e){Alert.alert('PDF',e.message);}
  };

  const t=useMemo(()=>totals(parts,labour),[parts,labour]);
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.rowBetween}><View><Text style={styles.heading}>{mode==='service'?'Service Estimate':'Repair Estimate'}</Text><Text style={styles.muted}>{estimateNo}</Text></View><Pressable onPress={onBack}><Text style={styles.back}>Back</Text></Pressable></View>

      <View style={styles.vehicleCard}>
        <Text style={styles.cardTitle}>Vehicle</Text>
        <Text style={styles.vehicleMain}>{vehicle.registration||'-'}</Text>
        <Text>{vehicle.customer_name||'-'}</Text>
        <Text>{vehicle.model||'-'} • Chassis: {vehicle.vin||'-'}</Text>
      </View>

      {mode==='service' && <View style={styles.card}>
        <Text style={styles.cardTitle}>Select Aggregate Service</Text>
        {AGGREGATES.map(([label,key])=><Pressable key={key} onPress={()=>toggleAggregate(key)} style={[styles.aggregate,selected.includes(key)&&styles.aggregateSelected]}>
          <Text style={styles.aggregateText}>{selected.includes(key)?'✓  ':'○  '}{label}</Text>
        </Pressable>)}
      </View>}

      <View style={styles.card}>
        <View style={styles.rowBetween}><Text style={styles.cardTitle}>Parts</Text><Pressable onPress={addPart}><Text style={styles.add}>+ Add Part</Text></Pressable></View>
        {parts.map(item=><ItemCard key={item.id} item={item} onChange={x=>updatePart(item.id,x)} onDelete={()=>remove(setParts,item.id)} onRateLookup={lookupRate}/>)}
        {!parts.length&&<Text style={styles.empty}>No parts added.</Text>}
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}><Text style={styles.cardTitle}>Labour</Text><Pressable onPress={addLabour}><Text style={styles.add}>+ Add Labour</Text></Pressable></View>
        {labour.map(item=><ItemCard key={item.id} item={item} onChange={x=>updateLabour(item.id,x)} onDelete={()=>remove(setLabour,item.id)} onRateLookup={()=>{}}/>)}
        {!labour.length&&<Text style={styles.empty}>No labour added.</Text>}
      </View>

      <View style={styles.totalCard}><Text style={styles.totalLabel}>Grand Total</Text><Text style={styles.total}>{money(t.total)}</Text></View>
      <Button title={saving?'Saving...':'Save Estimate'} onPress={save} disabled={saving}/>
      <Button title="Print / Share PDF" secondary onPress={print}/>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

export default function App(){
  const [loading,setLoading]=useState(true);
  const [user,setUser]=useState(null);
  const [mode,setMode]=useState(null);
  const [vehicleData,setVehicleData]=useState(null);

  React.useEffect(()=>{restoreSession().then(setUser).finally(()=>setLoading(false));},[]);
  if(loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large"/><Text style={styles.muted}>Loading...</Text></View></SafeAreaView>;
  if(!user) return <LoginScreen onLogin={setUser}/>;
  if(!mode) return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.brand}>SERVICE ESTIMATE</Text><Text style={styles.sub}>Welcome {user.personName||''}</Text>
    <Button title="Service Estimate" onPress={()=>setMode('service')}/>
    <Button title="Repair Estimate" onPress={()=>setMode('repair')} secondary/>
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
  vehicleMain:{fontSize:20,fontWeight:'800',marginBottom:3},muted:{color:'#6b7785',marginTop:4},back:{color:'#c46b17',fontWeight:'800'},
  aggregate:{padding:13,borderWidth:1,borderColor:'#e0e5ea',borderRadius:9,marginBottom:8},aggregateSelected:{borderColor:'#12304a',backgroundColor:'#edf4f8'},
  aggregateText:{fontSize:15,fontWeight:'700',color:'#23313f'},add:{color:'#c46b17',fontWeight:'800'},empty:{color:'#8793a0',paddingVertical:8},
  itemCard:{borderTopWidth:1,borderTopColor:'#edf0f2',paddingTop:12,marginTop:12},itemTitle:{fontWeight:'800',color:'#12304a'},delete:{color:'#b3261e',fontWeight:'700'},
  twoCol:{flexDirection:'row',gap:10},col:{flex:1},lineAmount:{fontWeight:'800',marginTop:3},source:{fontSize:11,color:'#71808f',marginTop:4},
  totalCard:{backgroundColor:'#12304a',borderRadius:14,padding:18,marginTop:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  totalLabel:{color:'#fff',fontSize:16,fontWeight:'700'},total:{color:'#fff',fontSize:22,fontWeight:'900'}
});
