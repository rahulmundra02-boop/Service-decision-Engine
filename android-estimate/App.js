import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  Pressable,
  PanResponder,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import * as Print from 'expo-print';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import * as XLSX from 'xlsx';
import DocumentScanner from 'react-native-document-scanner-plugin';
import Svg, { Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  restoreSession,
  login,
  logout,
  getSecureSessionToken,
  getBiometricCredentials,
  getVehicleByRegistration,
  getPartRate,
  getModelList,
  getServiceDataByModel,
  syncPartsMaster,
  readPriceMaster
} from './src/api';
import {
  AGGREGATES,
  buildServiceItems,
  prebuildAllAggregates,
  makeManualItem,
  rateForManualPart,
  totals
} from './src/estimateLogic';

const RECENT_VEHICLES_KEY = 'service_estimate_recent_vehicles';

const money = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const newEstimateNo = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `EST-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value).slice(0, 16);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateOnly(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function Button({ title, onPress, secondary = false, disabled = false, icon = null, style, textStyle }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabled,
        style
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {icon ? <View style={{ marginRight: 6 }}>{icon}</View> : null}
        <Text style={[styles.buttonText, secondary && styles.secondaryText, textStyle]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  onBlur,
  onSubmitEditing,
  returnKeyType = 'done',
  autoComplete,
  secureTextEntry = false,
  autoCapitalize = 'characters'
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={String(value ?? '')}
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
        style={[styles.input, secureTextEntry && styles.passwordInput]}
        textContentType={
          Platform.OS === 'ios'
            ? autoComplete === 'username'
              ? 'username'
              : autoComplete === 'current-password'
              ? 'password'
              : undefined
            : undefined
        }
      />
    </View>
  );
}

function ItemCard({
  item,
  onChange,
  onDelete,
  onRateLookup,
  rateLoading = false,
  autoFocusPart = false,
  autoFocusLabour = false,
  scrollRef,
  scrollYRef,
  keyboardTopRef,
  onPartNoSubmit
}) {
  const set = (k, v) => onChange({ ...item, [k]: v });
  const isAutomatic = Boolean(item.serviceKey);
  const partNoRef = useRef(null);
  const descriptionRef = useRef(null);
  const qtyRef = useRef(null);
  const rateRef = useRef(null);
  const lookupTimerRef = useRef(null);
  const lastLookedUpRef = useRef(String(item.partNo || '').replace(/\s+/g, '').toUpperCase());

  const ensureVisible = (inputRef) => {
    const measureAndScroll = (keyboardTop) => {
      if (!keyboardTop) return;
      inputRef.current?.measure((_x, _y, _w, h, _pageX, pageY) => {
        const currentScroll = Number(scrollYRef?.current || 0);
        const target = currentScroll + pageY + h - keyboardTop + 28;
        if (target > currentScroll) scrollRef?.current?.scrollTo({ y: target, animated: true });
      });
    };

    setTimeout(() => {
      if (keyboardTopRef?.current) {
        measureAndScroll(keyboardTopRef.current);
        return;
      }
      const keyboardListener = Keyboard.addListener('keyboardDidShow', (event) => {
        measureAndScroll(event.endCoordinates?.screenY || 0);
        keyboardListener.remove();
      });
      setTimeout(() => {
        if (keyboardTopRef?.current) {
          measureAndScroll(keyboardTopRef.current);
          keyboardListener.remove();
        }
      }, 350);
    }, 60);
  };

  const focusQty = () => setTimeout(() => qtyRef.current?.focus(), 60);
  const focusRate = () => setTimeout(() => rateRef.current?.focus(), 60);

  useEffect(() => {
    if (autoFocusPart) {
      setTimeout(() => {
        partNoRef.current?.focus();
        ensureVisible(partNoRef);
      }, 120);
    }
  }, [autoFocusPart]);

  useEffect(() => {
    if (autoFocusLabour) {
      setTimeout(() => {
        descriptionRef.current?.focus();
        ensureVisible(descriptionRef);
      }, 120);
    }
  }, [autoFocusLabour]);

  const triggerLookup = (code) => {
    const clean = String(code || '').replace(/\s+/g, '').toUpperCase();
    if (!clean || clean.length < 4 || clean === lastLookedUpRef.current) return;
    lastLookedUpRef.current = clean;
    if (onRateLookup) {
      onRateLookup(item.id, clean);
    }
  };

  const handlePartNoChange = (val) => {
    const upper = String(val || '').toUpperCase().replace(/\s+/g, '');
    const currentCode = String(item.partNo || '').toUpperCase().replace(/\s+/g, '');
    if (upper !== currentCode) {
      onChange({
        ...item,
        partNo: upper,
        ...(item.serviceKey ? { serviceKey: null } : {})
      });
      if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
      if (upper.length >= 4) {
        lookupTimerRef.current = setTimeout(() => {
          triggerLookup(upper);
        }, 350);
      }
    } else {
      set('partNo', upper);
    }
  };

  const handlePartNoBlur = () => {
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    const p = String(item.partNo || '').replace(/\s+/g, '').toUpperCase();
    if (p.length >= 4) triggerLookup(p);
  };

  const handlePartSubmit = (submittedText = null) => {
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    const p = String(submittedText || item.partNo || '').replace(/\s+/g, '').toUpperCase();
    if (p.length >= 4) triggerLookup(p);
    focusQty();
  };

  return (
    <View style={[styles.itemCard, item.type === 'part' ? styles.partItemCard : styles.labourItemCard]}>
      <View style={styles.rowBetween}>
        <View style={styles.itemHeadingRow}>
          <Text style={styles.itemTitle}>{item.type === 'part' ? 'Part' : 'Labour'}</Text>
          <Text style={[styles.badge, isAutomatic ? styles.autoBadge : styles.manualBadge]}>
            {isAutomatic ? 'AUTO' : 'MANUAL'}
          </Text>
        </View>
        <Pressable onPress={onDelete}>
          <Text style={styles.delete}>Delete</Text>
        </Pressable>
      </View>

      {item.type === 'part' ? (
        <View style={styles.partInfoRow}>
          <View style={styles.partNoCol}>
            <View style={styles.field}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.label}>Part No.</Text>
                {rateLoading && <ActivityIndicator size="small" color="#0052cc" style={{ transform: [{ scale: 0.7 }] }} />}
              </View>
              <TextInput
                ref={partNoRef}
                value={String(item.partNo ?? '')}
                onChangeText={handlePartNoChange}
                onFocus={() => ensureVisible(partNoRef)}
                onBlur={handlePartNoBlur}
                onEndEditing={(e) => {
                  const p = String(e.nativeEvent?.text || item.partNo || '').replace(/\s+/g, '').toUpperCase();
                  if (p.length >= 4) triggerLookup(p);
                }}
                onSubmitEditing={(e) => {
                  const p = String(e.nativeEvent?.text || item.partNo || '').replace(/\s+/g, '').toUpperCase();
                  handlePartSubmit(p);
                }}
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
              {isAutomatic ? (
                <View style={[styles.input, styles.descriptionReadOnly]}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={styles.descriptionReadOnlyText}>
                    {String(item.description ?? '') || 'Part Description'}
                  </Text>
                </View>
              ) : (
                <TextInput
                  ref={descriptionRef}
                  value={String(item.description ?? '')}
                  onChangeText={(v) => set('description', v)}
                  onFocus={() => ensureVisible(descriptionRef)}
                  onSubmitEditing={focusQty}
                  returnKeyType="next"
                  placeholder="Part Description"
                  style={[styles.input, { textAlign: 'left' }]}
                />
              )}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          {isAutomatic ? (
            <View style={[styles.input, styles.descriptionReadOnly]}>
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.descriptionReadOnlyText}>
                {String(item.description ?? '') || 'Labour Description'}
              </Text>
            </View>
          ) : (
            <TextInput
              ref={descriptionRef}
              value={String(item.description ?? '')}
              onChangeText={(v) => set('description', v)}
              onFocus={() => ensureVisible(descriptionRef)}
              onSubmitEditing={focusQty}
              returnKeyType="next"
              placeholder="Labour Description"
              style={[styles.input, { textAlign: 'left' }]}
            />
          )}
        </View>
      )}

      <View style={styles.twoCol}>
        <View style={styles.col}>
          <View style={styles.field}>
            <Text style={styles.label}>Qty</Text>
            <TextInput
              ref={qtyRef}
              value={String(item.qty ?? '')}
              onChangeText={(v) => set('qty', v)}
              onFocus={() => ensureVisible(qtyRef)}
              keyboardType="decimal-pad"
              onSubmitEditing={focusRate}
              returnKeyType="next"
              style={styles.input}
            />
          </View>
        </View>
        <View style={styles.col}>
          <View style={styles.field}>
            <Text style={styles.label}>
              {item.type === 'part' ? 'MRP / Rate (Incl. GST)' : 'Rate (Excl. GST)'}
            </Text>
            <TextInput
              ref={rateRef}
              value={String(item.rate ?? '')}
              onChangeText={(v) => set('rate', v)}
              onFocus={() => ensureVisible(rateRef)}
              keyboardType="decimal-pad"
              returnKeyType="done"
              style={styles.input}
            />
          </View>
        </View>
      </View>
      <Text style={styles.lineAmount}>
        Amount: {money((Number(item.qty) || 0) * (Number(item.rate) || 0))}
      </Text>
      {item.source ? <Text style={styles.source}>{item.source}</Text> : null}
    </View>
  );
}

function LoginScreen({ onLogin }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Use Fingerprint');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const savedCreds = await getBiometricCredentials();
        if (savedCreds?.identifier && mounted) {
          setIdentifier(savedCreds.identifier);
        }
        const token = await getSecureSessionToken();
        const hardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
        const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
        if (mounted) {
          setBiometricReady(Boolean((savedCreds || token) && hardware && enrolled));
          setBiometricLabel(
            hasFingerprint ? 'Use Fingerprint' : hasFace ? 'Use Face Unlock' : 'Use Biometric Unlock'
          );
        }
      } catch {
        if (mounted) setBiometricReady(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const submit = async () => {
    if (!identifier.trim() || !password) {
      Alert.alert('Login', 'Enter email/mobile and password.');
      return;
    }
    setBusy(true);
    try {
      const data = await login(identifier, password, true);
      // Login sync: compare local Parts Master version with server version.
      // If the local version is older, the complete latest Parts Master is downloaded once.
      await syncPartsMaster();
      onLogin(data.user);
    } catch (e) {
      Alert.alert('Login failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const biometricLogin = async () => {
    setBusy(true);
    try {
      const hardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hardware || !enrolled) {
        Alert.alert(
          'Biometric Login',
          'Fingerprint or biometric authentication is not set up on this device.'
        );
        return;
      }

      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify your fingerprint',
        promptDescription: 'Use your registered fingerprint to sign in to Service Estimate.',
        cancelLabel: 'Use Password',
        disableDeviceFallback: false
      });

      if (!auth.success) {
        if (
          auth.error &&
          auth.error !== 'user_cancel' &&
          auth.error !== 'app_cancel' &&
          auth.error !== 'system_cancel'
        ) {
          Alert.alert(
            'Fingerprint login',
            'Fingerprint authentication was not completed. Please try again or use your password.'
          );
        }
        return;
      }

      const token = await getSecureSessionToken();
      if (token) {
        const sessionUser = await restoreSession(token);
        if (sessionUser) {
          syncPartsMaster().catch(() => {});
          onLogin(sessionUser);
          return;
        }
      }

      const savedCreds = await getBiometricCredentials();
      if (savedCreds?.identifier && savedCreds?.password) {
        const loginData = await login(savedCreds.identifier, savedCreds.password, true);
        if (loginData?.user) {
          await syncPartsMaster();
          onLogin(loginData.user);
          return;
        }
      }

      Alert.alert(
        'Session expired',
        'Please sign in once with your password to re-enable fingerprint unlock.'
      );
    } catch (e) {
      Alert.alert('Biometric login', e.message || 'Biometric authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.loginContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#dcecfa" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.loginScroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Branding Section */}
          <View style={styles.loginHeaderWrap}>
            <Image
              source={require('./assets/login_header.png')}
              style={styles.loginHeaderImage}
              resizeMode="contain"
            />
            <Text style={styles.loginTagline}>Smart  •  Fast  •  Professional</Text>
          </View>

          {/* White Login Card */}
          <View style={styles.loginCard}>
            <View style={styles.loginWelcomeRow}>
              <View style={styles.loginWelcomeAvatar}>
                <Text style={styles.loginWelcomeAvatarText}>●</Text>
              </View>
              <View>
                <Text style={styles.loginTitle}>Welcome Back 👋</Text>
                <Text style={styles.loginWelcomeSub}>Sign in to continue</Text>
              </View>
            </View>
            {/* Email / Mobile Field */}
            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <Text style={styles.inputIconText}>✉</Text>
                <Text style={styles.inputLabelText}>Email / Mobile</Text>
              </View>
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="Enter email or mobile"
                placeholderTextColor="#94a3b8"
                autoComplete="username"
                autoCapitalize="none"
                style={styles.modernInput}
              />
            </View>

            {/* Password Field with Eye Toggle */}
            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <Text style={styles.inputIconText}>🔒</Text>
                <Text style={styles.inputLabelText}>Password</Text>
              </View>
              <View style={styles.passwordWrapper}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  placeholderTextColor="#94a3b8"
                  autoComplete="current-password"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={[styles.modernInput, { flex: 1, borderWidth: 0, paddingRight: 40 }]}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIconBtn}
                >
                  <Text style={styles.eyeIconText}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              onPress={submit}
              disabled={busy}
              style={[styles.primaryLoginBtn, busy && styles.disabled]}
            >
              <Text style={styles.primaryLoginBtnText}>
                {busy ? 'Signing In...' : 'Sign In  ➔'}
              </Text>
            </TouchableOpacity>

            {/* OR Divider */}
            <View style={styles.orDividerRow}>
              <View style={styles.orDividerLine} />
              <Text style={styles.orDividerText}>OR</Text>
              <View style={styles.orDividerLine} />
            </View>

            {/* Use Fingerprint Button */}
            <TouchableOpacity
              onPress={biometricLogin}
              disabled={busy}
              style={[styles.fingerprintBtn, busy && styles.disabled]}
            >
              <Text style={styles.fingerprintIcon}>🔏</Text>
              <Text style={styles.fingerprintText}>{biometricLabel}</Text>
            </TouchableOpacity>

            {/* Forgot Password Link */}
            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  'Password Reset',
                  'Please contact your workshop administrator or system manager to reset your credentials.'
                )
              }
              style={styles.forgotBtn}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Truck Graphic */}
          <View style={styles.loginTruckWrap}>
            <Image
              source={require('./assets/login_truck.png')}
              style={styles.loginTruckImage}
              resizeMode="contain"
            />
          </View>

          {/* Center-aligned Copyright (No Year per user request) */}
          <View style={styles.loginFooterWrap}>
            <Text style={styles.loginFooterText}>
              © AL Service Estimate | All Rights Reserved
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function UpdateScreen({ update, onLater }) {
  const [busy, setBusy] = useState(false);

  const downloadAndInstall = async () => {
    if (!update?.downloadUrl) return;
    setBusy(true);
    try {
      const safeVersion = String(update.version || 'latest').replace(/[^a-zA-Z0-9._-]/g, '_');
      const safeBuild = String(update.build || '').replace(/[^0-9]/g, '');
      const fileUri = `${FileSystem.cacheDirectory}AL-Service-Estimate-${safeVersion}-build-${safeBuild}.apk`;
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      const result = await FileSystem.downloadAsync(update.downloadUrl, fileUri);
      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      try {
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          type: 'application/vnd.android.package-archive',
          flags: 1
        });
      } catch (installError) {
        // Android 8+ requires the user to allow this app to install unknown APKs.
        try {
          await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
            data: 'package:' + Application.applicationId
          });
          Alert.alert(
            'Allow installation',
            'Please enable "Allow from this source" for AL Service Estimate Beta, then tap Download & Install again.'
          );
        } catch {
          throw installError;
        }
      }
    } catch (e) {
      Alert.alert(
        'Update',
        e?.message || 'The update could not be downloaded or opened. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.updateWrap}>
        <View style={styles.updateCard}>
          <Text style={styles.updateIcon}>↑</Text>
          <Text style={styles.updateTitle}>New Update Available</Text>
          <Text style={styles.updateText}>A newer version of Service Estimate is available.</Text>
          <View style={styles.updateVersionBox}>
            <Text style={styles.updateVersionLabel}>Latest version</Text>
            <Text style={styles.updateVersion}>
              {update.version || '-'} • Build {update.build || '-'}
            </Text>
          </View>
          {update.notes ? <Text style={styles.updateNotes}>{update.notes}</Text> : null}
          <Button
            title={busy ? 'Downloading...' : 'Download & Install'}
            onPress={downloadAndInstall}
            disabled={busy}
          />
          <Button title="Later" secondary onPress={onLater} disabled={busy} />
          <Text style={styles.updateHint}>
            The APK will download automatically. Android may ask you to confirm the installation.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function HomeScreen({
  user,
  onSelectMode,
  onOpenSaved,
  onOpenSign,
  onSelectVehicle,
  onOpenVehiclesList,
  onLogout,
  onOpenSettings,
  recentVehicles = []
}) {
  const latestVehicle = recentVehicles?.[0] || null;

  return (
    <SafeAreaView style={styles.homeSafe}>
      <StatusBar barStyle="light-content" backgroundColor="#053775" />
      <ScrollView
        contentContainerStyle={styles.homeScroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Premium Blue Header */}
        <View style={styles.homeTopBar}>
          <View style={styles.homeBrandBlock}>
            <Image
              source={require('./assets/login_header.png')}
              style={styles.homeLogo}
              resizeMode="contain"
            />
            <Text style={styles.homeBrandSub}>Ashok Leyland Estimate App</Text>
          </View>
          <View style={styles.homeHeaderActions}>
            <TouchableOpacity style={styles.homeHeaderIcon} activeOpacity={0.8}>
              <Text style={styles.homeHeaderIconText}>🔔</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.homeHeaderIcon}
              activeOpacity={0.8}
              onPress={onOpenSettings}
            >
              <Text style={styles.homeHeaderIconText}>👤</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hello / Greeting Card */}
        <View style={styles.greetingCard}>
          <View style={styles.greetingLeft}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>👤</Text>
            </View>
            <View>
              <Text style={styles.greetingSub}>Hello,</Text>
              <Text style={styles.greetingName}>
                {user?.personName || user?.email || 'Valued User'}
              </Text>
              <Text style={styles.greetingHint}>Welcome to Service Estimate</Text>
            </View>
          </View>

          {/* Quick Vehicle Pill */}
          <TouchableOpacity
            style={styles.quickVehiclePill}
            onPress={() => {
              if (latestVehicle?.registration) {
                onSelectVehicle(latestVehicle.registration);
              } else {
                onSelectMode('service');
              }
            }}
          >
            <Text style={styles.quickVehiclePillIcon}>🚛</Text>
            <View>
              <Text style={styles.quickVehiclePillLabel}>Vehicle &gt;</Text>
              <Text style={styles.quickVehiclePillReg} numberOfLines={1}>
                {latestVehicle?.registration || 'New'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Create New Estimate Banner Card */}
        <TouchableOpacity
          style={styles.createEstimateBanner}
          activeOpacity={0.88}
          onPress={() => onSelectMode('service')}
        >
          <View style={styles.bannerIconSquare}>
            <Text style={styles.bannerIconText}>📄</Text>
          </View>
          <View style={styles.bannerTextCol}>
            <Text style={styles.bannerTitle}>Create New Estimate</Text>
            <Text style={styles.bannerSub}>
              Select parts and labour to generate accurate estimate.
            </Text>
          </View>
          <View style={styles.bannerArrowCircle}>
            <Text style={styles.bannerArrowText}>➔</Text>
          </View>
        </TouchableOpacity>

        {/* Quick Menu 2x3 Grid */}
        <View style={styles.quickMenuWrap}>
          <Text style={styles.sectionHeaderTitle}>Quick Menu</Text>
          <View style={styles.quickMenuGrid}>
            {/* Service Estimate */}
            <TouchableOpacity
              style={styles.quickMenuItem}
              onPress={() => onSelectMode('service')}
            >
              <View style={styles.menuIconContainer}>
                <Text style={styles.menuIconText}>📑</Text>
              </View>
              <Text style={styles.menuItemTitle}>Service Estimate</Text>
            </TouchableOpacity>

            {/* Repair Estimate */}
            <TouchableOpacity
              style={styles.quickMenuItem}
              onPress={() => onSelectMode('repair')}
            >
              <View style={styles.menuIconContainer}>
                <Text style={styles.menuIconText}>🔧</Text>
              </View>
              <Text style={styles.menuItemTitle}>Repair Estimate</Text>
            </TouchableOpacity>

            {/* Saved Estimates */}
            <TouchableOpacity
              style={styles.quickMenuItem}
              onPress={onOpenSaved}
            >
              <View style={styles.menuIconContainer}>
                <Text style={styles.menuIconText}>🗄️</Text>
              </View>
              <Text style={styles.menuItemTitle}>Saved Estimates</Text>
            </TouchableOpacity>

            {/* Sign & Letter Head */}
            <TouchableOpacity
              style={styles.quickMenuItem}
              onPress={onOpenSign}
            >
              <View style={styles.menuIconContainer}>
                <Text style={styles.menuIconText}>✍️</Text>
              </View>
              <Text style={styles.menuItemTitle}>Sign & Letter Head</Text>
            </TouchableOpacity>

            {/* Logout */}
            <TouchableOpacity
              style={styles.quickMenuItem}
              onPress={onLogout}
            >
              <View style={styles.menuIconContainer}>
                <Text style={styles.menuIconText}>⏻</Text>
              </View>
              <Text style={styles.menuItemTitle}>Logout</Text>
            </TouchableOpacity>

            {/* Settings */}
            <TouchableOpacity
              style={styles.quickMenuItem}
              onPress={onOpenSettings}
            >
              <View style={styles.menuIconContainer}>
                <Text style={styles.menuIconText}>⚙️</Text>
              </View>
              <Text style={styles.menuItemTitle}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Vehicles (Vehicle Search history only, separate from estimates) */}
        <View style={styles.recentVehiclesSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>Recent Vehicles</Text>
            <TouchableOpacity onPress={onOpenVehiclesList}>
              <Text style={styles.viewAllText}>View All ➔</Text>
            </TouchableOpacity>
          </View>

          {recentVehicles.length === 0 ? (
            <View style={styles.emptyRecentCard}>
              <Text style={styles.emptyRecentIcon}>🚚</Text>
              <Text style={styles.emptyRecentText}>No recent vehicle searches yet.</Text>
              <Text style={styles.emptyRecentSub}>
                Searched vehicles will appear here for fast one-tap estimate generation.
              </Text>
            </View>
          ) : (
            recentVehicles.slice(0, 4).map((item, index) => (
              <TouchableOpacity
                key={item.registration + index}
                style={styles.recentVehicleCard}
                onPress={() => onSelectVehicle(item.registration)}
              >
                <View style={styles.recentVehicleIconBox}>
                  <Text style={styles.recentVehicleIconText}>🚛</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.recentVehicleReg}>{item.registration}</Text>
                  {item.customer_name ? (
                    <Text style={styles.recentVehicleDetail}>
                      Customer: {item.customer_name}
                    </Text>
                  ) : null}
                  {item.model ? (
                    <Text style={styles.recentVehicleDetail}>Model: {item.model}</Text>
                  ) : null}
                  {item.vin ? (
                    <Text style={styles.recentVehicleDetail}>Chassis: {item.vin}</Text>
                  ) : null}
                </View>
                <Text style={styles.recentVehicleArrow}>&gt;</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Footer Strip */}
        <View style={styles.homeFooterStrip}>
          <Text style={styles.footerStripBrand}>⚙ AL Service Estimate</Text>
          <Text style={styles.footerStripMotto}>Smart • Fast • Professional</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function VehicleScreen({
  mode,
  recentVehicles = [],
  onSelectVehicle,
  onClearRecent,
  onVehicle,
  onVehicleMissing,
  onBack
}) {
  const [reg, setReg] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = async () => {
    const clean = String(reg || '').replace(/\s+/g, '').toUpperCase();
    if (!clean) {
      Alert.alert('Vehicle', 'Enter vehicle registration number.');
      return;
    }
    setBusy(true);
    try {
      const data = await getVehicleByRegistration(clean);
      if (!data?.vehicle) {
        // Vehicle not in DB! Go to Intermediate MissingVehicleScreen
        onVehicleMissing(clean);
        return;
      }
      onVehicle(data);
    } catch (e) {
      // In case of 404 or missing vehicle error, also send to MissingVehicleScreen
      if (e?.status === 404 || String(e?.message || '').toLowerCase().includes('not found')) {
        onVehicleMissing(clean);
      } else {
        Alert.alert('Vehicle lookup failed', e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const filteredRecent = useMemo(() => {
    const q = String(reg || '').trim().toUpperCase();
    if (!q) return recentVehicles || [];
    return (recentVehicles || []).filter(
      (v) =>
        String(v.registration || '').toUpperCase().includes(q) ||
        String(v.customer_name || '').toUpperCase().includes(q) ||
        String(v.model || '').toUpperCase().includes(q) ||
        String(v.vin || '').toUpperCase().includes(q)
    );
  }, [recentVehicles, reg]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.heading}>
              {mode === 'repair' ? 'Repair Estimate' : 'Vehicles / Search'}
            </Text>
            <Text style={styles.helper}>
              {mode === 'repair'
                ? 'Vehicle → Manual Parts/Labour'
                : 'Search vehicle registration or choose from recent searches'}
            </Text>
          </View>
          <Pressable onPress={onBack}>
            <Text style={styles.back}>Home</Text>
          </Pressable>
        </View>

        <View style={styles.vehicleSearchCard}>
          <Text style={styles.fieldLabelBig}>Vehicle Registration Number</Text>
          <TextInput
            value={reg}
            onChangeText={(v) => setReg(v.toUpperCase())}
            placeholder="e.g. GJ12BX8298"
            placeholderTextColor="#8a99a8"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={lookup}
            style={styles.largeRegInput}
          />
          <Button
            title={busy ? 'Checking Database...' : 'Load Vehicle  ➔'}
            onPress={() => {
              Keyboard.dismiss();
              lookup();
            }}
            disabled={busy}
          />
        </View>

        {/* Recent / Searched Vehicles Section */}
        <View style={{ marginTop: 18 }}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>
              Recent Vehicles ({recentVehicles.length})
            </Text>
            {recentVehicles.length > 0 && onClearRecent ? (
              <TouchableOpacity onPress={onClearRecent}>
                <Text style={{ fontSize: 11, color: '#e02424', fontWeight: '600' }}>
                  Clear History
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {filteredRecent.length === 0 ? (
            <View style={styles.emptyRecentCard}>
              <Text style={styles.emptyRecentIcon}>🚚</Text>
              <Text style={styles.emptyRecentText}>
                {reg ? 'No matching recent vehicle.' : 'No recent vehicle searches yet.'}
              </Text>
              <Text style={styles.emptyRecentSub}>
                {reg
                  ? `Tap "Load Vehicle ➔" above to search database for ${reg}`
                  : 'Searched vehicles will appear here for fast one-tap estimate generation.'}
              </Text>
            </View>
          ) : (
            filteredRecent.map((item, index) => (
              <TouchableOpacity
                key={(item.registration || '') + index}
                style={styles.recentVehicleCard}
                onPress={() => {
                  if (onSelectVehicle) {
                    onSelectVehicle(item.registration);
                  } else {
                    setReg(item.registration);
                  }
                }}
              >
                <View style={styles.recentVehicleIconBox}>
                  <Text style={styles.recentVehicleIconText}>🚚</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.recentVehicleReg}>{item.registration}</Text>
                  {item.customer_name ? (
                    <Text style={styles.recentVehicleDetail}>
                      Customer: {item.customer_name}
                    </Text>
                  ) : null}
                  {item.model ? (
                    <Text style={styles.recentVehicleDetail}>Model: {item.model}</Text>
                  ) : null}
                  {item.vin ? (
                    <Text style={styles.recentVehicleDetail}>Chassis: {item.vin}</Text>
                  ) : null}
                </View>
                <Text style={styles.recentVehicleArrow}>&gt;</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={[styles.infoBanner, { marginTop: 18 }]}>
          <Text style={styles.infoBannerTitle}>Automatic Database Lookup</Text>
          <Text style={styles.lookupHint}>
            If this vehicle is registered in the database, its customer profile, VIN, engine and
            service history will load automatically. If not found, you can select the 4-digit model
            from the database list.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MissingVehicleScreen({ registration, mode, onVehicle, onBack }) {
  const [modelList, setModelList] = useState([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [selectedModel, setSelectedModel] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await getModelList();
        if (mounted) {
          const fallbackModels = [
            '5525', '4925', '4828', '4825', '4225', '4220', '4123',
            '3518', '3118', '2820', '2518', '1920', '1618', '1415',
            '1214', '1114'
          ];
          const modelSet = new Set();
          if (Array.isArray(raw) && raw.length > 0) {
            raw.forEach((m) => {
              const str = String(m || '').trim();
              if (str) modelSet.add(str);
            });
          } else {
            fallbackModels.forEach((m) => modelSet.add(m));
          }

          const extract4Digit = (str) => {
            const match = String(str || '').match(/\b(\d{4})\b/) || String(str || '').match(/\d{4}/);
            return match ? parseInt(match[0], 10) : 0;
          };

          // Sort strictly by descending order based on the 4-digit model number
          const sorted = Array.from(modelSet).sort((a, b) => {
            const numA = extract4Digit(a);
            const numB = extract4Digit(b);
            if (numB !== numA) return numB - numA;
            return a.localeCompare(b);
          });
          setModelList(sorted);
        }
      } catch {
        if (mounted) {
          setModelList(['5525', '4925', '4828', '4825', '4225', '4220', '4123', '3518', '3118', '2820', '2518', '1920', '1618']);
        }
      } finally {
        if (mounted) setLoadingModels(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredModels = useMemo(() => {
    const q = String(modelSearch || '').trim().toLowerCase();
    if (!q) return modelList;
    return modelList.filter((m) => m.toLowerCase().includes(q));
  }, [modelList, modelSearch]);

  const proceed = async () => {
    if (!selectedModel) {
      Alert.alert('Model Required', 'Please select a vehicle model from the list.');
      return;
    }
    if (!customerName.trim()) {
      Alert.alert('Customer Name Required', 'Please enter the customer or transporter name.');
      return;
    }

    setBusy(true);
    try {
      const data = await getServiceDataByModel(selectedModel, registration, customerName.trim());
      onVehicle(data);
    } catch (e) {
      Alert.alert('Model Service Data', e.message || 'Could not load service data.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.container, { paddingBottom: 60 }]}
      >
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.heading}>Vehicle Not in Database</Text>
            <Text style={styles.helper}>Step 2: Select Model &amp; Customer Name</Text>
          </View>
          <Pressable onPress={onBack}>
            <Text style={styles.back}>Back</Text>
          </Pressable>
        </View>

        {/* Step 1: Pre-filled Registration Number */}
        <View style={styles.missingRegCard}>
          <Text style={styles.missingRegLabel}>REGISTRATION NUMBER</Text>
          <Text style={styles.missingRegValue}>{registration}</Text>
          <Text style={styles.missingRegHint}>
            This registration is not registered yet. Please select its vehicle model and customer
            name to proceed with aggregate service estimation.
          </Text>
        </View>

        {/* Step 2: Model Scroll List (Descending Order by 4-digit series) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Select Vehicle Model</Text>
          <Text style={styles.sectionHint}>
            Select the model from the database (sorted descending by 4-digit series). Model parts and rates will load automatically.
          </Text>

          {/* Quick filter input */}
          <TextInput
            value={modelSearch}
            onChangeText={setModelSearch}
            placeholder="Search model (e.g. 5525, 4220, NA5525)..."
            placeholderTextColor="#8a99a8"
            autoCapitalize="characters"
            style={[styles.input, { marginBottom: 8 }]}
          />

          {loadingModels ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#053775" />
              <Text style={styles.muted}>Loading models from database...</Text>
            </View>
          ) : (
            <View style={styles.modelScrollContainer}>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                {filteredModels.map((m) => {
                  const isSelected = selectedModel === m;
                  const numMatch = m.match(/\b\d{4}\b/) || m.match(/\d{4}/);
                  const seriesText = numMatch ? `${numMatch[0]} Series` : 'Ashok Leyland';
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setSelectedModel(m)}
                      style={[
                        styles.modelItemRow,
                        isSelected && styles.modelItemRowSelected
                      ]}
                    >
                      <View style={[styles.modelRadio, isSelected && styles.modelRadioSelected]}>
                        {isSelected ? <View style={styles.modelRadioDot} /> : null}
                      </View>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text
                          style={[
                            styles.modelItemText,
                            isSelected && styles.modelItemTextSelected
                          ]}
                        >
                          {m}
                        </Text>
                      </View>
                      <Text style={styles.modelItemTag}>{seriesText}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Step 3: Customer Name Input */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer Name</Text>
          <TextInput
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="Enter customer / transporter name"
            placeholderTextColor="#8a99a8"
            autoCapitalize="words"
            style={styles.input}
          />
        </View>

        {/* Continue Button */}
        <Button
          title={busy ? 'Loading Model Service Data...' : 'Continue to Estimate  ➔'}
          onPress={proceed}
          disabled={busy || !selectedModel || !customerName.trim()}
          style={{ marginTop: 14 }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const AGGREGATE_ICONS = {
  engineOil: '🛢️',
  coolant: '🌡️',
  gearOil: '⚙️',
  hubGrease: '🔘',
  axleOil: '🛞',
  fuelFilter: '⛽',
  steeringOil: '🎯',
  airFilter: '▦',
  clutchOil: '💠',
  defFilter: '🧪',
  defInline: '🔩',
  apdaFilter: '💧'
};

function EstimateScreen({ mode, data, user, onBack, savedEstimate, onSaved }) {
  const vehicle = data.vehicle || {};
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const keyboardTopRef = useRef(0);

  const [estimateNo] = useState(savedEstimate?.estimateNo || newEstimateNo());
  const [selected, setSelected] = useState(savedEstimate?.selectedServicesKeys || []);
  const [parts, setParts] = useState(savedEstimate?.parts || []);
  const [labour, setLabour] = useState(savedEstimate?.labour || []);
  const [customerName, setCustomerName] = useState(
    savedEstimate?.customerName || vehicle.customer_name || ''
  );
  const [saving, setSaving] = useState(false);
  const [rateLoadingId, setRateLoadingId] = useState(null);
  const [focusPartId, setFocusPartId] = useState(null);
  const [focusLabourId, setFocusLabourId] = useState(null);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardTopRef.current = e.endCoordinates?.screenY || 0;
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTopRef.current = 0;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Pre-calculate all aggregate items once when entering the screen (Instant 0ms selection)
  const prebuiltAggregates = useMemo(() => {
    return prebuildAllAggregates(
      data.rows || [],
      data.modelRows || [],
      data.globalPartRates || [],
      data.priceMaster || {}
    );
  }, [data]);

  const toggleAggregate = async (key) => {
    const nextSelected = selected.includes(key)
      ? selected.filter((x) => x !== key)
      : [...selected, key];
    setSelected(nextSelected);

    // Always read the already-downloaded local Price Master before building
    // automatic parts. This avoids using an older data.priceMaster snapshot.
    let localMaster = data?.priceMaster || {};
    try {
      const cached = await readPriceMaster();
      if (cached?.parts && Object.keys(cached.parts).length) {
        localMaster = cached.parts;
      }
    } catch {}

    const builtParts = [];
    const builtLabour = [];
    for (const k of nextSelected) {
      const items = buildServiceItems(
        [k],
        data.rows || [],
        data.modelRows || [],
        data.globalPartRates || [],
        localMaster
      );
      if (items?.parts) builtParts.push(...items.parts);
      if (items?.labour) builtLabour.push(...items.labour);
    }

    // Price Master is the final rate source. Automatic parts are rendered
    // directly with the cached MRP, never with the historical DB rate first.
    const pricedParts = builtParts.map((item) => {
      const code = String(item?.partNo || '').replace(/\s+/g, '').toUpperCase();
      const master = localMaster?.[code];
      const mrp = Number(master?.mrp || 0);
      if (!master || mrp <= 0) return item;
      return {
        ...item,
        partNo: master.partNo || code,
        description: master.description || item.description || code,
        rate: Number(mrp.toFixed(2)),
        baseRate: Number((mrp / 1.18).toFixed(2)),
        source: 'Price List Master (MRP)'
      };
    });

    const manualParts = parts.filter((x) => !x.serviceKey);
    const manualLabour = labour.filter((x) => !x.serviceKey);
    setParts([...manualParts, ...pricedParts]);
    setLabour([...manualLabour, ...builtLabour]);
  };

  const addPart = () => {
    const item = makeManualItem('part');
    setParts((prev) => [item, ...prev]);
    setFocusPartId(item.id);
  };

  const addLabour = () => {
    const item = makeManualItem('labour');
    setLabour((prev) => [item, ...prev]);
    setFocusLabourId(item.id);
  };

  const updatePart = (id, patch) =>
    setParts((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const updateLabour = (id, patch) =>
    setLabour((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const remove = (setter, id) => setter((prev) => prev.filter((x) => x.id !== id));

  const lookupRate = async (target, directPartNo = null) => {
    const itemId = typeof target === 'object' ? target?.id : target;
    const rawPart = directPartNo || (typeof target === 'object' ? target?.partNo : '') || '';
    const partNo = String(rawPart).replace(/\s+/g, '').toUpperCase();
    if (!itemId || !partNo) return;
    // Cache hit must be completely silent: no loading indicator.
    const master = data?.priceMaster?.[partNo];
    if (master?.mrp > 0 || master?.description) {
        setParts((prev) =>
          prev.map((x) => {
            if (x.id !== itemId) return x;
            const currentQty = Number(x.qty);
            return {
              ...x,
              partNo,
              description: master.description || partNo,
              rate: Number(master.mrp || 0),
              qty: !currentQty || currentQty <= 0 ? 1 : currentQty,
              serviceKey: null,
              source: 'Price List Master (MRP)'
            };
          })
        );
        return;
    }

    // Only a Price Master cache miss needs a network lookup, so the spinner
    // appears only for the exceptional fallback path.
    setRateLoadingId(itemId);
    try {
      const live = await getPartRate(partNo);
      if (live?.part) {
        const rateVal = Number(
          live.part.rateInclGst ??
          live.part.rate_with_gst ??
          (live.part.rate ? Number((live.part.rate * 1.18).toFixed(2)) : 0)
        );
        const descVal =
          live.part.description ||
          live.part.part_description ||
          live.part.partNo ||
          partNo;
        setParts((prev) =>
          prev.map((x) => {
            if (x.id !== itemId) return x;
            const currentQty = Number(x.qty);
            return {
              ...x,
              partNo: live.part.partNo || live.part.part_code || live.part.part_no || partNo,
              description: descVal,
              rate: rateVal,
              qty: !currentQty || currentQty <= 0 ? 1 : currentQty,
              serviceKey: null,
              source: 'Live Master Rate'
            };
          })
        );
        return;
      }
      const local = rateForManualPart(partNo, data.modelRows || [], data.globalPartRates || [], data.priceMaster || {});
      if (local) {
        setParts((prev) =>
          prev.map((x) => {
            if (x.id !== itemId) return x;
            const currentQty = Number(x.qty);
            return {
              ...x,
              partNo: local.partNo,
              description: local.description || local.partNo,
              rate: Number(local.rate || 0),
              qty: !currentQty || currentQty <= 0 ? 1 : currentQty,
              serviceKey: null,
              source: local.source
            };
          })
        );
      }
    } catch (err) {
      console.warn('lookupRate error:', err);
    } finally {
      setRateLoadingId(null);
    }
  };

  const validatePartNo = (item) => {
    const partNo = String(item.partNo || '').replace(/\s+/g, '').toUpperCase();
    if (!partNo) {
      Alert.alert('Part number required', 'Please enter a valid part number.');
      return false;
    }
    return true;
  };

  const incompleteLines = useMemo(() => {
    return [...parts, ...labour].some((x) => Number(x.qty || 0) <= 0 || Number(x.rate || 0) <= 0);
  }, [parts, labour]);

  const save = async () => {
    if (!customerName.trim()) {
      Alert.alert('Estimate', 'Enter customer name before saving.');
      return;
    }
    if (incompleteLines) {
      Alert.alert('Incomplete Lines', 'Every part and labour line must have Qty and Rate > 0.');
      return;
    }
    setSaving(true);
    try {
      const record = {
        id: savedEstimate?.id || Date.now().toString(),
        estimateNo,
        vehicleNo: vehicle.registration || '',
        customerName: customerName.trim(),
        mode,
        selectedServicesKeys: selected,
        parts,
        labour,
        vehicle,
        savedAt: new Date().toISOString()
      };
      await onSaved(record);
      Alert.alert('Saved', `Estimate ${estimateNo} saved successfully on this device.`);
    } catch (e) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const exportExcel = async () => {
    if (!customerName.trim()) {
      Alert.alert('Estimate', 'Enter customer name before exporting to Excel.');
      return;
    }
    if (incompleteLines) {
      Alert.alert('Estimate incomplete', 'Complete every Part/Labour line before exporting.');
      return;
    }
    try {
      const workbook = XLSX.utils.book_new();
      const meta = [
        ['Ashok Leyland Service Estimate'],
        ['Estimate No', estimateNo],
        ['Registration', vehicle.registration || '-'],
        ['Customer', customerName.trim()],
        ['Model', vehicle.model || '-'],
        ['Engine', vehicle.engine || '-'],
        ['Chassis', vehicle.vin || '-'],
        ['Sale Date', formatDateOnly(vehicle.sale_date)],
        ['Date', formatDateOnly(new Date())],
        []
      ];

      const partsData = [
        ['Type', 'Part No', 'Description', 'Qty', 'Rate (Incl GST)', 'Amount (Incl GST)'],
        ...parts.map((p) => [
          'Part',
          p.partNo || '-',
          p.description || '-',
          Number(p.qty || 0),
          Number(p.rate || 0),
          (Number(p.qty) || 0) * (Number(p.rate) || 0)
        ])
      ];

      const labourData = [
        [],
        ['Type', 'Labour Description', '', 'Qty', 'Rate (Excl GST)', 'Amount (Excl GST)'],
        ...labour.map((l) => [
          'Labour',
          l.description || '-',
          '',
          Number(l.qty || 0),
          Number(l.rate || 0),
          (Number(l.qty) || 0) * (Number(l.rate) || 0)
        ])
      ];

      const t = totals(parts, labour);
      const totalData = [
        [],
        ['Summary', 'Amount'],
        ['Parts Total (GST Incl)', t.partsTotal],
        ['Labour Subtotal (Excl GST)', t.labourSubtotal],
        ['GST on Labour (18%)', t.labourGst],
        ['Grand Total', t.total]
      ];

      const sheetData = [...meta, ...partsData, ...labourData, ...totalData];
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Estimate');

      const cleanReg = String(vehicle.registration || 'Vehicle').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileUri = `${FileSystem.cacheDirectory}${cleanReg} - Estimate.xlsx`;
      const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: `${cleanReg} - Estimate`,
          UTI: 'com.microsoft.excel.xlsx'
        });
      } else {
        await Share.share({ message: `Excel created: ${fileUri}` });
      }
    } catch (e) {
      Alert.alert('Excel Export', e.message || 'Could not export Excel.');
    }
  };

  const print = async () => {
    if (!customerName.trim()) {
      Alert.alert('Estimate', 'Enter customer name before printing.');
      return;
    }
    if (incompleteLines) {
      Alert.alert('Estimate incomplete', 'Complete every Part/Labour line before printing PDF.');
      return;
    }
    const allParts = parts || [];
    const allLabour = labour || [];
    const t = totals(allParts, allLabour);
    const labourSubtotal = allLabour.reduce(
      (sum, x) => sum + (Number(x.qty) || 0) * (Number(x.rate) || 0),
      0
    );
    const labourGst = labourSubtotal * 0.18;
    const moneyPdf = (n) =>
      `INR ${Number(n || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;
    const esc = (v) =>
      String(v ?? '-')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const dealerName = String(
      user?.dealer_name || user?.dealerName || vehicle?.dealer_name || vehicle?.dealerName || ''
    ).trim();
    const signatureSvg = await AsyncStorage.getItem('estimate_user_signature_svg');
    const letterhead = await AsyncStorage.getItem('estimate_letterhead');

    const partRows = allParts
      .map(
        (x) =>
          `<tr><td>${esc(x.partNo || '-')}</td><td>${esc(x.description || '-')}</td><td class="center">${esc(x.qty || 0)}</td><td class="right">${moneyPdf(x.rate)}</td><td class="right">${moneyPdf((Number(x.qty) || 0) * (Number(x.rate) || 0))}</td></tr>`
      )
      .join('');
    const labourRows = allLabour
      .map(
        (x) =>
          `<tr><td colspan="2">${esc(x.description || '-')}</td><td class="center">${esc(x.qty || 0)}</td><td class="right">${moneyPdf(x.rate)}</td><td class="right">${moneyPdf((Number(x.qty) || 0) * (Number(x.rate) || 0))}</td></tr>`
      )
      .join('');

    const infoCells = `
      <table class="info">
        <tr>
          <td><b>Customer</b><br/>${esc(customerName || '-')}</td>
          <td><b>Reg. No.</b><br/>${esc(vehicle.registration || '-')}</td>
          <td><b>VIN</b><br/>${esc(vehicle.vin || '-')}</td>
        </tr>
        <tr>
          <td><b>Model</b><br/>${esc(vehicle.model || '-')}</td>
          <td><b>Engine</b><br/>${esc(vehicle.engine || '-')}</td>
          <td><b>Sale Date</b><br/>${esc(formatDateOnly(vehicle.sale_date))}</td>
        </tr>
      </table>
    `;

    const partsBlock = allParts.length
      ? `<div class="section partsHead">Parts</div>
         <table class="items">
           <thead>
             <tr>
               <th style="width:14%">Part No.</th>
               <th style="width:39%">Description</th>
               <th style="width:9%">Qty</th>
               <th style="width:19%">Rate<br/>(Incl. GST)</th>
               <th style="width:19%">Amount</th>
             </tr>
           </thead>
           <tbody>${partRows}</tbody>
         </table>`
      : '';

    const labourBlock = allLabour.length
      ? `<div class="section labourHead">Labour</div>
         <table class="items">
           <thead>
             <tr>
               <th colspan="2" style="width:58%">Description</th>
               <th style="width:9%">Qty</th>
               <th style="width:19%">Rate<br/>(Excl. GST)</th>
               <th style="width:14%">Amount</th>
             </tr>
           </thead>
           <tbody>${labourRows}</tbody>
         </table>`
      : '';

    const signatureBlock = signatureSvg
      ? `<div class="sign"><div class="signatureSvg">${signatureSvg}</div><div>Authorized Signatory</div></div>`
      : '<div class="sign"><div>Authorized Signatory</div></div>';

    const html = `<html><head><style>
      @page{size:A4;margin:0}
      body{font-family:Arial,Helvetica,sans-serif;color:#17212b;margin:0;font-size:10px}
      .title{text-align:center;font-size:20px;font-weight:800;color:#12304a;margin:0 0 4px}
      .workshop{text-align:center;font-size:12px;font-weight:800;color:#1976d2;margin-bottom:3px}
      .topline{display:flex;justify-content:space-between;font-size:8px;margin-bottom:7px}
      html,body{width:100%;min-height:100%;margin:0;padding:0}
      .letterheadBg{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0}
      .letterheadBg img{width:100%;height:100%;display:block}
      .pageContent{position:relative;z-index:1;padding:10mm}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      td,th{border:1px solid #aab4c0;padding:5px;vertical-align:middle;word-wrap:break-word}
      th{font-weight:800;background:#eaf2ff;color:#17324d;height:34px;line-height:10px;font-size:9px;padding:4px}
      .info td{width:33.33%;height:28px;background:#f8fbff}
      .section{font-weight:800;font-size:11px;margin:9px 0 4px;color:#12304a}
      .partsHead{color:#1976d2}.labourHead{color:#ef7d22}
      .center{text-align:center}.right{text-align:right;white-space:nowrap}
      .items td:nth-child(4),.items td:nth-child(5){font-size:11px;white-space:nowrap}
      .total{width:45%;margin-left:auto;margin-top:8px}
      .total td{padding:5px}.total td:last-child{white-space:nowrap}
      .grand td{font-weight:900;font-size:15px;background:#eaf7ef}
      .sign{margin-top:20px;width:34%;margin-left:auto;text-align:center;min-height:55px}
      .signatureSvg{width:140px;height:55px;margin:0 auto 3px;display:flex;align-items:center;justify-content:center}
      .signatureSvg svg{width:100%;height:100%;display:block}
      .disclaimer{margin-top:16px;padding:7px;border-top:1px solid #cbd5e1;font-size:8px;color:#64748b;text-align:center}
    </style></head><body>
      ${letterhead ? `<div class="letterheadBg"><img src="${esc(letterhead)}" /></div>` : ''}
      <div class="pageContent">
        <div class="title">${mode === 'service' ? 'SERVICE ESTIMATE' : 'REPAIR ESTIMATE'}</div>
        ${dealerName ? `<div class="workshop">${esc(dealerName)}</div>` : ''}
        <div class="topline"><span>Estimate No: ${esc(estimateNo)}</span><span>Date: ${formatDateOnly(new Date())}</span></div>
        ${infoCells}
        ${partsBlock}
        ${labourBlock}
        <table class="total">
          <tr><td><b>Parts Total (GST Incl.)</b></td><td class="right">${moneyPdf(t.partsTotal)}</td></tr>
          <tr><td>Labour Subtotal</td><td class="right">${moneyPdf(labourSubtotal)}</td></tr>
          <tr><td>GST on Labour (18%)</td><td class="right">${moneyPdf(labourGst)}</td></tr>
          <tr class="grand"><td>Grand Total</td><td class="right">${moneyPdf(t.total)}</td></tr>
        </table>
        ${signatureBlock}
        <div class="disclaimer">Approximate estimate only; final billing may change after inspection and actual parts/labour used.</div>
      </div>
    </body></html>`;

    try {
      const result = await Print.printToFileAsync({ html });
      // Strict naming requirement: Registration no - "Estimate"
      const cleanReg = String(vehicle.registration || 'Vehicle').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const targetFileName = `${cleanReg} - Estimate.pdf`;
      const targetUri = `${FileSystem.cacheDirectory}${targetFileName}`;
      await FileSystem.copyAsync({ from: result.uri, to: targetUri });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(targetUri, {
          mimeType: 'application/pdf',
          dialogTitle: `${cleanReg} - Estimate`,
          UTI: 'com.adobe.pdf'
        });
      } else {
        await Share.share({ message: `Estimate ${vehicle.registration || ''}` });
      }
    } catch (e) {
      Alert.alert('PDF', e.message);
    }
  };

  const t = useMemo(() => totals(parts, labour), [parts, labour]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          contentContainerStyle={[styles.container, { paddingBottom: 260 }]}
        >
          {/* Header Bar matching media_1790756073139.jpg */}
          <View style={styles.estimateHeaderBar}>
            <TouchableOpacity onPress={onBack} style={styles.estimateBackBtn}>
              <Text style={styles.estimateBackArrow}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.estimateHeaderTitle}>SERVICE ESTIMATE</Text>
              <Text style={styles.estimateHeaderSub}>Ashok Leyland Estimate App</Text>
            </View>
            <Text style={styles.estimateHeaderFleetText}>Keep Your Fleet On The Move</Text>
          </View>

          {/* Vehicle Information Card */}
          <View style={styles.vehicleDetailsCard}>
            <View style={styles.vehicleCardTopRow}>
              <View style={styles.vehicleCardIconBox}>
                <Text style={styles.vehicleCardIconText}>🚛</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.vehicleCardLabel}>Vehicle</Text>
                <Text style={styles.vehicleCardReg}>{vehicle.registration || '-'}</Text>
              </View>
              <View style={styles.alHeavyVehicleBadge}>
                <Text style={styles.alHeavyVehicleText}>Ashok Leyland</Text>
                <Text style={styles.alHeavyVehicleSub}>Heavy Vehicle &gt;</Text>
              </View>
            </View>

            <View style={styles.vehicleMetaGrid}>
              <View style={styles.vehicleMetaRow}>
                <Text style={styles.metaLabel}>👤 Customer</Text>
                <Text style={styles.metaColon}>:</Text>
                <Text style={styles.metaVal} numberOfLines={1}>
                  {customerName || vehicle.customer_name || '-'}
                </Text>
              </View>
              <View style={styles.vehicleMetaRow}>
                <Text style={styles.metaLabel}>🚛 Model</Text>
                <Text style={styles.metaColon}>:</Text>
                <Text style={styles.metaVal}>{vehicle.model || '-'}</Text>
              </View>
              <View style={styles.vehicleMetaRow}>
                <Text style={styles.metaLabel}>⚙ Engine</Text>
                <Text style={styles.metaColon}>:</Text>
                <Text style={styles.metaVal}>{vehicle.engine || '-'}</Text>
              </View>
              <View style={styles.vehicleMetaRow}>
                <Text style={styles.metaLabel}>🔢 Chassis</Text>
                <Text style={styles.metaColon}>:</Text>
                <Text style={styles.metaVal}>{vehicle.vin || '-'}</Text>
              </View>
              <View style={styles.vehicleMetaRow}>
                <Text style={styles.metaLabel}>📅 Sale Date</Text>
                <Text style={styles.metaColon}>:</Text>
                <Text style={styles.metaVal}>{formatDateOnly(vehicle.sale_date)}</Text>
              </View>
            </View>
          </View>

          {/* Aggregate Selection (12 Aggregates matching reference) */}
          {mode === 'service' && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={styles.cardTitle}>⚙ Select Aggregate Service</Text>
                <Text style={styles.sectionHint}>
                  Select one or more services. Applicable parts and labour will load automatically.
                </Text>
              </View>

              <View style={styles.aggregateListWrap}>
                {AGGREGATES.map(([label, key]) => {
                  const isChecked = selected.includes(key);
                  const icon = AGGREGATE_ICONS[key] || '🔧';
                  return (
                    <TouchableOpacity
                      key={key}
                      activeOpacity={0.7}
                      onPress={() => toggleAggregate(key)}
                      style={[
                        styles.aggregateRowNew,
                        isChecked && styles.aggregateRowNewSelected
                      ]}
                    >
                      <View style={[styles.aggRadioCircle, isChecked && styles.aggRadioCircleActive]}>
                        {isChecked ? <View style={styles.aggRadioInnerDot} /> : null}
                      </View>
                      <Text style={styles.aggIconDisplay}>{icon}</Text>
                      <Text style={[styles.aggLabelText, isChecked && styles.aggLabelTextActive]}>
                        {label}
                      </Text>
                      <Text style={styles.aggChevron}>&gt;</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Parts Card */}
          <View style={[styles.card, styles.partsCard]}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.partCardEmoji}>📦</Text>
                <Text style={styles.cardTitle}>Parts</Text>
              </View>
              <Pressable onPress={addPart}>
                <Text style={[styles.add, styles.partAdd]}>+ Add Part &gt;</Text>
              </Pressable>
            </View>
            {parts.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onChange={(x) => {
                  updatePart(item.id, x);
                  if (focusPartId === item.id) setFocusPartId(null);
                }}
                onDelete={() => remove(setParts, item.id)}
                onRateLookup={lookupRate}
                rateLoading={rateLoadingId === item.id}
                autoFocusPart={focusPartId === item.id}
                scrollRef={scrollRef}
                scrollYRef={scrollYRef}
                keyboardTopRef={keyboardTopRef}
                onPartNoSubmit={validatePartNo}
              />
            ))}
            {!parts.length && <Text style={styles.empty}>No parts added.</Text>}
          </View>

          {/* Labour Card */}
          <View style={[styles.card, styles.labourCard]}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.partCardEmoji}>👷</Text>
                <Text style={styles.cardTitle}>Labour</Text>
              </View>
              <Pressable onPress={addLabour}>
                <Text style={[styles.add, styles.labourAdd]}>+ Add Labour &gt;</Text>
              </Pressable>
            </View>
            {labour.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onChange={(x) => {
                  updateLabour(item.id, x);
                  if (focusLabourId === item.id) setFocusLabourId(null);
                }}
                onDelete={() => remove(setLabour, item.id)}
                onRateLookup={() => {}}
                autoFocusLabour={focusLabourId === item.id}
                scrollRef={scrollRef}
                scrollYRef={scrollYRef}
                keyboardTopRef={keyboardTopRef}
              />
            ))}
            {!labour.length && <Text style={styles.empty}>No labour added.</Text>}
          </View>

          {/* Grand Total Navy Banner */}
          <View style={styles.totalCard}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 18, marginRight: 6 }}>💰</Text>
                <Text style={styles.totalLabel}>Grand Total</Text>
              </View>
              <Text style={styles.totalHint}>All rates shown inclusive of GST</Text>
            </View>
            <Text style={styles.total}>{money(t.total)}</Text>
          </View>

          {/* Output Actions */}
          {!incompleteLines ? (
            <View style={{ marginTop: 12 }}>
              <Button
                title={saving ? 'Saving...' : 'Save Estimate'}
                onPress={save}
                disabled={saving}
              />
              <Button title="Print / Share PDF" secondary onPress={print} />
              <Button title="Export to Excel" secondary onPress={exportExcel} />
            </View>
          ) : (
            <View style={styles.incompleteBox}>
              <Text style={styles.incompleteTitle}>🔒 Estimate output locked</Text>
              <Text style={styles.incompleteText}>
                Complete every line before saving or printing. Qty and Rate must be greater than 0.
              </Text>
            </View>
          )}

          {/* Bottom Disclaimer */}
          <View style={styles.disclaimerBox}>
            <Text style={styles.disclaimerText}>
              Disclaimer: This estimate is prepared from the information entered and available
              historical rate data. Final billing is subject to actual inspection, parts
              availability and applicable rates.
            </Text>
            <Text style={styles.disclaimerSubText}>
              AL | Genuine Parts • Expert Service • Better Performance
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SavedEstimatesScreen({ records, onOpen, onNew, onBack }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    const list = [...(records || [])].sort(
      (a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0)
    );
    if (!q) return list;
    return list.filter(
      (x) =>
        String(x.vehicleNo || '').toLowerCase().includes(q) ||
        String(x.estimateNo || '').toLowerCase().includes(q) ||
        String(x.customerName || '').toLowerCase().includes(q)
    );
  }, [records, query]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.heading}>Saved Estimates</Text>
            <Text style={styles.muted}>Stored securely on this mobile device</Text>
          </View>
          <Pressable onPress={onBack}>
            <Text style={styles.back}>Home</Text>
          </Pressable>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search Vehicle No., Estimate No., or Customer"
          placeholderTextColor="#8a99a8"
          style={[styles.input, { marginVertical: 8 }]}
        />
        <Button title="+ Create New Estimate" onPress={onNew} />
        {!filtered.length && (
          <Text style={styles.empty}>
            {query ? 'No matching saved estimate.' : 'No saved estimates yet.'}
          </Text>
        )}
        {filtered.map((item) => (
          <Pressable key={item.id} onPress={() => onOpen(item)} style={styles.savedRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.savedVehicle}>{item.vehicleNo || '-'}</Text>
              <Text style={styles.savedEstimateNo}>
                {item.estimateNo || '-'} • {item.customerName || 'Customer'}
              </Text>
              <Text style={styles.savedDate}>{formatDateTime(item.savedAt)}</Text>
            </View>
            <Text style={styles.savedOpen}>Open &gt;</Text>
          </Pressable>
        ))}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>
            Saved estimates are kept locally on your phone so you can reference and re-print them
            anytime.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SignatureScreen({ signature, letterhead, onSave, onLetterheadSave, onBack }) {
  const [busy, setBusy] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [strokeWidth, setStrokeWidth] = useState(2.5);
  const [fullScreen, setFullScreen] = useState(false);
  const [padSize, setPadSize] = useState({ width: 1, height: 1 });
  const padSizeRef = useRef({ width: 1, height: 1 });
  const padOriginRef = useRef({ x: 0, y: 0 });
  const padRef = useRef(null);
  const strokeWidthRef = useRef(2.5);
  const currentStrokeRef = useRef([]);

  useEffect(() => {
    const handleBack = () => {
      if (fullScreen) {
        setFullScreen(false);
        return true;
      }
      onBack();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => subscription.remove();
  }, [onBack, fullScreen]);

  const getLocalPoint = (e) => {
    const size = padSizeRef.current;
    const origin = padOriginRef.current;
    const pageX = Number(e.nativeEvent.pageX);
    const pageY = Number(e.nativeEvent.pageY);
    return {
      x: Math.max(0, Math.min(size.width, pageX - origin.x)),
      y: Math.max(0, Math.min(size.height, pageY - origin.y))
    };
  };

  const startStroke = (e) => {
    const p = getLocalPoint(e);
    currentStrokeRef.current = [p];
    setStrokes((prev) => [...prev, [p]]);
    setDrawing(true);
  };

  const moveStroke = (e) => {
    const p = getLocalPoint(e);
    setStrokes((prev) => {
      if (!prev.length) return prev;
      const lastIndex = prev.length - 1;
      const stroke = prev[lastIndex] || [];
      const last = stroke[stroke.length - 1];
      if (!last) return prev;

      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 0.35) return prev;

      // Interpolate touch gaps so Android move-event spacing cannot render a dotted signature.
      const steps = Math.max(1, Math.ceil(distance / 1.5));
      const added = [];
      for (let i = 1; i <= steps; i += 1) {
        added.push({
          x: last.x + (dx * i) / steps,
          y: last.y + (dy * i) / steps
        });
      }

      const nextStroke = [...stroke, ...added];
      const next = [...prev];
      next[lastIndex] = nextStroke;
      currentStrokeRef.current = nextStroke;
      return next;
    });
  };

  const finishStroke = () => {
    currentStrokeRef.current = [];
    setDrawing(false);
  };

  const clearCanvas = () => {
    setStrokes([]);
    currentStrokeRef.current = [];
    setDrawing(false);
  };

  const saveSignature = async () => {
    if (!strokes.length || !strokes.some((stroke) => stroke.length > 1)) {
      Alert.alert('Signature', 'Please sign inside the white board first.');
      return;
    }
    setBusy(true);
    try {
      const drawnPoints = strokes.filter((stroke) => stroke.length > 1).flat();
      const xs = drawnPoints.map((p) => Number(p.x) || 0);
      const ys = drawnPoints.map((p) => Number(p.y) || 0);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const sourceWidth = Math.max(1, padSizeRef.current.width);
      const sourceHeight = Math.max(1, padSizeRef.current.height);
      const padding = Math.max(12, Math.min(sourceWidth, sourceHeight) * 0.04);
      const cropMinX = Math.max(0, minX - padding);
      const cropMaxX = Math.min(sourceWidth, maxX + padding);
      const cropMinY = Math.max(0, minY - padding);
      const cropMaxY = Math.min(sourceHeight, maxY + padding);
      const cropWidth = Math.max(1, cropMaxX - cropMinX);
      const cropHeight = Math.max(1, cropMaxY - cropMinY);
      const svgWidth = 1200;
      const svgHeight = Math.max(120, Math.round(svgWidth * (cropHeight / cropWidth)));
      const scaleX = svgWidth / cropWidth;
      const scaleY = svgHeight / cropHeight;
      const paths = strokes
        .filter((stroke) => stroke.length > 1)
        .map((stroke) => {
          const points = stroke
            .map((p) => {
              const x = Math.max(0, Math.min(svgWidth, (p.x - cropMinX) * scaleX));
              const y = Math.max(0, Math.min(svgHeight, (p.y - cropMinY) * scaleY));
              return `${x},${y}`;
            })
            .join(' ');
          return `<polyline points="${points}" fill="none" stroke="#1456c0" stroke-width="${Math.max(3, strokeWidthRef.current * 3)}" stroke-linecap="round" stroke-linejoin="round"/>`;
        })
        .join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet"><g>${paths}</g></svg>`;
      const signatureUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await AsyncStorage.setItem('estimate_user_signature', signatureUri);
      await AsyncStorage.setItem('estimate_user_signature_svg', svg);
      onSave(signatureUri);
      setFullScreen(false);
      Alert.alert(
        'Saved',
        'Signature saved in the same orientation and proportion in which it was drawn.'
      );
    } catch (e) {
      Alert.alert('Signature', e.message || 'Could not save signature.');
    } finally {
      setBusy(false);
    }
  };

  const clearSignature = async () => {
    await AsyncStorage.removeItem('estimate_user_signature');
    await AsyncStorage.removeItem('estimate_user_signature_svg');
    onSave('');
    clearCanvas();
  };

  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
  }, [strokeWidth]);

  const strokePath = (stroke) => {
    if (!stroke || stroke.length < 2) return '';
    const first = stroke[0];
    return stroke
      .map((point, index) => {
        const x = Number(point.x || 0).toFixed(2);
        const y = Number(point.y || 0).toFixed(2);
        return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
      })
      .join(' ');
  };

  const drawBoard = (large = false) => (
    <View
      ref={padRef}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) {
          const next = { width, height };
          padSizeRef.current = next;
          setPadSize(next);
          requestAnimationFrame(() => {
            if (padRef.current?.measureInWindow) {
              padRef.current.measureInWindow((x, y, w, h) => {
                padOriginRef.current = { x, y };
                padSizeRef.current = { width: w || width, height: h || height };
                setPadSize({ width: w || width, height: h || height });
              });
            }
          });
        }
      }}
      style={[styles.signaturePad, large && styles.signaturePadFull]}
      {...panResponder.panHandlers}
    >
      <Svg
        pointerEvents="none"
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        viewBox={`0 0 ${Math.max(1, padSize.width)} ${Math.max(1, padSize.height)}`}
      >
        {strokes.map((stroke, si) => (
          <Path
            key={`signature-${si}`}
            d={strokePath(stroke)}
            fill="none"
            stroke="#1456c0"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </Svg>
      {!strokes.length && (
        <Text style={styles.signaturePadHint}>Sign here with your finger</Text>
      )}
    </View>
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: startStroke,
      onPanResponderMove: moveStroke,
      onPanResponderRelease: finishStroke,
      onPanResponderTerminate: finishStroke
    })
  ).current;

  const scanLetterhead = async () => {
    setBusy(true);
    try {
      if (Platform.OS === 'android') {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission required', 'Camera permission is required to scan the letterhead.');
          return;
        }
      }
      const result = await DocumentScanner.scanDocument({
        responseType: 'base64',
        maxNumDocuments: 1,
        croppedImageQuality: 85
      });
      const scanned = Array.isArray(result?.scannedImages) ? result.scannedImages[0] : null;
      if (result?.status === 'success' && scanned) {
        const value = String(scanned);
        const uri = value.startsWith('data:image')
          ? value
          : 'data:image/jpeg;base64,' + value;
        await AsyncStorage.setItem('estimate_letterhead', uri);
        onLetterheadSave(uri);
        Alert.alert(
          'Letter Head',
          'Letter head scanned, corner detected and cropped. It will be used as the estimate background.'
        );
      }
    } catch (e) {
      Alert.alert('Letter Head', e.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadLetterhead = async () => {
    setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Photo library permission is required.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
        base64: true
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const uri = asset.base64
          ? 'data:' + (asset.mimeType || 'image/jpeg') + ';base64,' + asset.base64
          : asset.uri;
        await AsyncStorage.setItem('estimate_letterhead', uri);
        onLetterheadSave(uri);
        Alert.alert(
          'Saved',
          'Letter head saved. It will be used as the estimate background on every page.'
        );
      }
    } catch (e) {
      Alert.alert('Letter Head', e.message);
    } finally {
      setBusy(false);
    }
  };

  if (fullScreen) {
    return (
      <SafeAreaView style={styles.signatureFullScreen}>
        <View style={styles.signatureFullHeader}>
          <Pressable onPress={() => setFullScreen(false)} disabled={busy}>
            <Text style={styles.signatureFullBack}>Cancel</Text>
          </Pressable>
          <Text style={styles.signatureFullTitle}>Sign Here</Text>
          <Pressable onPress={saveSignature} disabled={busy}>
            <Text style={styles.signatureFullSave}>{busy ? 'Saving...' : 'Save'}</Text>
          </Pressable>
        </View>
        <View style={styles.signatureFullControls}>
          <Text style={styles.signatureFullLabel}>Pen thickness</Text>
          {[1.5, 2.5, 4, 6].map((w) => (
            <Pressable
              key={w}
              onPress={() => setStrokeWidth(w)}
              style={[
                styles.strokeButton,
                strokeWidth === w && styles.strokeButtonSelected
              ]}
            >
              <Text
                style={[
                  styles.strokeButtonText,
                  strokeWidth === w && styles.strokeButtonTextSelected
                ]}
              >
                {w}
              </Text>
            </Pressable>
          ))}
          <Pressable onPress={clearCanvas} style={styles.signatureClearSmall}>
            <Text style={styles.signatureClearSmallText}>Clear</Text>
          </Pressable>
        </View>
        <View style={styles.signatureFullPadWrap}>{drawBoard(true)}</View>
        <Text style={styles.signatureFullHint}>
          {drawing ? 'Drawing...' : 'Draw your signature anywhere inside the white board'}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.heading}>Sign and Letter Head</Text>
            <Text style={styles.lookupHint}>
              Tap the box to open a full-screen signing pad. Only your signature strokes are saved.
            </Text>
          </View>
          <Pressable onPress={onBack}>
            <Text style={styles.back}>Home</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => setFullScreen(true)} style={styles.signaturePreview}>
          <Text style={styles.cardTitle}>User Signature</Text>
          <View style={styles.signatureTapBox}>
            {signature ? (
              <ExpoImage
                source={signature}
                style={styles.signatureImage}
                contentFit="contain"
              />
            ) : (
              <Text style={styles.signatureTapText}>Tap here to sign</Text>
            )}
          </View>
          <Text style={styles.signaturePadStatus}>
            Tap to open full-screen signing • Pen: {strokeWidth.toFixed(1)}
          </Text>
        </Pressable>

        {signature ? (
          <Button title="Remove Saved Signature" secondary onPress={clearSignature} />
        ) : null}

        <View style={styles.signaturePreview}>
          <Text style={styles.cardTitle}>Estimate Letter Head</Text>
          {letterhead ? (
            <Image source={{ uri: letterhead }} style={styles.letterheadPreview} />
          ) : (
            <Text style={styles.empty}>No letter head saved.</Text>
          )}
          {letterhead ? <Text style={styles.signatureSaved}>Letter head active</Text> : null}
        </View>

        <Button
          title={busy ? 'Opening scanner...' : 'Scan / Capture Letter Head'}
          onPress={scanLetterhead}
          disabled={busy}
        />
        <Button
          title="Upload Letter Head from Gallery"
          secondary
          onPress={uploadLetterhead}
          disabled={busy}
        />
        {letterhead ? (
          <Button
            title="Remove Saved Letter Head"
            secondary
            onPress={async () => {
              await AsyncStorage.removeItem('estimate_letterhead');
              onLetterheadSave('');
            }}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsScreen({ user, onLogout, onBack }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.heading}>App Settings</Text>
            <Text style={styles.muted}>Service Estimate Configuration</Text>
          </View>
          <Pressable onPress={onBack}>
            <Text style={styles.back}>Home</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>User Profile</Text>
          <Text style={styles.vehicleDetail}>Name: {user?.personName || '-'}</Text>
          <Text style={styles.vehicleDetail}>Email: {user?.email || '-'}</Text>
          <Text style={styles.vehicleDetail}>Role: {user?.role || 'Staff'}</Text>
          <Text style={styles.vehicleDetail}>
            Dealer: {user?.dealer_name || user?.dealerName || '-'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>App Version</Text>
          <Text style={styles.vehicleDetail}>
            Version: {Application.nativeApplicationVersion || '0.1.0'}
          </Text>
          <Text style={styles.vehicleDetail}>
            Build: {Application.nativeBuildVersion || '13'}
          </Text>
        </View>

        <Button
          title="Clear Recent Vehicle History"
          secondary
          onPress={async () => {
            await AsyncStorage.removeItem(RECENT_VEHICLES_KEY);
            Alert.alert('Cache Cleared', 'Recent vehicles cache cleared.');
          }}
        />
        <Button title="Logout" secondary onPress={onLogout} style={{ marginTop: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState(null);
  const [vehicleData, setVehicleData] = useState(null);
  const [missingVehicleReg, setMissingVehicleReg] = useState(null);
  const [signatureScreen, setSignatureScreen] = useState(false);
  const [savedScreen, setSavedScreen] = useState(false);
  const [settingsScreen, setSettingsScreen] = useState(false);
  const [savedEstimates, setSavedEstimates] = useState([]);
  const [recentVehicles, setRecentVehicles] = useState([]);
  const [editingSaved, setEditingSaved] = useState(null);
  const [signature, setSignature] = useState('');
  const [letterhead, setLetterhead] = useState('');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [activeTab, setActiveTab] = useState('home');

  const savedKey =
    'service_estimate_saved_' +
    String(user?.id || user?.email || user?.personName || 'default').toLowerCase();

  const loadSavedEstimates = async () => {
    try {
      const raw = await AsyncStorage.getItem(savedKey);
      const list = raw ? JSON.parse(raw) : [];
      setSavedEstimates(Array.isArray(list) ? list : []);
    } catch {
      setSavedEstimates([]);
    }
  };

  const loadRecentVehicles = async () => {
    try {
      const raw = await AsyncStorage.getItem(RECENT_VEHICLES_KEY);
      const list = raw ? JSON.parse(raw) : [];
      setRecentVehicles(Array.isArray(list) ? list : []);
    } catch {
      setRecentVehicles([]);
    }
  };

  const saveRecentVehicle = async (veh) => {
    if (!veh || !veh.registration) return;
    try {
      const raw = await AsyncStorage.getItem(RECENT_VEHICLES_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const cleanReg = String(veh.registration).trim().toUpperCase();
      const filtered = list.filter(
        (v) => String(v.registration).trim().toUpperCase() !== cleanReg
      );
      const next = [
        {
          registration: cleanReg,
          customer_name: veh.customer_name || '',
          model: veh.model || '',
          vin: veh.vin || '',
          engine: veh.engine || '',
          sale_date: veh.sale_date || '',
          searchedAt: new Date().toISOString()
        },
        ...filtered
      ].slice(0, 20);
      await AsyncStorage.setItem(RECENT_VEHICLES_KEY, JSON.stringify(next));
      setRecentVehicles(next);
    } catch {}
  };

  const saveLocalEstimate = async (record) => {
    const current = [...(savedEstimates || [])];
    const next = [record, ...current.filter((x) => x.id !== record.id)];
    next.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
    await AsyncStorage.setItem(savedKey, JSON.stringify(next));
    setSavedEstimates(next);
  };

  const openSavedEstimate = (record) => {
    setEditingSaved({
      ...record,
      id: null,
      estimateNo: newEstimateNo(),
      selectedServicesKeys: Array.isArray(record.selectedServicesKeys)
        ? record.selectedServicesKeys
        : []
    });
    setVehicleData({
      rows: [],
      modelRows: [],
      globalPartRates: [],
      vehicle: record.vehicle || { registration: record.vehicleNo },
      missingVehicle: false
    });
    setMode(record.mode || 'service');
    setSavedScreen(false);
  };

  useEffect(() => {
    AsyncStorage.getItem('estimate_user_signature').then((v) => setSignature(v || ''));
    AsyncStorage.getItem('estimate_letterhead').then((v) => setLetterhead(v || ''));
    loadRecentVehicles();
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkForUpdate = async () => {
      try {
        if (Platform.OS !== 'android') return;

        const currentBuild = Number(Application.nativeBuildVersion || 0);
        const isBeta = Application.applicationId === 'com.rahulmundra.serviceestimate.beta';
        const updateSourceUrl = isBeta
          ? 'https://api.github.com/repos/rahulmundra02-boop/Service-decision-Engine/releases/latest?t=' + Date.now()
          : 'https://service-decision-engine.vercel.app/mobile/latest.json?t=' + Date.now();

        const response = await fetch(updateSourceUrl, {
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache'
          }
        });

        if (!response.ok) return;

        const release = await response.json();

        // Beta APKs are published as GitHub Releases. Do not depend on the
        // Vercel manifest or a Vercel-hosted APK for Beta auto-updates.
        const betaBuildMatch = String(release?.tag_name || '').match(/build(\\d+)/i);
        const latestBuild = isBeta
          ? Number(betaBuildMatch?.[1] || 0)
          : Number(release?.build || 0);
        const betaApk = isBeta
          ? (Array.isArray(release?.assets)
              ? release.assets.find((asset) => String(asset?.name || '') === 'app-release.apk')
              : null)
          : null;
        const downloadUrl = isBeta
          ? String(betaApk?.browser_download_url || '')
          : String(release?.downloadUrl || '');
        const latestVersion = isBeta
          ? String(String(release?.tag_name || '').match(/v([0-9.]+)/i)?.[1] || Application.nativeApplicationVersion || 'New')
          : String(release?.version || 'New');

        if (!cancelled && latestBuild > currentBuild && downloadUrl) {
          setUpdateDismissed(false);
          setUpdateInfo({
            version: latestVersion,
            build: latestBuild,
            downloadUrl,
            notes: isBeta
              ? 'A new Beta Android update is available. Download and install the latest Beta update.'
              : 'A new Android update is available. Download and install the latest update.'
          });
        }
      } catch {}
    };

    checkForUpdate();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkForUpdate();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const checkSession = async () => {
      const fresh = await restoreSession();
      if (cancelled) return;
      if (!fresh) {
        await logout();
        if (!cancelled) {
          setUser(null);
          setMode(null);
          setVehicleData(null);
          setMissingVehicleReg(null);
          setSavedScreen(false);
          setSignatureScreen(false);
          setSettingsScreen(false);
          Alert.alert('Session ended', 'Your login session is no longer active. Please sign in again.');
        }
      } else {
        setUser(fresh);
      }
    };
    checkSession();
    const timer = setInterval(checkSession, 30000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkSession();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      loadSavedEstimates();
      loadRecentVehicles();
      // Parts Master is synchronized during login/biometric login.
      // No per-part catalog download is performed here.
    }
  }, [user?.id, user?.email, user?.personName]);

  useEffect(() => {
    const onBackPress = () => {
      if (signatureScreen) {
        setSignatureScreen(false);
        return true;
      }
      if (settingsScreen) {
        setSettingsScreen(false);
        return true;
      }
      if (savedScreen) {
        setSavedScreen(false);
        return true;
      }
      if (missingVehicleReg) {
        setMissingVehicleReg(null);
        return true;
      }
      if (vehicleData) {
        setVehicleData(null);
        return true;
      }
      if (mode) {
        setMode(null);
        setActiveTab('home');
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [mode, vehicleData, missingVehicleReg, signatureScreen, savedScreen, settingsScreen]);

  const handleSelectRecentVehicle = (regNum) => {
    setMode('service');
    getVehicleByRegistration(regNum)
      .then((data) => {
        if (data?.vehicle) {
          saveRecentVehicle(data.vehicle);
          setVehicleData(data);
        } else {
          setMissingVehicleReg(regNum);
        }
      })
      .catch(() => {
        setMissingVehicleReg(regNum);
      });
  };

  const clearRecentVehicles = async () => {
    Alert.alert(
      'Clear Recent Vehicles',
      'Are you sure you want to clear your recent vehicle search history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(RECENT_VEHICLES_KEY);
              setRecentVehicles([]);
            } catch {}
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#053775" />
          <Text style={styles.muted}>Loading Service Estimate...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (updateInfo && !updateDismissed) {
    return (
      <UpdateScreen
        update={updateInfo}
        onLater={() => setUpdateDismissed(true)}
      />
    );
  }

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  if (signatureScreen) {
    return (
      <SignatureScreen
        signature={signature}
        letterhead={letterhead}
        onSave={setSignature}
        onLetterheadSave={setLetterhead}
        onBack={() => setSignatureScreen(false)}
      />
    );
  }

  if (settingsScreen) {
    return (
      <SettingsScreen
        user={user}
        onLogout={async () => {
          await logout();
          setUser(null);
          setSettingsScreen(false);
        }}
        onBack={() => setSettingsScreen(false)}
      />
    );
  }

  if (savedScreen) {
    return (
      <SavedEstimatesScreen
        records={savedEstimates}
        onOpen={openSavedEstimate}
        onNew={() => {
          setEditingSaved(null);
          setVehicleData(null);
          setMissingVehicleReg(null);
          setMode('service');
          setSavedScreen(false);
        }}
        onBack={() => setSavedScreen(false)}
      />
    );
  }

  // Intermediate Missing Vehicle Screen (Requirement 2 & 7)
  if (missingVehicleReg) {
    return (
      <MissingVehicleScreen
        registration={missingVehicleReg}
        mode={mode || 'service'}
        onVehicle={(vData) => {
          saveRecentVehicle(vData.vehicle);
          setMissingVehicleReg(null);
          setVehicleData(vData);
        }}
        onBack={() => setMissingVehicleReg(null)}
      />
    );
  }

  // Vehicle lookup screen
  if (mode && !vehicleData) {
    return (
      <View style={{ flex: 1 }}>
        <VehicleScreen
          mode={mode}
          recentVehicles={recentVehicles}
          onSelectVehicle={handleSelectRecentVehicle}
          onClearRecent={clearRecentVehicles}
          onVehicle={(vData) => {
            saveRecentVehicle(vData.vehicle);
            setVehicleData(vData);
          }}
          onVehicleMissing={(regNum) => {
            setMissingVehicleReg(regNum);
          }}
          onBack={() => {
            setMode(null);
            setActiveTab('home');
          }}
        />

        {/* Bottom Navigation Tabs */}
        <View style={styles.bottomNavWrap}>
          <TouchableOpacity
            style={styles.navTabItem}
            onPress={() => {
              setMode(null);
              setActiveTab('home');
            }}
          >
            <Text style={[styles.navTabIcon, activeTab === 'home' && styles.navTabIconActive]}>
              🏠
            </Text>
            <Text style={[styles.navTabLabel, activeTab === 'home' && styles.navTabLabelActive]}>
              Home
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navTabItem}
            onPress={() => {
              loadSavedEstimates();
              setSavedScreen(true);
            }}
          >
            <Text style={[styles.navTabIcon, activeTab === 'estimates' && styles.navTabIconActive]}>
              📄
            </Text>
            <Text style={[styles.navTabLabel, activeTab === 'estimates' && styles.navTabLabelActive]}>
              Estimates
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navTabItem}
            onPress={() => {
              setActiveTab('vehicles');
              setMode('service');
            }}
          >
            <Text style={[styles.navTabIcon, activeTab === 'vehicles' && styles.navTabIconActive]}>
              🚛
            </Text>
            <Text style={[styles.navTabLabel, activeTab === 'vehicles' && styles.navTabLabelActive]}>
              Vehicles
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navTabItem}
            onPress={() => setSettingsScreen(true)}
          >
            <Text style={[styles.navTabIcon, activeTab === 'more' && styles.navTabIconActive]}>
              •••
            </Text>
            <Text style={[styles.navTabLabel, activeTab === 'more' && styles.navTabLabelActive]}>
              More
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Estimate creation / edit screen
  if (vehicleData) {
    return (
      <EstimateScreen
        mode={mode || 'service'}
        data={vehicleData}
        user={user}
        savedEstimate={editingSaved}
        onSaved={async (record) => {
          await saveLocalEstimate({ ...record, mode });
          setEditingSaved(null);
        }}
        onBack={() => {
          setEditingSaved(null);
          setVehicleData(null);
        }}
      />
    );
  }

  // Default: Dashboard / Home Screen with Bottom Navigation
  return (
    <View style={{ flex: 1 }}>
      <HomeScreen
        user={user}
        onSelectMode={(selectedMode) => {
          setActiveTab('vehicles');
          setMode(selectedMode);
        }}
        onOpenSaved={() => {
          loadSavedEstimates();
          setSavedScreen(true);
        }}
        onOpenSign={() => setSignatureScreen(true)}
        onSelectVehicle={handleSelectRecentVehicle}
        onOpenVehiclesList={() => {
          setActiveTab('vehicles');
          setMode('service');
        }}
        onLogout={async () => {
          await logout();
          setUser(null);
        }}
        onOpenSettings={() => setSettingsScreen(true)}
        recentVehicles={recentVehicles}
      />

      {/* Bottom Navigation Tabs */}
      <View style={styles.bottomNavWrap}>
        <TouchableOpacity
          style={styles.navTabItem}
          onPress={() => setActiveTab('home')}
        >
          <Text style={[styles.navTabIcon, activeTab === 'home' && styles.navTabIconActive]}>
            🏠
          </Text>
          <Text style={[styles.navTabLabel, activeTab === 'home' && styles.navTabLabelActive]}>
            Home
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTabItem}
          onPress={() => {
            loadSavedEstimates();
            setSavedScreen(true);
          }}
        >
          <Text style={[styles.navTabIcon, activeTab === 'estimates' && styles.navTabIconActive]}>
            📄
          </Text>
          <Text style={[styles.navTabLabel, activeTab === 'estimates' && styles.navTabLabelActive]}>
            Estimates
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTabItem}
          onPress={() => {
            setActiveTab('vehicles');
            setMode('service');
          }}
        >
          <Text style={[styles.navTabIcon, activeTab === 'vehicles' && styles.navTabIconActive]}>
            🚛
          </Text>
          <Text style={[styles.navTabLabel, activeTab === 'vehicles' && styles.navTabLabelActive]}>
            Vehicles
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navTabItem}
          onPress={() => setSettingsScreen(true)}
        >
          <Text style={[styles.navTabIcon, activeTab === 'more' && styles.navTabIconActive]}>
            •••
          </Text>
          <Text style={[styles.navTabLabel, activeTab === 'more' && styles.navTabLabelActive]}>
            More
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f3f6fb',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 4 : 0
  },
  container: {
    padding: 12,
    paddingBottom: 28
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  muted: {
    color: '#6b7785',
    marginTop: 6,
    fontSize: 12
  },

  // Login Screen Styles (matching media_1790756073109.jpg)
  loginContainer: {
    flex: 1,
    backgroundColor: '#e6f0fa'
  },
  loginScroll: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 14,
    paddingBottom: 24,
    alignItems: 'center'
  },
  loginHeaderWrap: {
    alignItems: 'center',
    marginBottom: 10,
    width: '100%'
  },
  loginHeaderImage: {
    width: 300,
    height: 150
  },
  loginTagline: {
    fontSize: 12,
    fontWeight: '800',
    color: '#083a6b',
    letterSpacing: 1.5,
    marginTop: -10
  },
  loginCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    shadowColor: '#03254c',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5
  },
  loginWelcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2
  },
  loginWelcomeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e4f0fc',
    borderWidth: 1,
    borderColor: '#c7def5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  loginWelcomeAvatarText: {
    fontSize: 18,
    color: '#0871c9'
  },
  loginWelcomeSub: {
    fontSize: 11,
    color: '#627d98',
    marginTop: 1
  },
  loginAccentBar: {
    width: 4,
    height: 24,
    backgroundColor: '#053775',
    borderRadius: 2,
    marginRight: 8
  },
  loginTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f2942'
  },
  loginSub: {
    fontSize: 12,
    color: '#627d98',
    marginTop: 3,
    marginBottom: 16,
    marginLeft: 12
  },
  inputGroup: {
    marginBottom: 12
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5
  },
  inputIconText: {
    fontSize: 12,
    marginRight: 5,
    color: '#053775'
  },
  inputLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334e68'
  },
  modernInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cfdae6',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 14,
    color: '#102a43'
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#d2dce6',
    borderRadius: 10
  },
  eyeIconBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  eyeIconText: {
    fontSize: 16
  },
  primaryLoginBtn: {
    backgroundColor: '#0875cf',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    elevation: 3,
    shadowColor: '#0875cf',
    shadowOpacity: 0.2,
    shadowRadius: 5
  },
  primaryLoginBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800'
  },
  orDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14
  },
  orDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#dce3eb'
  },
  orDividerText: {
    marginHorizontal: 10,
    fontSize: 11,
    fontWeight: '700',
    color: '#829ab1'
  },
  fingerprintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#3f82ba',
    borderRadius: 12,
    paddingVertical: 11
  },
  fingerprintIcon: {
    fontSize: 16,
    marginRight: 8
  },
  fingerprintText: {
    color: '#053775',
    fontSize: 14,
    fontWeight: '700'
  },
  forgotBtn: {
    marginTop: 14,
    alignItems: 'center'
  },
  forgotText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#053775'
  },
  loginTruckWrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 0,
    overflow: 'hidden'
  },
  loginTruckImage: {
    width: '100%',
    height: 128
  },
  loginFooterWrap: {
    marginTop: 2,
    alignItems: 'center'
  },
  loginFooterText: {
    fontSize: 11,
    color: '#486581',
    fontWeight: '600',
    textAlign: 'center'
  },

  // Home Dashboard Styles (matching media_1790756073301.jpg)
  homeSafe: {
    flex: 1,
    backgroundColor: '#f4f7fb'
  },
  homeScroll: {
    paddingBottom: 70
  },
  homeTopBar: {
    backgroundColor: '#0755a3',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 8 : 12,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  homeLogo: {
    width: 190,
    height: 78
  },
  homeHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  homeHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)'
  },
  homeHeaderIconText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800'
  },
  homeBrandBlock: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start'
  },
  homeBrandTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5
  },
  homeBrandSub: {
    fontSize: 10,
    color: '#d5e7fb',
    marginTop: -2,
    marginLeft: 3
  },
  greetingCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 14,
    marginTop: -14,
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
    shadowColor: '#0b3868',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#edf2f7'
  },
  greetingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e1effc',
    borderWidth: 1,
    borderColor: '#cce2f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  avatarText: {
    fontSize: 20
  },
  greetingSub: {
    fontSize: 10,
    color: '#627d98',
    fontWeight: '600'
  },
  greetingName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#102a43'
  },
  greetingHint: {
    fontSize: 10,
    color: '#829ab1',
    marginTop: 1
  },
  quickVehiclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eaf2fa',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c6daf0'
  },
  quickVehiclePillIcon: {
    fontSize: 16,
    marginRight: 6
  },
  quickVehiclePillLabel: {
    fontSize: 9,
    color: '#053775',
    fontWeight: '700'
  },
  quickVehiclePillReg: {
    fontSize: 11,
    fontWeight: '900',
    color: '#053775',
    maxWidth: 75
  },

  createEstimateBanner: {
    backgroundColor: '#075fbd',
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 18,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#075fbd',
    shadowOpacity: 0.18,
    shadowRadius: 8
  },
  bannerIconSquare: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  bannerIconText: {
    fontSize: 22
  },
  bannerTextCol: {
    flex: 1
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff'
  },
  bannerSub: {
    fontSize: 11,
    color: '#c2daf5',
    lineHeight: 15,
    marginTop: 2
  },
  bannerArrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8
  },
  bannerArrowText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#053775'
  },

  quickMenuWrap: {
    marginHorizontal: 14,
    marginTop: 20
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#123b62',
    marginBottom: 10
  },
  quickMenuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  quickMenuItem: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e6edf5',
    elevation: 3,
    shadowColor: '#1f4f7a',
    shadowOpacity: 0.07,
    shadowRadius: 5,
    alignItems: 'flex-start'
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: '#e8f3ff',
    borderWidth: 1,
    borderColor: '#d4e8fa',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9
  },
  menuIconText: {
    fontSize: 18
  },
  menuItemTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#163a5d'
  },

  recentVehiclesSection: {
    marginHorizontal: 14,
    marginTop: 14
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#053775'
  },
  recentVehicleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e3ebf4',
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2
  },
  recentVehicleIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#e6effa',
    alignItems: 'center',
    justifyContent: 'center'
  },
  recentVehicleIconText: {
    fontSize: 20
  },
  recentVehicleReg: {
    fontSize: 14,
    fontWeight: '800',
    color: '#053775'
  },
  recentVehicleDetail: {
    fontSize: 10,
    color: '#486581',
    marginTop: 1
  },
  recentVehicleArrow: {
    fontSize: 18,
    fontWeight: '800',
    color: '#9fb3c8',
    marginLeft: 6
  },
  emptyRecentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  emptyRecentIcon: {
    fontSize: 28,
    marginBottom: 6
  },
  emptyRecentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334e68'
  },
  emptyRecentSub: {
    fontSize: 11,
    color: '#829ab1',
    textAlign: 'center',
    marginTop: 3
  },

  homeFooterStrip: {
    backgroundColor: '#0755a3',
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  footerStripBrand: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },
  footerStripMotto: {
    color: '#d8e8f7',
    fontSize: 10,
    fontWeight: '700'
  },

  // Bottom Navigation Bar
  bottomNavWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 62,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e1eaf3',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    elevation: 10,
    shadowColor: '#173b5d',
    shadowOpacity: 0.08,
    shadowRadius: 6
  },
  navTabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1
  },
  navTabIcon: {
    fontSize: 18,
    color: '#829ab1'
  },
  navTabIconActive: {
    color: '#053775'
  },
  navTabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#829ab1',
    marginTop: 2
  },
  navTabLabelActive: {
    color: '#053775',
    fontWeight: '800'
  },

  // Vehicle Screen & Missing Vehicle Screen
  vehicleSearchCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#d2dce6'
  },
  fieldLabelBig: {
    fontSize: 13,
    fontWeight: '800',
    color: '#102a43',
    marginBottom: 8
  },
  largeRegInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#053775',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '800',
    color: '#053775',
    letterSpacing: 1.2,
    marginBottom: 12
  },
  infoBanner: {
    backgroundColor: '#e8f2fc',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#c6daf0'
  },
  infoBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#053775',
    marginBottom: 3
  },

  missingRegCard: {
    backgroundColor: '#e6effa',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#99bde4'
  },
  missingRegLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#486581',
    letterSpacing: 0.8
  },
  missingRegValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#053775',
    letterSpacing: 1,
    marginVertical: 4
  },
  missingRegHint: {
    fontSize: 11,
    color: '#334e68',
    lineHeight: 15
  },
  modelScrollContainer: {
    height: 200,
    borderWidth: 1,
    borderColor: '#d6dde4',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 4
  },
  modelItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 7,
    marginBottom: 4,
    backgroundColor: '#f8fbfe'
  },
  modelItemRowSelected: {
    backgroundColor: '#e3effd',
    borderWidth: 1,
    borderColor: '#053775'
  },
  modelRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#829ab1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  modelRadioSelected: {
    borderColor: '#053775'
  },
  modelRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#053775'
  },
  modelItemText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102a43',
    flex: 1
  },
  modelItemTextSelected: {
    color: '#053775',
    fontWeight: '800'
  },
  modelItemTag: {
    fontSize: 10,
    fontWeight: '600',
    color: '#627d98',
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },

  // Estimate Screen Styles (matching media_1790756073139.jpg)
  estimateHeaderBar: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    elevation: 2
  },
  estimateBackBtn: {
    padding: 6
  },
  estimateBackArrow: {
    fontSize: 22,
    fontWeight: '900',
    color: '#053775'
  },
  estimateHeaderTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#053775'
  },
  estimateHeaderSub: {
    fontSize: 9,
    color: '#627d98'
  },
  estimateHeaderFleetText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#053775',
    fontStyle: 'italic',
    maxWidth: 90,
    textAlign: 'right'
  },
  vehicleDetailsCard: {
    backgroundColor: '#e7f1fa',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#c6daf0'
  },
  vehicleCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  vehicleCardIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#053775',
    alignItems: 'center',
    justifyContent: 'center'
  },
  vehicleCardIconText: {
    fontSize: 22
  },
  vehicleCardLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#486581'
  },
  vehicleCardReg: {
    fontSize: 18,
    fontWeight: '900',
    color: '#053775'
  },
  alHeavyVehicleBadge: {
    backgroundColor: '#053775',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'flex-end'
  },
  alHeavyVehicleText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800'
  },
  alHeavyVehicleSub: {
    color: '#c2daf5',
    fontSize: 8,
    fontWeight: '600'
  },
  vehicleMetaGrid: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 8
  },
  vehicleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2
  },
  metaLabel: {
    width: 85,
    fontSize: 11,
    color: '#486581',
    fontWeight: '600'
  },
  metaColon: {
    marginRight: 6,
    color: '#627d98',
    fontWeight: '700'
  },
  metaVal: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#102a43'
  },

  aggregateListWrap: {
    marginTop: 6
  },
  aggregateRowNew: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dce3eb',
    backgroundColor: '#ffffff',
    marginBottom: 6
  },
  aggregateRowNewSelected: {
    borderColor: '#053775',
    backgroundColor: '#eef5fc'
  },
  aggRadioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#829ab1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  aggRadioCircleActive: {
    borderColor: '#053775'
  },
  aggRadioInnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#053775'
  },
  aggIconDisplay: {
    fontSize: 15,
    marginRight: 8
  },
  aggLabelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102a43',
    flex: 1
  },
  aggLabelTextActive: {
    color: '#053775',
    fontWeight: '800'
  },
  aggChevron: {
    fontSize: 16,
    color: '#9fb3c8',
    fontWeight: '800'
  },

  partsCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2'
  },
  labourCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#ef7d22'
  },
  partCardEmoji: {
    fontSize: 16,
    marginRight: 6
  },

  // Base shared styles
  button: {
    backgroundColor: '#053775',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 4
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#053775'
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  secondaryText: {
    color: '#053775'
  },
  disabled: {
    opacity: 0.5
  },
  field: {
    marginBottom: 8
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#425466',
    marginBottom: 4
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d6dde4',
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontSize: 13,
    color: '#17324d'
  },
  passwordInput: {
    color: '#17324d'
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#12304a',
    marginBottom: 4
  },
  sectionHint: {
    color: '#71808f',
    fontSize: 10,
    marginTop: -2,
    marginBottom: 6
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  heading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#12304a'
  },
  helper: {
    color: '#607080',
    marginBottom: 8,
    marginTop: 2,
    fontSize: 11
  },
  back: {
    color: '#c46b17',
    fontWeight: '800',
    fontSize: 12
  },
  add: {
    fontWeight: '800',
    fontSize: 11
  },
  partAdd: {
    color: '#1976d2'
  },
  labourAdd: {
    color: '#ef7d22'
  },
  empty: {
    color: '#8793a0',
    paddingVertical: 6,
    fontSize: 11
  },

  // ItemCard
  itemCard: {
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderWidth: 1
  },
  partItemCard: {
    backgroundColor: '#f4f9ff',
    borderColor: '#cfe3fa'
  },
  labourItemCard: {
    backgroundColor: '#fff8f0',
    borderColor: '#f4d5b8'
  },
  itemTitle: {
    fontWeight: '800',
    color: '#12304a',
    fontSize: 12
  },
  delete: {
    color: '#b3261e',
    fontWeight: '700',
    fontSize: 10
  },
  itemHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  badge: {
    fontSize: 8,
    fontWeight: '900',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8
  },
  autoBadge: {
    backgroundColor: '#e7f1f7',
    color: '#12304a'
  },
  manualBadge: {
    backgroundColor: '#fff0e2',
    color: '#a75b12'
  },
  partInfoRow: {
    flexDirection: 'row',
    gap: 7
  },
  partNoCol: {
    flex: 1
  },
  descriptionCol: {
    flex: 2
  },
  twoCol: {
    flexDirection: 'row',
    gap: 7
  },
  col: {
    flex: 1
  },
  lineAmount: {
    fontWeight: '900',
    marginTop: 3,
    fontSize: 14,
    color: '#12304a'
  },
  source: {
    fontSize: 9,
    color: '#71808f',
    marginTop: 2
  },

  // Totals & Locked Box
  totalCard: {
    backgroundColor: '#053775',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  totalLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  total: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900'
  },
  totalHint: {
    color: '#dbe5ec',
    fontSize: 9,
    marginTop: 2
  },
  incompleteBox: {
    backgroundColor: '#fff4e5',
    borderWidth: 1,
    borderColor: '#f0b45b',
    borderRadius: 8,
    padding: 10,
    marginTop: 10
  },
  incompleteTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#9a5b00'
  },
  incompleteText: {
    fontSize: 10,
    color: '#795548',
    lineHeight: 14,
    marginTop: 3
  },
  disclaimerBox: {
    borderTopWidth: 1,
    borderTopColor: '#d6dde4',
    paddingTop: 8,
    marginTop: 14
  },
  disclaimerText: {
    fontSize: 9,
    color: '#71808f',
    lineHeight: 13,
    textAlign: 'center'
  },
  disclaimerSubText: {
    fontSize: 9,
    color: '#053775',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4
  },

  // Saved rows
  savedRow: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d6dde4',
    borderRadius: 9,
    padding: 11,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  savedVehicle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#12304a'
  },
  savedEstimateNo: {
    fontSize: 11,
    fontWeight: '700',
    color: '#425466',
    marginTop: 2
  },
  savedDate: {
    fontSize: 9,
    color: '#71808f',
    marginTop: 3
  },
  savedOpen: {
    color: '#053775',
    fontWeight: '800',
    fontSize: 12
  },

  // Update screen
  updateWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 16
  },
  updateCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#d6dde4',
    elevation: 3
  },
  updateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e8f2ff',
    color: '#1456c0',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 46,
    alignSelf: 'center',
    marginBottom: 10
  },
  updateTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#12304a',
    textAlign: 'center'
  },
  updateText: {
    fontSize: 12,
    color: '#607080',
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6
  },
  updateVersionBox: {
    backgroundColor: '#f3f7fb',
    borderRadius: 9,
    padding: 10,
    marginTop: 14
  },
  updateVersionLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#71808f',
    textAlign: 'center'
  },
  updateVersion: {
    fontSize: 14,
    fontWeight: '900',
    color: '#12304a',
    textAlign: 'center',
    marginTop: 2
  },
  updateNotes: {
    fontSize: 10,
    color: '#607080',
    lineHeight: 15,
    marginTop: 10,
    textAlign: 'center'
  },
  updateHint: {
    fontSize: 9,
    color: '#8a959f',
    lineHeight: 13,
    textAlign: 'center',
    marginTop: 8
  },

  // Signature
  signaturePreview: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#d6dde4',
    alignItems: 'center'
  },
  signatureImage: {
    width: '100%',
    height: 80,
    backgroundColor: '#ffffff'
  },
  letterheadPreview: {
    width: '100%',
    height: 180,
    resizeMode: 'contain',
    backgroundColor: '#ffffff'
  },
  signatureSaved: {
    fontSize: 10,
    color: '#2e7d32',
    fontWeight: '800',
    marginTop: 5
  },
  signaturePad: {
    width: '100%',
    height: 150,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#8d99a6',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative'
  },
  signaturePadFull: {
    height: '100%',
    borderWidth: 2,
    borderColor: '#65798b',
    borderRadius: 4
  },
  signatureTapBox: {
    width: '100%',
    height: 90,
    borderWidth: 1,
    borderColor: '#d0d8df',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden'
  },
  signatureTapText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8a969f'
  },
  signatureFullScreen: {
    flex: 1,
    backgroundColor: '#e9eef3',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0
  },
  signatureFullHeader: {
    height: 58,
    backgroundColor: '#053775',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16
  },
  signatureFullBack: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  signatureFullTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900'
  },
  signatureFullSave: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900'
  },
  signatureFullControls: {
    backgroundColor: '#ffffff',
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  signatureFullLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#425466',
    marginRight: 2
  },
  signatureClearSmall: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#b3261e',
    borderRadius: 7,
    marginLeft: 'auto'
  },
  signatureClearSmallText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#b3261e'
  },
  signatureFullPadWrap: {
    flex: 1,
    padding: 10
  },
  signatureFullHint: {
    fontSize: 10,
    color: '#607080',
    textAlign: 'center',
    paddingVertical: 7
  },
  strokeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#c7d0da',
    backgroundColor: '#ffffff'
  },
  strokeButtonSelected: {
    borderColor: '#1456c0',
    backgroundColor: '#eaf1ff'
  },
  strokeButtonText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#425466'
  },
  strokeButtonTextSelected: {
    color: '#1456c0'
  },
  descriptionReadOnly: {
    justifyContent: 'center',
    overflow: 'hidden'
  },
  descriptionReadOnlyText: {
    color: '#17212b',
    fontSize: 14,
    textAlign: 'left'
  },
  signatureStroke: {
    position: 'absolute'
  },
  signaturePadHint: {
    position: 'absolute',
    alignSelf: 'center',
    top: 65,
    color: '#b0b7bf',
    fontSize: 12,
    fontWeight: '700'
  },
  signaturePadStatus: {
    fontSize: 9,
    color: '#71808f',
    marginTop: 4
  }
});
