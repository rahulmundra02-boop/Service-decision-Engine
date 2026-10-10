import React from 'react';
import { Linking, SafeAreaView, StatusBar, StyleSheet, Text, Pressable, View } from 'react-native';

const WEBSITE_URL = 'https://service-decision-engine.vercel.app/';

export default function App() {
  const openWebsite = async () => {
    try {
      await Linking.openURL(WEBSITE_URL);
    } catch {
      // Keep the discontinued notice visible if the browser cannot be opened.
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
        <Text style={styles.heading}>Application Discontinued</Text>
        <Text style={styles.message}>
          This application has been officially discontinued by the administrator and can no longer be used.
        </Text>
        <Text style={styles.detail}>
          To continue using Service Decision Engine, please visit our official website. The website provides faster performance, more features, and more accurate estimates.
        </Text>
        <Pressable accessibilityRole="button" onPress={openWebsite} style={styles.button}>
          <Text style={styles.buttonText}>OPEN OFFICIAL WEBSITE</Text>
        </Pressable>
        <Text style={styles.url}>service-decision-engine.vercel.app</Text>
      </View>
      <Text style={styles.footer}>This application is no longer supported.</Text>
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
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20
  },
  icon: { color: '#B91C1C', fontSize: 36, fontWeight: '800', lineHeight: 42 },
  brand: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textAlign: 'center',
    marginBottom: 12
  },
  heading: {
    color: '#0F172A',
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 14
  },
  message: {
    color: '#334155',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 12
  },
  detail: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24
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
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  url: { color: '#166534', fontSize: 12, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  footer: { color: '#94A3B8', fontSize: 12, marginTop: 22, textAlign: 'center' }
});
