import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = 'https://service-decision-engine.vercel.app';

const TOKEN_KEY = 'service_estimate_auth_token';
const USER_KEY = 'service_estimate_user';
const SECURE_TOKEN_KEY = 'service_estimate_secure_token';
const BIOMETRIC_CREDS_KEY = 'service_estimate_biometric_credentials';

async function request(path, options = {}, tokenOverride = null) {
  const token = tokenOverride || await AsyncStorage.getItem(TOKEN_KEY);
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer $token`;

  const response = await fetch(`$path`, {
    ...options,
    headers
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || 'Invalid server response.' }; }

  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function login(identifier, password, terminateExistingSession = false) {
  const data = await request('/api/auth', {
    method: 'POST',
    body: JSON.stringify({
      action: 'login',
      identifier,
      password,
      deviceName: 'Service Estimate Android',
      terminateExistingSession
    })
  });
  await AsyncStorage.setItem(TOKEN_KEY, data.token);
  try { await SecureStore.setItemAsync(SECURE_TOKEN_KEY, data.token); } catch {}
  try {
    await SecureStore.setItemAsync(
      BIOMETRIC_CREDS_KEY,
      JSON.stringify({ identifier, password })
    );
  } catch {}
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user || {}));
  return data;
}

export async function logout() {
  try { await request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }); } catch {}
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  try { await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY); } catch {}
}

export async function clearBiometricCredentials() {
  try { await SecureStore.deleteItemAsync(BIOMETRIC_CREDS_KEY); } catch {}
}

export async function getBiometricCredentials() {
  try {
    const raw = await SecureStore.getItemAsync(BIOMETRIC_CREDS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function restoreSession(tokenOverride = null) {
  const token = tokenOverride || await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const data = await request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'me' }) }, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user || {}));
    return data.user || null;
  } catch {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    return null;
  }
}

export async function getSecureSessionToken() {
  try {
    const sec = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
    if (sec) return sec;
  } catch {}
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function getVehicleByRegistration(registration) {
  const value = String(registration || '').replace(/\s+/g, '').toUpperCase();
  if (!value) throw new Error('Vehicle number is required.');
  return request(`/api/save-history?registration=${encodeURIComponent(value)}`);
}

export async function getPartRate(partNo) {
  const value = String(partNo || '').replace(/\s+/g, '').toUpperCase();
  if (!value) return { success: true, part: null };
  return request(`/api/save-history?partNo=${encodeURIComponent(value)}`);
}

export async function saveEstimate(payload) {
  return request('/api/estimates', {
    method: 'POST',
    body: JSON.stringify({ action: 'save', ...payload })
  });
}

export async function listEstimates() {
  return request('/api/estimates', {
    method: 'POST',
    body: JSON.stringify({ action: 'list' })
  });
}

export async function getSavedEstimate(id) {
  return request('/api/estimates', {
    method: 'POST',
    body: JSON.stringify({ action: 'get', id })
  });
}