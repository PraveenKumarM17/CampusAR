import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {api, ApiError} from '../../api/api';
import {useAuthStore} from '../../stores/authStore';
import {useSiteStore} from '../../stores/siteStore';

type Props = {
  onSignedIn: () => void;
};

export function LoginScreen({onSignedIn}: Props) {
  const setSession = useAuthStore(s => s.setSession);
  const setActiveSiteId = useSiteStore(s => s.setActiveSiteId);
  const [email, setEmail] = useState('admin@smartcampus.edu');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function finishAuth(res: Awaited<ReturnType<typeof api.login>>) {
    setSession(res.user, res.tokens.accessToken, res.tokens.refreshToken);
    const sites = await api.sites(res.tokens.accessToken);
    if (sites.length > 0) {
      setActiveSiteId(sites[0].id);
    }
    onSignedIn();
  }

  async function onGuest() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.guest('Mobile Guest');
      await finishAuth(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Guest access failed');
    } finally {
      setLoading(false);
    }
  }

  async function onLogin() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(email.trim(), password);
      await finishAuth(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CampusAR</Text>
      <Text style={styles.subtitle}>Native AR measurement and campus tools</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        secureTextEntry
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
      />
      <Pressable style={styles.primaryBtn} onPress={onLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Sign in</Text>}
      </Pressable>
      <Pressable style={styles.secondaryBtn} onPress={onGuest} disabled={loading}>
        <Text style={styles.secondaryText}>Continue as guest</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#0f172a'},
  title: {fontSize: 32, fontWeight: '700', color: '#f8fafc'},
  subtitle: {marginTop: 8, marginBottom: 24, color: '#94a3b8'},
  input: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryText: {color: '#fff', fontWeight: '600'},
  secondaryBtn: {marginTop: 16, alignItems: 'center'},
  secondaryText: {color: '#93c5fd'},
  error: {color: '#fca5a5', marginBottom: 12},
});
