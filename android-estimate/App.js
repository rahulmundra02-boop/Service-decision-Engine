import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable,
  SafeAreaView, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput, View, Image
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

function Field({label,value,onChangeText,placeholder,keyboardType='default',onBlur,onSubmitEditing,returnKeyType='done',autoComplete,secureTextEntry=false,autoCapitalize='characters'}) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      value={String(value??'')}
      onChangeText={onChangeText}
      onBlur={onBlur}
      onSubmitEditing={onSubmitEditing}
      returnKeyType={returnKeyType}
      placeholder={placeholder}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      secureTextEntry={secureTextEntry}
      autoComplete={autoComplete}
      importantForAutofill={autoComplete ? 'yes' : 'auto'}
      style={styles.input}
    />
  </View>;
}

function ItemCard({item,onChange,onDelete,onRateLookup,rateLoading=false,autoFocusPart=false,autoFocusLabour=false,scrollRef,scrollYRef,onPartNoSubmit}) {
  const set=(k,v)=>onChange({...item,[k]:v});
  const isAutomatic=Boolean(item.serviceKey);
  const partNoRef=useRef(null);
  const descriptionRef=useRef(null);
  const qtyRef=useRef(null);
  const rateRef=useRef(null);

  const ensureVisible=(inputRef)=>{
    setTimeout(()=>{
      const keyboardListener=Keyboard.addListener('keyboardDidShow',event=>{
        inputRef.current?.measure((_x,_y,_w,h,_pageX,pageY)=>{
          const keyboardTop=event.endCoordinates?.screenY || 0;
          const currentScroll=Number(scrollYRef?.current || 0);
          const target=currentScroll + pageY + h - keyboardTop + 28;
          if(target>currentScroll) scrollRef?.current?.scrollTo({y:target,animated:true});
        });
        keyboardListener.remove();
      });
    },60);
  };

  const focusQty=()=>setTimeout(()=>qtyRef.current?.focus(),60);
  const focusRate=()=>setTimeout(()=>rateRef.current?.focus(),60);

  useEffect(()=>{
    if(autoFocusPart){
      setTimeout(()=>{
        partNoRef.current?.focus();
        ensureVisible(partNoRef);
      },120);
    }
  },[autoFocusPart]);

  useEffect(()=>{
    if(autoFocusLabour){
      setTimeout(()=>{
        descriptionRef.current?.focus();
        ensureVisible(descriptionRef);
      },120);
    }
  },[autoFocusLabour]);

  const handlePartSubmit=()=>{
    if(onPartNoSubmit && !onPartNoSubmit(item)) return;
    focusQty();
  };

  return <View style={[styles.itemCard,item.type==='part'?styles.partItemCard:styles.labourItemCard]}>
    <View style={styles.rowBetween}>
      <View style={styles.itemHeadingRow}>
        <Text style={styles.itemTitle}>{item.type==='part'?'Part':'Labour'}</Text>
        <Text style={[styles.badge,isAutomatic?styles.autoBadge:styles.manualBadge]}>{isAutomatic?'AUTO':'MANUAL'}</Text>
      </View>
      <Pressable onPress={onDelete}><Text style={styles.delete}>Delete</Text></Pressable>
    </View>

    {item.type==='part' ? <View style={styles.partInfoRow}>
      <View style={styles.partNoCol}>
        <View style={styles.field}>
          <Text style={styles.label}>Part No.</Text>
          <TextInput
            ref={partNoRef}
            value={String(item.partNo??'')}
            onChangeText={v=>set('partNo',v.toUpperCase())}
            onFocus={()=>ensureVisible(partNoRef)}
            onEndEditing={()=>{ if(String(item.partNo||'').trim()) onRateLookup(item); }}
            onSubmitEditing={handlePartSubmit}
            returnKeyType="next"
            placeholder="Part No."
            maxLength={12}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />
        </View>
      </View>
      <View style={styles.descriptionCol}>
        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            ref={descriptionRef}
            value={String(item.description??'')}
            onChangeText={v=>set('description',v)}
            onFocus={()=>ensureVisible(descriptionRef)}
            onSubmitEditing={focusQty}
            returnKeyType="next"
            placeholder="Part Description"
            style={styles.input}
          />
        </View>
      </View>
    </View> : <View style={styles.field}>
      <Text style={styles.label}>Description</Text>
      <TextInput
        ref={descriptionRef}
        value={String(item.description??'')}
        onChangeText={v=>set('description',v)}
        onFocus={()=>ensureVisible(descriptionRef)}
        onSubmitEditing={focusQty}
        returnKeyType="next"
        placeholder="Labour Description"
        style={styles.input}
      />
    </View>}

    <View style={styles.twoCol}>
      <View style={styles.col}><View style={styles.field}>
        <Text style={styles.label}>Qty</Text>
        <TextInput
          ref={qtyRef}
          value={String(item.qty??'')}
          onChangeText={v=>set('qty',v)}
          onFocus={()=>ensureVisible(qtyRef)}
          keyboardType="decimal-pad"
          onSubmitEditing={focusRate}
          returnKeyType="next"
          style={styles.input}
        />
      </View></View>
      <View style={styles.col}><View style={styles.field}>
        <Text style={styles.label}>{item.type==='part'?'MRP / Rate (Incl. GST)':'Rate (Excl. GST)'}</Text>
        <TextInput
          ref={rateRef}
          value={String(item.rate??'')}
          onChangeText={v=>set('rate',v)}
          onFocus={()=>ensureVisible(rateRef)}
          keyboardType="decimal-pad"
          returnKeyType="done"
          style={styles.input}
        />
      </View></View>
    </View>
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
      <Field label="Email / Mobile" value={identifier} onChangeText={setIdentifier} placeholder="Enter login" autoComplete="username" autoCapitalize="none"/>
      <Field label="Password" value={password} onChangeText={setPassword} placeholder="Password" autoComplete="current-password" secureTextEntry autoCapitalize="none"/>
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
      if(!data.vehicle){
        onVehicle({
          success:true,
          rows:[],
          modelRows:[],
          globalPartRates:[],
          vehicle:{registration:reg,customer_name:''},
          missingVehicle:true
        });
        return;
      }
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

function EstimateScreen({mode,data,user,onBack,savedEstimate,onSaved}) {
  const vehicle=data.vehicle||{};
  const scrollRef=useRef(null);
  const scrollYRef=useRef(0);
  const rows=data.rows||[];
  const modelRows=data.modelRows||[];
  const globalRates=data.globalPartRates||[];
  const [selected,setSelected]=useState([]);
  const [parts,setParts]=useState([]);
  const [labour,setLabour]=useState([]);
  const [saving,setSaving]=useState(false);
  const [rateLoadingId,setRateLoadingId]=useState(null);
  const [estimateNo,setEstimateNo]=useState(savedEstimate?.estimateNo || newEstimateNo());
  const [customerName,setCustomerName]=useState(savedEstimate?.vehicle?.customer_name || vehicle.customer_name||'');
  const [savedRecordId,setSavedRecordId]=useState(savedEstimate?.id || null);
  const [focusPartId,setFocusPartId]=useState(null);
  const [focusLabourId,setFocusLabourId]=useState(null);

  React.useEffect(()=>{
    if(savedEstimate){
      setSelected(Array.isArray(savedEstimate.selectedServicesKeys)?savedEstimate.selectedServicesKeys:[]);
      setParts(Array.isArray(savedEstimate.parts)?savedEstimate.parts:[]);
      setLabour(Array.isArray(savedEstimate.labour)?savedEstimate.labour:[]);
    }
  },[savedEstimate?.estimateNo]);

  const toggleAggregate=(key)=>{
    const wasSelected=selected.includes(key);
    const next=wasSelected?selected.filter(x=>x!==key):[...selected,key];
    setSelected(next);
    if(mode==='service'){
      if(wasSelected){
        setParts(list=>list.filter(x=>x.serviceKey!==key));
        setLabour(list=>list.filter(x=>x.serviceKey!==key));
      }else{
        const items=buildServiceItems(rows,modelRows,globalRates,[key]);
        setParts(list=>[...items.filter(x=>x.type==='part'),...list]);
        setLabour(list=>[...items.filter(x=>x.type==='labour'),...list]);
      }
    }
  };

  const updatePart=(id,item)=>setParts(list=>list.map(x=>x.id===id?item:x));
  const updateLabour=(id,item)=>setLabour(list=>list.map(x=>x.id===id?item:x));

  const addPart=()=>{
    const item=makeManualItem('part');
    setParts(x=>[item,...x]);
    setFocusLabourId(null);
    setFocusPartId(item.id);
  };

  const addLabour=()=>{
    const item=makeManualItem('labour');
    setLabour(x=>[item,...x]);
    setFocusPartId(null);
    setFocusLabourId(item.id);
  };

  const remove=(setter,id)=>setter(list=>list.filter(x=>x.id!==id));

  const normalizePartNo=value=>String(value||'').replace(/\s+/g,'').toUpperCase();

  const validatePartNo=(item)=>{
    const code=normalizePartNo(item?.partNo);
    if(!code) return true;
    const duplicate=parts.some(x=>x.id!==item.id && normalizePartNo(x.partNo)===code);
    if(duplicate){
      Alert.alert('Duplicate Part','Same Part No. is already entered.');
      return false;
    }
    return true;
  };

  const lookupRate=async(item)=>{
    const code=String(item?.partNo||'').replace(/\s+/g,'').toUpperCase();
    if(!code) return;
    setRateLoadingId(item.id);
    try{
      const response=await getPartRate(code);
      const result=rateForManualPart(code,response);
      setParts(list=>list.map(x=>x.id===item.id?{
        ...x,
        partNo:response?.part?.partNo||code,
        rate:result.rate,
        description:x.description||result.description,
        source:result.rate?'Historical DB (Post Warranty / Paid Order, 18% GST added)':'Manual'
      }:x));
      if(!result.rate) Alert.alert('Part rate not found','Part No. is either incorrect or not available in DMS. If the Part No. is correct, enter Description and MRP manually.');
    }catch(e){Alert.alert('Rate lookup failed',e.message);}
    finally{setRateLoadingId(null);}
  };

  const duplicatePartNumbers = useMemo(()=>{
    const counts=new Map();
    for(const item of parts){
      const code=normalizePartNo(item.partNo);
      if(code) counts.set(code,(counts.get(code)||0)+1);
    }
    return [...counts.entries()].filter(([,count])=>count>1).map(([code])=>code);
  },[parts]);

  const incompleteLines = useMemo(()=>{
    if(!parts.length && !labour.length) return true;
    return duplicatePartNumbers.length>0 || [...parts,...labour].some(x =>
      !String(x.description||'').trim() ||
      Number(x.qty||0)<=0 ||
      Number(x.rate||0)<=0 ||
      (x.type==='part' && !String(x.partNo||'').trim())
    );
  },[parts,labour,duplicatePartNumbers]);

  const save=async()=>{
    if(!vehicle.registration){Alert.alert('Estimate','Vehicle information is missing.');return;}
    if(!customerName.trim()){Alert.alert('Estimate','Enter customer name before saving.');return;}
    if(duplicatePartNumbers.length){
      Alert.alert('Duplicate Part','Same Part No. is already entered. Please use a different Part No.');
      return;
    }
    if(incompleteLines){
      Alert.alert('Estimate incomplete','Complete every Part/Labour line. Part No., Description, Qty and Rate must be filled, and Qty/Rate must be greater than 0.');
      return;
    }
    setSaving(true);
    try{
      const record={
        id:savedRecordId || "local-"+Date.now()+"-"+Math.random().toString(36).slice(2,8),
        estimateNo,
        vehicleNo:String(vehicle.registration||'').replace(/\s+/g,'').toUpperCase(),
        vehicle:{...vehicle,customer_name:customerName.trim()},
        selectedServices:selected.map(k=>AGGREGATES.find(x=>x[1]===k)?.[0]).filter(Boolean),
        selectedServicesKeys:selected,
        parts, labour,
        savedAt:new Date().toISOString()
      };
      await onSaved(record);
      Alert.alert('Saved',estimateNo+' saved successfully.');
    }catch(e){Alert.alert('Save failed',e.message);}finally{setSaving(false);}
  };

    const print=async()=>{
    if(!customerName.trim()){Alert.alert('Estimate','Enter customer name before printing.');return;}
    if(incompleteLines){
      Alert.alert('Estimate incomplete','Complete every Part/Labour line before printing the PDF.');
      return;
    }
    const allParts=parts||[];
    const allLabour=labour||[];
    const t=totals(allParts,allLabour);
    const labourSubtotal=allLabour.reduce((sum,x)=>sum+(Number(x.qty)||0)*(Number(x.rate)||0),0);
    const labourGst=labourSubtotal*0.18;
    const currentReading=latestReading(rows);
    const selectedNames=selected.map(key=>AGGREGATES.find(x=>x[1]===key)?.[0]).filter(Boolean);
    const moneyPdf=n=>`INR ${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    const esc=v=>String(v??'-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const dealerName=String(user?.dealer_name||user?.dealerName||vehicle?.dealer_name||vehicle?.dealerName||'').trim();
    const signature=await AsyncStorage.getItem('estimate_user_signature');
    const partRows=allParts.map(x=>`<tr><td>${esc(x.partNo||'-')}</td><td>${esc(x.description||'-')}</td><td class="center">${esc(x.qty||0)}</td><td class="right">${moneyPdf(x.rate)}</td><td class="right">${moneyPdf((Number(x.qty)||0)*(Number(x.rate)||0))}</td></tr>`).join('');
    const labourRows=allLabour.map(x=>`<tr><td colspan="2">${esc(x.description||'-')}</td><td class="center">${esc(x.qty||0)}</td><td class="right">${moneyPdf(x.rate)}</td><td class="right">${moneyPdf((Number(x.qty)||0)*(Number(x.rate)||0))}</td></tr>`).join('');
    const infoCells=data.missingVehicle
      ? `<table class="info"><tr>
          <td><b>Customer</b><br/>${esc(customerName||'-')}</td>
          <td><b>Reg. No.</b><br/>${esc(vehicle.registration||'-')}</td>
        </tr></table>`
      : `<table class="info"><tr>
          <td><b>Customer</b><br/>${esc(customerName||'-')}</td>
          <td><b>Reg. No.</b><br/>${esc(vehicle.registration||'-')}</td>
          <td><b>VIN</b><br/>${esc(vehicle.vin||'-')}</td>
        </tr><tr>
          <td><b>Model</b><br/>${esc(vehicle.model||'-')}</td>
          <td><b>Current Reading</b><br/>${esc(currentReading)}</td>
          <td><b>Sale Date</b><br/>${esc(formatDateOnly(vehicle.sale_date))}</td>
        </tr></table>`;
    const aggregateBlock=selectedNames.length?`<div class="section">Selected Aggregate Services</div><div class="services">${esc(selectedNames.join(', '))}</div>`:'';
    const partsBlock=allParts.length?`<div class="section partsHead">Parts</div><table class="items"><thead><tr><th style="width:15%">Part No.</th><th style="width:43%">Description</th><th style="width:10%">Qty</th><th style="width:16%">Rate (Incl. GST)</th><th style="width:16%">Amount</th></tr></thead><tbody>${partRows}</tbody></table>`:'';
    const labourBlock=allLabour.length?`<div class="section labourHead">Labour</div><table class="items"><thead><tr><th colspan="2" style="width:58%">Description</th><th style="width:10%">Qty</th><th style="width:16%">Rate (Excl. GST)</th><th style="width:16%">Amount</th></tr></thead><tbody>${labourRows}</tbody></table>`:'';
    const signatureBlock=signature?`<div class="sign"><img src="${signature}" /><div>Authorized Signatory</div></div>`:'<div class="sign"><div>Authorized Signatory</div></div>';
    const html=`<html><head><style>
      @page{size:A4;margin:10mm}
      body{font-family:Arial,Helvetica,sans-serif;color:#17212b;margin:0;font-size:10px}
      .title{text-align:center;font-size:20px;font-weight:800;color:#12304a;margin:0 0 4px}
      .workshop{text-align:center;font-size:12px;font-weight:800;color:#1976d2;margin-bottom:3px}
      .note{text-align:center;font-size:8px;color:#64748b;margin-bottom:8px}
      .topline{display:flex;justify-content:space-between;font-size:8px;margin-bottom:7px}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      td,th{border:1px solid #aab4c0;padding:5px;vertical-align:middle;word-wrap:break-word}
      th{font-weight:800;background:#eaf2ff;color:#17324d}
      .info td{width:33.33%;height:28px;background:#f8fbff}
      .section{font-weight:800;font-size:11px;margin:9px 0 4px;color:#12304a}
      .partsHead{color:#1976d2}.labourHead{color:#ef7d22}
      .services{border:1px solid #aab4c0;background:#f4f9ff;padding:6px;min-height:15px;color:#17324d}
      .center{text-align:center}.right{text-align:right;white-space:nowrap}
      .items th:nth-child(4),.items th:nth-child(5),.items td:nth-child(4),.items td:nth-child(5){white-space:nowrap}
      .items td:nth-child(4),.items td:nth-child(5){font-size:11px}
      .total{width:45%;margin-left:auto;margin-top:8px}
      .total td{padding:5px}.total td:last-child{white-space:nowrap}
      .grand td{font-weight:900;font-size:15px;background:#eaf7ef}
      .sign{margin-top:20px;width:34%;margin-left:auto;text-align:center;min-height:45px}
      .sign img{max-width:120px;max-height:45px;display:block;margin:0 auto 3px}
      .disclaimer{margin-top:16px;padding:7px;border-top:1px solid #cbd5e1;font-size:8px;color:#64748b;text-align:center}
    </style></head><body>
      <div class="title">${mode==='service'?'SERVICE ESTIMATE':'REPAIR ESTIMATE'}</div>
      ${dealerName?`<div class="workshop">${esc(dealerName)}</div>`:''}
      <div class="note">This is an approximate estimate. The actual amount may vary depending on actual work, parts used and applicable rates.</div>
      <div class="topline"><span>Estimate No. (Session): ${esc(estimateNo)}</span><span>Prepared: ${formatDateOnly(new Date())}</span></div>
      ${infoCells}
      ${aggregateBlock}
      ${partsBlock}
      ${labourBlock}
      <table class="total"><tr><td><b>Parts Total (GST Incl.)</b></td><td class="right">${moneyPdf(t.partsTotal)}</td></tr><tr><td>Labour Subtotal</td><td class="right">${moneyPdf(labourSubtotal)}</td></tr><tr><td>GST on Labour (18%)</td><td class="right">${moneyPdf(labourGst)}</td></tr><tr class="grand"><td>Grand Total</td><td class="right">${moneyPdf(t.total)}</td></tr></table>
      ${signatureBlock}
      <div class="disclaimer">Approximate estimate only; final billing may change after inspection and actual parts/labour used.</div>
    </body></html>`;    try{
      const result=await Print.printToFileAsync({html});
      if(await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri,{mimeType:'application/pdf',dialogTitle:'Share Estimate PDF'});
      else await Share.share({message:`Estimate ${estimateNo} Total ${money(t.total)}`});
    }catch(e){Alert.alert('PDF',e.message);}
  };

  const t=useMemo(()=>totals(parts,labour),[parts,labour]);
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={{flex:1}} behavior="height" keyboardVerticalOffset={0}>
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="none"
      onScroll={e=>{scrollYRef.current=e.nativeEvent.contentOffset.y;}}
      scrollEventThrottle={16}
      contentContainerStyle={[styles.container,{paddingBottom:360}]}
    >
      <View style={styles.rowBetween}>
        <View><Text style={styles.heading}>{mode==='service'?'Service Estimate':'Repair Estimate'}</Text><Text style={styles.muted}>{estimateNo}</Text></View>
        <Pressable onPress={onBack}><Text style={styles.back}>Vehicle</Text></Pressable>
      </View>

      <View style={styles.vehicleCard}>
        <Text style={styles.cardTitle}>Vehicle</Text>
        <Text style={styles.vehicleMain}>{vehicle.registration||'-'}</Text>
        {data.missingVehicle ? <View style={styles.manualCustomerBox}>
        <Text style={styles.manualCustomerTitle}>Customer Name</Text>
        <TextInput value={customerName} onChangeText={setCustomerName} placeholder="Enter customer name" autoCapitalize="words" style={styles.input}/>
        <Text style={styles.manualCustomerHint}>Vehicle number is already captured. Only customer name is required manually because this vehicle is not available in the database.</Text>
      </View> : <Text style={styles.vehicleDetail}>Customer: {vehicle.customer_name||'-'}</Text>}
        <Text style={styles.vehicleDetail}>Model: {vehicle.model||'-'}</Text>
        <Text style={styles.vehicleDetail}>Engine: {vehicle.engine||'-'}</Text>
        <Text style={styles.vehicleDetail}>Chassis: {vehicle.vin||'-'}</Text>
        <Text style={styles.vehicleDetail}>Sale Date: {formatDateOnly(vehicle.sale_date)}</Text>
      </View>

      {mode==='service' && <View style={styles.card}>
        <View style={styles.sectionHeader}><View><Text style={styles.cardTitle}>Select Aggregate Service</Text><Text style={styles.sectionHint}>Select one or more services. Applicable parts and labour will load automatically.</Text></View></View>
        {AGGREGATES.map(([label,key])=><Pressable key={key} onPress={()=>toggleAggregate(key)} style={[styles.aggregate,selected.includes(key)&&styles.aggregateSelected]}>
          <Text style={styles.aggregateText}>{selected.includes(key)?'✓  ':'○  '}{label}</Text>
        </Pressable>)}
      </View>}

      <View style={[styles.card,styles.partsCard]}>
        <View style={styles.rowBetween}><Text style={styles.cardTitle}>Parts</Text><Pressable onPress={addPart}><Text style={[styles.add,styles.partAdd]}>+ Add Part</Text></Pressable></View>
        {parts.map(item=><ItemCard
          key={item.id}
          item={item}
          onChange={x=>{updatePart(item.id,x);if(focusPartId===item.id)setFocusPartId(null);}}
          onDelete={()=>remove(setParts,item.id)}
          onRateLookup={lookupRate}
          rateLoading={rateLoadingId===item.id}
          autoFocusPart={focusPartId===item.id}
          scrollRef={scrollRef}
          scrollYRef={scrollYRef}
          onPartNoSubmit={validatePartNo}
        />)}
        {!parts.length&&<Text style={styles.empty}>No parts added.</Text>}
      </View>

      <View style={[styles.card,styles.labourCard]}>
        <View style={styles.rowBetween}><Text style={styles.cardTitle}>Labour</Text><Pressable onPress={addLabour}><Text style={[styles.add,styles.labourAdd]}>+ Add Labour</Text></Pressable></View>
        {labour.map(item=><ItemCard
          key={item.id}
          item={item}
          onChange={x=>{updateLabour(item.id,x);if(focusLabourId===item.id)setFocusLabourId(null);}}
          onDelete={()=>remove(setLabour,item.id)}
          onRateLookup={()=>{}}
          autoFocusLabour={focusLabourId===item.id}
          scrollRef={scrollRef}
          scrollYRef={scrollYRef}
        />)}
        {!labour.length&&<Text style={styles.empty}>No labour added.</Text>}
      </View>

      <View style={styles.totalCard}><View><Text style={styles.totalLabel}>Grand Total</Text><Text style={styles.totalHint}>All rates shown inclusive of GST</Text></View><Text style={styles.total}>{money(t.total)}</Text></View>
      {!incompleteLines && <>
        <Button title={saving?'Saving...':'Save Estimate'} onPress={save} disabled={saving}/>
        <Button title="Print / Share PDF" secondary onPress={print}/>
      </>}
      {incompleteLines && <View style={styles.incompleteBox}>
        <Text style={styles.incompleteTitle}>Estimate output locked</Text>
        <Text style={styles.incompleteText}>Complete every line before saving or printing. Qty and Rate must be greater than 0.</Text>
      </View>}
      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerText}>Disclaimer: This estimate is prepared from the information entered and available historical rate data. Final billing is subject to actual inspection, parts availability and applicable rates.</Text>
      </View>
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

function SavedEstimatesScreen({records,onOpen,onNew,onBack}) {
  const [query,setQuery]=useState('');
  const filtered=useMemo(()=>{
    const q=String(query||'').trim().toLowerCase();
    const list=[...(records||[])].sort((a,b)=>new Date(b.savedAt||0)-new Date(a.savedAt||0));
    if(!q) return list;
    return list.filter(x=>String(x.vehicleNo||'').toLowerCase().includes(q)||String(x.estimateNo||'').toLowerCase().includes(q));
  },[records,query]);
  return <SafeAreaView style={styles.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
    <View style={styles.rowBetween}>
      <View><Text style={styles.heading}>Saved Estimates</Text><Text style={styles.muted}>Saved only on this device</Text></View>
      <Pressable onPress={onBack}><Text style={styles.back}>Home</Text></Pressable>
    </View>
    <TextInput value={query} onChangeText={setQuery} placeholder="Search Vehicle No. or Estimate No." style={styles.input}/>
    <Button title="+ New Estimate" onPress={onNew}/>
    {!filtered.length && <Text style={styles.empty}>{query?'No matching saved estimate.':'No saved estimates yet.'}</Text>}
    {filtered.map(item=><Pressable key={item.id} onPress={()=>onOpen(item)} style={styles.savedRow}>
      <View style={{flex:1}}>
        <Text style={styles.savedVehicle}>{item.vehicleNo||'-'}</Text>
        <Text style={styles.savedEstimateNo}>{item.estimateNo||'-'}</Text>
        <Text style={styles.savedDate}>{formatDateTime(item.savedAt)}</Text>
      </View>
      <Text style={styles.savedOpen}>Open</Text>
    </Pressable>)}
    <View style={styles.disclaimerBox}>
      <Text style={styles.disclaimerText}>Saved estimates are stored in this mobile app on this device. They are not uploaded to the online database.</Text>
    </View>
  </ScrollView></SafeAreaView>;
}

function SignatureScreen({signature,onSave,onBack}) {
  const [busy,setBusy]=useState(false);

  React.useEffect(()=>{
    const handleBack=()=>{
      onBack();
      return true;
    };
    const subscription=BackHandler.addEventListener('hardwareBackPress',handleBack);
    return ()=>subscription.remove();
  },[onBack]);

  const choose=async(source)=>{
    setBusy(true);
    try{
      let result;
      if(source==='camera'){
        const permission=await ImagePicker.requestCameraPermissionsAsync();
        if(!permission.granted){Alert.alert('Permission required','Camera permission is required for the signature photo.');return;}
        result=await ImagePicker.launchCameraAsync({mediaTypes:['images'],allowsEditing:true,aspect:[3,1],quality:0.8,base64:true});
      }else{
        result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[3,1],quality:0.8,base64:true});
      }
      if(!result.canceled&&result.assets?.[0]?.base64){
        const uri=`data:image/jpeg;base64,${result.assets[0].base64}`;
        await AsyncStorage.setItem('estimate_user_signature',uri);
        onSave(uri);
        Alert.alert('Signature','Signature saved. It will appear automatically on the estimate.');
      }
    }catch(e){Alert.alert('Signature',e.message);}finally{setBusy(false);}
  };
  const clear=async()=>{await AsyncStorage.removeItem('estimate_user_signature');onSave('');};
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.heading}>User Seal/Signature</Text>
    <Text style={styles.lookupHint}>Upload or click a photo of the user's signature. It will be used by default in the Authorized Signatory area.</Text>
    {signature?<View style={styles.signaturePreview}><Image source={{uri:signature}} style={styles.signatureImage}/><Text style={styles.signatureSaved}>Signature saved</Text></View>:<Text style={styles.empty}>No signature saved.</Text>}
    <Button title={busy?'Opening camera...':'Capture with Camera'} onPress={()=>choose('camera')} disabled={busy}/>
    <Button title="Upload from Gallery" secondary onPress={()=>choose('gallery')} disabled={busy}/>
    {signature?<Button title="Remove Saved Signature" secondary onPress={clear}/>:null}
  </ScrollView></SafeAreaView>;
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  return d.toLocaleString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
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
  const [signatureScreen,setSignatureScreen]=useState(false);
  const [savedScreen,setSavedScreen]=useState(false);
  const [savedEstimates,setSavedEstimates]=useState([]);
  const [editingSaved,setEditingSaved]=useState(null);
  const [signature,setSignature]=useState('');

  const savedKey = "service_estimate_saved_"+String(user?.id || user?.email || user?.personName || "default").toLowerCase();

  const loadSavedEstimates=async()=>{
    try{
      const raw=await AsyncStorage.getItem(savedKey);
      const list=raw?JSON.parse(raw):[];
      setSavedEstimates(Array.isArray(list)?list:[]);
    }catch{setSavedEstimates([]);}
  };

  const saveLocalEstimate=async(record)=>{
    const current=[...(savedEstimates||[])];
    const next=[record,...current.filter(x=>x.id!==record.id)];
    next.sort((a,b)=>new Date(b.savedAt||0)-new Date(a.savedAt||0));
    await AsyncStorage.setItem(savedKey,JSON.stringify(next));
    setSavedEstimates(next);
  };

  const openSavedEstimate=(record)=>{
    setEditingSaved({...record,id:null,estimateNo:newEstimateNo(),selectedServicesKeys:Array.isArray(record.selectedServicesKeys)?record.selectedServicesKeys:[]});
    setVehicleData({rows:[],modelRows:[],globalPartRates:[],vehicle:record.vehicle||{registration:record.vehicleNo},missingVehicle:false});
    setMode(record.mode||"repair");
    setSavedScreen(false);
  };

  React.useEffect(()=>{
    restoreSession().then(setUser).finally(()=>setLoading(false));
    AsyncStorage.getItem('estimate_user_signature').then(v=>setSignature(v||''));
  },[]);

  React.useEffect(()=>{
    if(user) loadSavedEstimates();
  },[user?.id,user?.email,user?.personName]);

  React.useEffect(()=>{
    const onBackPress=()=>{
      if(signatureScreen){setSignatureScreen(false);return true;}
      if(savedScreen){setSavedScreen(false);return true;}
      if(vehicleData){setVehicleData(null);return true;}
      if(mode){setMode(null);return true;}
      return false;
    };
    const subscription=BackHandler.addEventListener('hardwareBackPress',onBackPress);
    return ()=>subscription.remove();
  },[mode,vehicleData,signatureScreen]);

  if(loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large"/><Text style={styles.muted}>Loading...</Text></View></SafeAreaView>;
  if(!user) return <LoginScreen onLogin={setUser}/>;
  if(signatureScreen) return <SignatureScreen signature={signature} onSave={setSignature} onBack={()=>setSignatureScreen(false)}/>;
  if(savedScreen) return <SavedEstimatesScreen records={savedEstimates} onOpen={openSavedEstimate} onNew={()=>{setEditingSaved(null);setVehicleData(null);setMode('repair');setSavedScreen(false);}} onBack={()=>setSavedScreen(false)}/>;
  if(!mode) return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.brand}>SERVICE ESTIMATE</Text><Text style={styles.sub}>Welcome {user.personName||''}</Text>
    <View style={styles.modeCard}>
      <Text style={styles.modeTitle}>Create Estimate</Text>
      <Text style={styles.modeHint}>Choose the estimate type to continue.</Text>
      <Button title="Service Estimate" onPress={()=>setMode('service')}/>
      <Button title="Repair Estimate" onPress={()=>setMode('repair')} secondary/>
    </View>
    <Button title="Saved Estimates" onPress={()=>{loadSavedEstimates();setSavedScreen(true);}} secondary/>
    <Button title="User Seal/Signature" onPress={()=>setSignatureScreen(true)} secondary/>
    <Button title="Logout" onPress={async()=>{await logout();setUser(null);}} secondary/>
  </ScrollView></SafeAreaView>;
  if(!vehicleData) return <VehicleScreen mode={mode} onVehicle={data=>{setEditingSaved(null);setVehicleData(data);}}/>;
  return <EstimateScreen mode={mode} data={vehicleData} user={user} savedEstimate={editingSaved} onSaved={async record=>{await saveLocalEstimate({...record,mode});setEditingSaved(null);}} onBack={()=>{setEditingSaved(null);setVehicleData(null);}}/>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f3f6fb',paddingTop:Platform.OS==='android'?(StatusBar.currentHeight||0)+4:0},container:{padding:10,paddingBottom:28},
  loginWrap:{flex:1,justifyContent:'center',padding:14},center:{flex:1,justifyContent:'center',alignItems:'center'},
  brand:{fontSize:20,fontWeight:'800',color:'#12304a',marginBottom:4},sub:{fontSize:11,color:'#607080',marginBottom:16},
  heading:{fontSize:18,fontWeight:'800',color:'#12304a'},helper:{color:'#607080',marginBottom:12,marginTop:4,fontSize:11},
  field:{marginBottom:8},label:{fontSize:10,fontWeight:'700',color:'#425466',marginBottom:4},
  input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d6dde4',borderRadius:7,paddingHorizontal:9,paddingVertical:7,fontSize:13},
  button:{backgroundColor:'#12304a',paddingVertical:10,borderRadius:8,alignItems:'center',marginVertical:5},
  secondaryButton:{backgroundColor:'#fff',borderWidth:1,borderColor:'#12304a'},buttonText:{color:'#fff',fontSize:13,fontWeight:'800'},
  secondaryText:{color:'#12304a'},disabled:{opacity:.5},rowBetween:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  card:{backgroundColor:'#fff',borderRadius:10,padding:10,marginTop:10,shadowColor:'#000',shadowOpacity:.05,shadowRadius:6,elevation:2},
  partsCard:{borderLeftWidth:4,borderLeftColor:'#1976d2'},labourCard:{borderLeftWidth:4,borderLeftColor:'#ef7d22'},
  vehicleCard:{backgroundColor:'#e7f1fa',borderRadius:10,padding:10,marginTop:10},cardTitle:{fontSize:14,fontWeight:'800',color:'#12304a',marginBottom:7},
  vehicleMain:{fontSize:16,fontWeight:'800',marginBottom:2},vehicleDetail:{marginTop:1,color:'#344554',fontSize:11},muted:{color:'#6b7785',marginTop:3,fontSize:11},back:{color:'#c46b17',fontWeight:'800',fontSize:11},
  aggregate:{padding:9,borderWidth:1,borderColor:'#e0e5ea',borderRadius:7,marginBottom:6},aggregateSelected:{borderColor:'#1976d2',backgroundColor:'#e8f2ff'},
  aggregateText:{fontSize:12,fontWeight:'700',color:'#23313f'},add:{fontWeight:'800',fontSize:11},partAdd:{color:'#1976d2'},labourAdd:{color:'#ef7d22'},empty:{color:'#8793a0',paddingVertical:6,fontSize:11},
  itemCard:{borderRadius:8,padding:8,marginTop:8,borderWidth:1},partItemCard:{backgroundColor:'#f4f9ff',borderColor:'#cfe3fa'},labourItemCard:{backgroundColor:'#fff8f0',borderColor:'#f4d5b8'},
  itemTitle:{fontWeight:'800',color:'#12304a',fontSize:12},delete:{color:'#b3261e',fontWeight:'700',fontSize:10},
  twoCol:{flexDirection:'row',gap:7},col:{flex:1},lineAmount:{fontWeight:'900',marginTop:3,fontSize:15},source:{fontSize:9,color:'#71808f',marginTop:3},
  totalCard:{backgroundColor:'#12304a',borderRadius:10,padding:12,marginTop:10,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  totalLabel:{color:'#fff',fontSize:13,fontWeight:'700'},total:{color:'#fff',fontSize:25,fontWeight:'900'},
  totalHint:{color:'#dbe5ec',fontSize:9,marginTop:2},sectionHint:{color:'#71808f',fontSize:10,marginTop:-4,marginBottom:7},
  sectionHeader:{marginBottom:2},itemHeadingRow:{flexDirection:'row',alignItems:'center',gap:5},
  badge:{fontSize:8,fontWeight:'900',paddingHorizontal:5,paddingVertical:2,borderRadius:8},autoBadge:{backgroundColor:'#e7f1f7',color:'#12304a'},
  manualBadge:{backgroundColor:'#fff0e2',color:'#a75b12'},modeCard:{backgroundColor:'#fff',borderRadius:12,padding:11,marginTop:12,elevation:2},
  modeTitle:{fontSize:15,fontWeight:'800',color:'#12304a'},modeHint:{fontSize:10,color:'#71808f',marginTop:-4,marginBottom:6},
  lookupHint:{fontSize:10,color:'#71808f',lineHeight:15,marginTop:6},
  signaturePreview:{backgroundColor:'#fff',borderRadius:10,padding:12,marginTop:14,borderWidth:1,borderColor:'#d6dde4',alignItems:'center'},
  signatureImage:{width:'100%',height:80,resizeMode:'contain',backgroundColor:'#fff'},
  signatureSaved:{fontSize:10,color:'#2e7d32',fontWeight:'800',marginTop:5},
  manualCustomerBox:{backgroundColor:'#fff8e8',borderWidth:1,borderColor:'#f0c36b',borderRadius:8,padding:8,marginTop:6},
  manualCustomerTitle:{fontSize:11,fontWeight:'800',color:'#8a5a00',marginBottom:4},
  manualCustomerHint:{fontSize:9,color:'#8a6b2e',lineHeight:13,marginTop:4},
  incompleteBox:{backgroundColor:'#fff4e5',borderWidth:1,borderColor:'#f0b45b',borderRadius:8,padding:10,marginTop:10},
  incompleteTitle:{fontSize:12,fontWeight:'900',color:'#9a5b00'},
  incompleteText:{fontSize:10,color:'#795548',lineHeight:14,marginTop:3},
  disclaimerBox:{borderTopWidth:1,borderTopColor:'#d6dde4',paddingTop:8,marginTop:14},
  disclaimerText:{fontSize:9,color:'#71808f',lineHeight:13,textAlign:'center'},
  savedRow:{backgroundColor:'#fff',borderWidth:1,borderColor:'#d6dde4',borderRadius:9,padding:11,marginTop:8,flexDirection:'row',alignItems:'center'},
  savedVehicle:{fontSize:14,fontWeight:'900',color:'#12304a'},
  savedEstimateNo:{fontSize:11,fontWeight:'700',color:'#425466',marginTop:2},
  savedDate:{fontSize:9,color:'#71808f',marginTop:3},
  savedOpen:{fontSize:11,fontWeight:'900',color:'#1976d2',marginLeft:8}
});
