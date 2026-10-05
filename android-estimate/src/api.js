import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = 'https://service-decision-engine.vercel.app';

const TOKEN_KEY = 'service_estimate_auth_token';
const USER_KEY = 'service_estimate_user';
const SECURE_TOKEN_KEY = 'service_estimate_secure_token';
const BIOMETRIC_CREDS_KEY = 'service_estimate_biometric_credentials';
const PRICE_MASTER_KEY = '@service_estimate_price_master_v2';
const VEHICLE_CACHE_PREFIX = '@service_estimate_vehicle_cache_v1_';
const VEHICLE_CACHE_TTL = 30 * 60 * 1000;
let priceMasterMemoryCache = null;
let priceMasterSyncPromise = null;

function normalizePartCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/\([A-Z0-9]+\)$/i, '')
    .trim();
}

export async function syncPartsMaster() {
  if (priceMasterSyncPromise) return priceMasterSyncPromise;

  priceMasterSyncPromise = (async () => {
  let local = {};
  try {
    const raw = await AsyncStorage.getItem(PRICE_MASTER_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    local = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {}

  const currentVersion = Number(local.version || 0);
  try {
    const data = await request('/api/save-history?priceMaster=1&version=' + encodeURIComponent(currentVersion));
    if (data?.unchanged) {
      priceMasterMemoryCache = local?.parts || {};
      return local;
    }
    if (!data?.success) {
      priceMasterMemoryCache = local?.parts || {};
      return local;
    }
    const parts = {};
    (data.parts || []).forEach((item) => {
      const code = normalizePartCode(item?.partNo);
      if (!code) return;
      parts[code] = {
        partNo: code,
        description: String(item?.description || ''),
        mrp: Number(item?.mrp || 0)
      };
    });
    const next = {
      version: Number(data.version || 0),
      parts
    };
    await AsyncStorage.setItem(PRICE_MASTER_KEY, JSON.stringify(next));
    priceMasterMemoryCache = parts;
    return next;
  } catch {
    priceMasterMemoryCache = local?.parts || {};
    return local;
  } finally {
    priceMasterSyncPromise = null;
  }
  })();

  return priceMasterSyncPromise;
}

export async function readPartsMaster() {
  if (priceMasterMemoryCache) {
    return { version: 0, parts: priceMasterMemoryCache };
  }
  try {
    const raw = await AsyncStorage.getItem(PRICE_MASTER_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const result = parsed && typeof parsed === 'object' ? parsed : {};
    priceMasterMemoryCache = result?.parts || {};
    return result;
  } catch {
    return {};
  }
}

export function getCachedPriceMaster() {
  return priceMasterMemoryCache || {};
}

export function getCachedPriceMasterPart(partNo) {
  const code = normalizePartCode(partNo);
  return code ? priceMasterMemoryCache?.[code] || null : null;
}


// --- IN-MEMORY SPEED CACHES ---
const MODEL_CACHE_PREFIX = '@cache_model_';
const MODEL_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const modelMemoryCache = new Map();
const vehicleMemoryCache = new Map();
const partRateMemoryCache = new Map();

async function request(path, options = {}, tokenOverride = null) {
  const token = tokenOverride || (await AsyncStorage.getItem(TOKEN_KEY));
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) headers.Authorization = 'Bearer ' + token;

  const url = API_BASE_URL + path;
  const response = await fetch(url, {
    ...options,
    headers
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || 'Invalid server response.' };
  }

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed (' + response.status + ')');
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
  try {
    await SecureStore.setItemAsync(SECURE_TOKEN_KEY, data.token);
  } catch {}
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
  try {
    await request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) });
  } catch {}
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  try {
    await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
  } catch {}
  modelMemoryCache.clear();
  vehicleMemoryCache.clear();
  partRateMemoryCache.clear();
}

export async function clearBiometricCredentials() {
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_CREDS_KEY);
  } catch {}
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
  const token = tokenOverride || (await AsyncStorage.getItem(TOKEN_KEY));
  if (!token) return null;
  try {
    const data = await request(
      '/api/auth',
      { method: 'POST', body: JSON.stringify({ action: 'me' }) },
      token
    );
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

  // Check memory cache first (0 ms).
  const mem = vehicleMemoryCache.get(value);
  if (mem && Date.now() - mem.ts < VEHICLE_CACHE_TTL) {
    return mem.data;
  }

  // Then check the persistent recent-vehicle cache. This is the important
  // fast path for tapping the last searched vehicle after an app restart.
  try {
    const cachedRaw = await AsyncStorage.getItem(VEHICLE_CACHE_PREFIX + value);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached?.data?.vehicle && Date.now() - Number(cached.ts || 0) < VEHICLE_CACHE_TTL) {
        const currentMaster = await readPartsMaster();
        const cachedData = {
          ...cached.data,
          priceMaster: currentMaster?.parts || cached.data.priceMaster || {},
          priceMasterVersion: Number(currentMaster?.version || cached.data.priceMasterVersion || 0)
        };
        vehicleMemoryCache.set(value, { data: cachedData, ts: Date.now() });
        if (cachedData.model) {
          const modelClean = String(cachedData.model).trim().toUpperCase();
          modelMemoryCache.set(modelClean, {
            modelRows: Array.isArray(cachedData.modelRows) ? cachedData.modelRows : [],
            globalPartRates: Array.isArray(cachedData.globalPartRates) ? cachedData.globalPartRates : [],
            ts: Date.now()
          });
        }
        return cachedData;
      }
    }
  } catch {}

  // The unified Parts Master cache is the only local part catalog.
  // It contains Part No + Description + MRP and is version controlled.
  const master = await readPartsMaster();
  const masterParts = master?.parts || {};
  const serviceCodes = Object.keys(masterParts);
  const compactQuery = serviceCodes.length
    ? '&mobileEstimate=1&serviceParts=' + encodeURIComponent(serviceCodes.join(','))
    : '';
  const rawData = await request(
    '/api/save-history?registration=' + encodeURIComponent(value) + compactQuery
  );
  const data = rawData && typeof rawData === 'object' ? { ...rawData } : {};
  data.rows = Array.isArray(data.rows) ? data.rows.map((row) => {
    const code = normalizePartCode(row?.part_code);
    const cached = code ? masterParts[code] : null;
    if (!cached) return row;
    return {
      ...row,
      part_description: row?.part_description || cached.description || '',
      standardized_part: row?.standardized_part || cached.description || ''
    };
  }) : [];
  data.modelRows = Array.isArray(data.modelRows) ? data.modelRows.map((row) => {
    const code = normalizePartCode(row?.part_code);
    const cached = code ? masterParts[code] : null;
    if (!cached) return row;
    return {
      ...row,
      part_description: row?.part_description || cached.description || '',
      standardized_part: row?.standardized_part || cached.description || ''
    };
  }) : [];
  data.priceMaster = masterParts;
  data.priceMasterVersion = Number(master?.version || 0);

  if (data?.vehicle) {
    vehicleMemoryCache.set(value, { data, ts: Date.now() });
    // Persist the compact mobile vehicle response so recent-vehicle selection
    // can render immediately without waiting for the network.
    AsyncStorage.setItem(
      VEHICLE_CACHE_PREFIX + value,
      JSON.stringify({ data, ts: Date.now() })
    ).catch(() => {});

    // Pre-cache only the compact model quantity/rate history for instant aggregate selection.
    if (data.model) {
      const modelClean = String(data.model).trim().toUpperCase();
      const modelEntry = {
        modelRows: Array.isArray(data.modelRows) ? data.modelRows : [],
        globalPartRates: Array.isArray(data.globalPartRates) ? data.globalPartRates : [],
        ts: Date.now()
      };
      modelMemoryCache.set(modelClean, modelEntry);
      AsyncStorage.setItem(MODEL_CACHE_PREFIX + modelClean, JSON.stringify(modelEntry)).catch(() => {});
    }
  }
  return data;
}

export async function getPartRate(partNo) {
  const value = normalizePartCode(partNo);
  if (!value) return { success: true, part: null };

  // Price Master is the primary rate source. Read the complete local cache
  // first so normal part lookups never wait for the network.
  try {
    const local = await readPartsMaster();
    const master = local?.parts?.[value];
    const mrp = Number(master?.mrp || 0);
    if (master && mrp > 0) {
      return {
        success: true,
        part: {
          partNo: master.partNo || value,
          description: master.description || '',
          mrp,
          rateInclGst: mrp,
          rate: Number((mrp / 1.18).toFixed(2))
        }
      };
    }
  } catch {}

  // Only when the part is not present in the local master, use the live
  // Price Master as a fallback. This is not the normal path.
  try {
    const liveMaster = await request(
      '/api/save-history?priceMasterPart=1&partNo=' + encodeURIComponent(value)
    );
    const mrp = Number(liveMaster?.part?.mrp || 0);
    if (liveMaster?.success && liveMaster?.part && mrp > 0) {
      return {
        success: true,
        part: {
          partNo: liveMaster.part.partNo || value,
          description: liveMaster.part.description || '',
          mrp,
          rateInclGst: mrp,
          rate: Number((mrp / 1.18).toFixed(2))
        }
      };
    }
  } catch {}

  // Historical DB is the final fallback only when Price Master has no entry.
  try {
    return await request('/api/save-history?partNo=' + encodeURIComponent(value));
  } catch {
    return { success: false, part: null };
  }
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

export async function getModelList() {
  const CACHE_KEY = '@cache_models_list';
  // 1. Try local storage cache first
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.models) && parsed.models.length > 0 && Date.now() - parsed.ts < MODEL_CACHE_TTL) {
        // Return cached list immediately!
        // Background refresh if older than 2 hours
        if (Date.now() - parsed.ts > 2 * 60 * 60 * 1000) {
          request('/api/save-history?models=1').then((fresh) => {
            if (Array.isArray(fresh?.models) && fresh.models.length > 0) {
              AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ models: fresh.models, ts: Date.now() })).catch(() => {});
            }
          }).catch(() => {});
        }
        return parsed.models;
      }
    }
  } catch {}

  // 2. Network fetch
  try {
    const data = await request('/api/save-history?models=1');
    if (data?.models && Array.isArray(data.models)) {
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ models: data.models, ts: Date.now() })).catch(() => {});
      return data.models;
    }
  } catch {}
  return [];
}

export async function getServiceDataByModel(model, registration = '', customerName = '') {
  const m = String(model || '').trim();
  const mKey = m.toUpperCase();
  const reg = String(registration || '').replace(/\s+/g, '').toUpperCase();
  const cust = String(customerName || '').trim();
  const storageKey = MODEL_CACHE_PREFIX + mKey;

  // 1. Check in-memory cache first (Instant 0 ms!)
  const mem = modelMemoryCache.get(mKey);
  if (mem && Date.now() - mem.ts < MODEL_CACHE_TTL) {
    return {
      success: true,
      rows: [],
      model: m,
      priceMaster: (await readPriceMaster())?.parts || {},
      modelRows: mem.modelRows,
      globalPartRates: mem.globalPartRates,
      vehicle: {
        registration: reg,
        model: m,
        customer_name: cust
      },
      missingVehicle: true
    };
  }

  // 2. Check AsyncStorage persistent cache (Fast ~5 ms!)
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Date.now() - (parsed.ts || 0) < MODEL_CACHE_TTL) {
        modelMemoryCache.set(mKey, parsed);
        return {
          success: true,
          rows: [],
          model: m,
          priceMaster: (await readPriceMaster())?.parts || {},
          modelRows: Array.isArray(parsed.modelRows) ? parsed.modelRows : [],
          globalPartRates: Array.isArray(parsed.globalPartRates) ? parsed.globalPartRates : [],
          vehicle: {
            registration: reg,
            model: m,
            customer_name: cust
          },
          missingVehicle: true
        };
      }
    }
  } catch {}

  // 3. Network fetch
  try {
    const data = await request('/api/save-history?model=' + encodeURIComponent(m));
    const modelRows = Array.isArray(data?.modelRows) ? data.modelRows : [];
    const globalPartRates = Array.isArray(data?.globalPartRates) ? data.globalPartRates : [];

    // Save in memory + AsyncStorage cache for fast subsequent loads
    const cacheEntry = { modelRows, globalPartRates, ts: Date.now() };
    modelMemoryCache.set(mKey, cacheEntry);
    AsyncStorage.setItem(storageKey, JSON.stringify(cacheEntry)).catch(() => {});

    return {
      success: true,
      rows: [],
      model: m,
      priceMaster: (await readPriceMaster())?.parts || {},
      modelRows,
      globalPartRates,
      vehicle: {
        registration: reg,
        model: m,
        customer_name: cust
      },
      missingVehicle: true
    };
  } catch (err) {
    // If network fails, fallback to stale cache if available
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          success: true,
          rows: [],
          model: m,
          priceMaster: (await readPriceMaster())?.parts || {},
          modelRows: Array.isArray(parsed.modelRows) ? parsed.modelRows : [],
          globalPartRates: Array.isArray(parsed.globalPartRates) ? parsed.globalPartRates : [],
          vehicle: {
            registration: reg,
            model: m,
            customer_name: cust
          },
          missingVehicle: true
        };
      }
    } catch {}

    return {
      success: true,
      rows: [],
      model: m,
      priceMaster: (await readPriceMaster())?.parts || {},
      modelRows: [],
      globalPartRates: [],
      vehicle: {
        registration: reg,
        model: m,
        customer_name: cust
      },
      missingVehicle: true
    };
  }
}


// Compatibility aliases. The app now uses one unified, versioned Parts Master cache.
export const syncPriceMaster = syncPartsMaster;
export const readPriceMaster = readPartsMaster;
