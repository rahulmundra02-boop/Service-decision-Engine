import React from 'react';
import { Linking, SafeAreaView, StatusBar, StyleSheet, Text, Pressable, View } from 'react-native';

const WEBSITE_URL = 'https://service-decision-engine.vercel.app/';

export default function App() {
  const openWebsite = async () => {
    try {
      await Linking.openURL(WEBSITE_URL);
    } catch {
      // Keep the website address visible if opening the browser fails.
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>!</Text>
        </View>
        <Text style={styles.brand}>SERVICE DECISION ENGINE</Text>
        <Text style={styles.heading}>Android App Discontinued</Text>
        <Text style={styles.message}>
          This Android app is no longer available. Please use our official website for service estimates.
        </Text>
        <View style={styles.benefits}>
          <Text style={styles.benefit}>• Faster performance</Text>
          <Text style={styles.benefit}>• Accurate service estimates</Text>
          <Text style={styles.benefit}>• Reliable, up-to-date information</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open official Service Decision Engine website"
          onPress={openWebsite}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>OPEN OFFICIAL WEBSITE ↗</Text>
        </Pressable>
        <Text style={styles.url}>service-decision-engine.vercel.app</Text>
      </View>
      <Text style={styles.footer}>Thank you for using Service Decision Engine.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 26,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18
  },
  icon: { color: '#B91C1C', fontSize: 34, fontWeight: '800', lineHeight: 40 },
  brand: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 12
  },
  heading: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12
  },
  message: {
    color: '#334155',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16
  },
  benefits: {
    alignSelf: 'stretch',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 22
  },
  benefit: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 24,
    fontWeight: '600'
  },
  button: {
    width: '100%',
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#166534',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14
  },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  url: { color: '#166534', fontSize: 12, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  footer: { color: '#94A3B8', fontSize: 12, marginTop: 20, textAlign: 'center' }
});
