import React, {useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {api, ApiError} from '../../api/api';
import {colors} from '../../theme/colors';
import {useAuthStore} from '../../stores/authStore';
import {useSiteStore} from '../../stores/siteStore';

type Props = {
  onAuthed: () => void;
};

export function LandingScreen({onAuthed}: Props) {
  const setSession = useAuthStore(s => s.setSession);
  const setSites = useSiteStore(s => s.setSites);
  const [showAdmin, setShowAdmin] = useState(false);
  const [email, setEmail] = useState('admin@smartcampus.edu');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function afterAuth(res: Awaited<ReturnType<typeof api.guest>>) {
    setSession(res.user, res.tokens.accessToken, res.tokens.refreshToken);
    const sites = await api.sites(res.tokens.accessToken);
    setSites(sites);
    onAuthed();
  }

  async function enterGuest() {
    setLoading(true);
    setError(null);
    try {
      await afterAuth(await api.guest('Campus Guest'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Guest access failed');
    } finally {
      setLoading(false);
    }
  }

  async function onAdminLogin() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(email.trim(), password);
      if (res.user.role !== 'admin') {
        setError('This sign-in is for organization administrators only.');
        return;
      }
      await afterAuth(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Admin login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.brand}>CampusAR</Text>
        <Text style={styles.headline}>Find any room at RNSIT without asking for directions.</Text>
        <Text style={styles.sub}>
          Channasandra, Bengaluru — scan, allow location, and navigate. No account needed.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={enterGuest} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Continue as Guest →</Text>
          )}
        </Pressable>
        <Pressable onPress={() => setShowAdmin(true)}>
          <Text style={styles.link}>Organization admin sign in</Text>
        </Pressable>
        {error && !showAdmin ? <Text style={styles.error}>{error}</Text> : null}
        {showAdmin ? (
          <View style={styles.adminCard}>
            <Text style={styles.adminLabel}>ADMINISTRATORS ONLY</Text>
            <Text style={styles.adminTitle}>Admin sign in</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor={colors.inkFaint}
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              secureTextEntry
              placeholder="Password"
              placeholderTextColor={colors.inkFaint}
              value={password}
              onChangeText={setPassword}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={styles.primaryBtn} onPress={onAdminLogin} disabled={loading}>
              <Text style={styles.primaryText}>Sign in to Dashboard</Text>
            </Pressable>
            <Pressable onPress={() => setShowAdmin(false)}>
              <Text style={styles.link}>Back — continue as guest</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper},
  scroll: {flexGrow: 1, justifyContent: 'flex-end', padding: 24, paddingBottom: 40},
  brand: {fontSize: 42, fontWeight: '700', color: colors.ink},
  headline: {marginTop: 16, fontSize: 22, fontWeight: '600', color: colors.ink, maxWidth: 360},
  sub: {marginTop: 8, fontSize: 15, color: colors.inkMute, maxWidth: 340},
  primaryBtn: {
    marginTop: 24,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
  },
  primaryText: {color: '#fff', fontWeight: '600', fontSize: 16},
  link: {marginTop: 16, color: colors.inkMute, fontSize: 14},
  error: {
    marginTop: 12,
    color: colors.accentDanger,
    borderWidth: 1,
    borderColor: `${colors.accentDanger}55`,
    padding: 10,
    borderRadius: 6,
  },
  adminCard: {
    marginTop: 24,
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    borderRadius: 8,
  },
  adminLabel: {fontSize: 11, fontWeight: '700', color: colors.inkFaint, letterSpacing: 1},
  adminTitle: {marginTop: 4, fontSize: 20, fontWeight: '700', color: colors.ink},
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.paperSoft,
  },
});
