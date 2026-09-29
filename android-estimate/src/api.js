import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = 'https://service-decision-engine.vercel.app';

const TOKEN_KEY = 'service_estimate_auth_token';
const USER_KEY = 'service_estimate_user';
const SECURE_TOKEN_KEY = 'service_estimate_secure_token';

async function request(path, options = {}) {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
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

export async function login(identifier, password) {
  const data = await request('/api/auth', {
    method: 'POST',
    body: JSON.stringify({
      action: 'login',
      identifier,
      password,
      deviceName: 'Service Estimate Android'
    })
  });
  await AsyncStorage.setItem(TOKEN_KEY, data.token);
  try { await SecureStore.setItemAsync(SECURE_TOKEN_KEY, data.token, { requireAuthentication: true, authenticationPrompt: 'Authenticate to unlock Service Estimate' }); } catch {}
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user || {}));
  return data;
}

export async function logout() {
  try { await request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }); } catch {}
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  try { await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY); } catch {}
}

export async function restoreSession(tokenOverride = null) {
  const token = tokenOverride || await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const data = await request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'me' }) });
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user || {}));
    return data.user || null;
  } catch {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    return null;
  }
}

export async function getSecureSessionToken() {
  try { return await SecureStore.getItemAsync(SECURE_TOKEN_KEY); } catch { return null; }
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
