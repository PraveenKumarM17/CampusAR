import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, {Polyline, PROVIDER_GOOGLE} from 'react-native-maps';
import type {RouteResponse, SearchResult} from '@campusar/shared';
import {api, ApiError} from '../../api/api';
import {useActiveSite} from '../../hooks/useActiveSite';
import {useAuthStore} from '../../stores/authStore';
import {ScreenChrome} from '../../components/ScreenChrome';
import {colors} from '../../theme/colors';

export function NavigateScreen() {
  const token = useAuthStore(s => s.accessToken);
  const {mapCenter} = useActiveSite();
  const [fromQ, setFromQ] = useState('');
  const [toQ, setToQ] = useState('');
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [fromHits, setFromHits] = useState<SearchResult[]>([]);
  const [toHits, setToHits] = useState<SearchResult[]>([]);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(q: string, setHits: (r: SearchResult[]) => void) {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    try {
      setHits(await api.search(q.trim(), token));
    } catch {
      setHits([]);
    }
  }

  async function computeRoute() {
    if (!fromId || !toId) {
      setError('Choose start and destination from search results.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setRoute(
        await api.route(
          {sourceNodeId: fromId, destinationNodeId: toId},
          token,
        ),
      );
    } catch (err) {
      setRoute(null);
      setError(err instanceof ApiError ? err.message : 'Routing failed');
    } finally {
      setBusy(false);
    }
  }

  const line =
    route?.path?.map(p => ({latitude: p.latitude, longitude: p.longitude})) ?? [];

  return (
    <ScreenChrome title="Navigate" subtitle="Outdoor turn-by-turn route on campus graph">
      <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>From</Text>
        <TextInput
          style={styles.input}
          value={fromQ}
          onChangeText={t => {
            setFromQ(t);
            void search(t, setFromHits);
          }}
          placeholder="Search start"
          placeholderTextColor={colors.inkFaint}
        />
        {fromHits.slice(0, 5).map(h => (
          <Pressable
            key={`f-${h.id}`}
            onPress={() => {
              setFromId(h.nodeId ?? null);
              setFromQ(h.name);
              setFromHits([]);
            }}>
            <Text style={styles.hit}>{h.name}</Text>
          </Pressable>
        ))}
        <Text style={styles.label}>To</Text>
        <TextInput
          style={styles.input}
          value={toQ}
          onChangeText={t => {
            setToQ(t);
            void search(t, setToHits);
          }}
          placeholder="Search destination"
          placeholderTextColor={colors.inkFaint}
        />
        {toHits.slice(0, 5).map(h => (
          <Pressable
            key={`t-${h.id}`}
            onPress={() => {
              setToId(h.nodeId ?? null);
              setToQ(h.name);
              setToHits([]);
            }}>
            <Text style={styles.hit}>{h.name}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.btn} onPress={computeRoute} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Get route</Text>}
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {route ? (
          <Text style={styles.meta}>
            {route.path.length} steps · {route.totalDistanceM.toFixed(0)} m
          </Text>
        ) : null}
      </ScrollView>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{...mapCenter, latitudeDelta: 0.012, longitudeDelta: 0.012}}>
        {line.length > 1 ? (
          <Polyline coordinates={line} strokeColor={colors.accent} strokeWidth={4} />
        ) : null}
      </MapView>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  form: {maxHeight: 280, paddingHorizontal: 16},
  label: {marginTop: 8, fontSize: 13, fontWeight: '600', color: colors.ink},
  input: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    padding: 10,
    color: colors.ink,
    backgroundColor: colors.paperRaised,
  },
  hit: {paddingVertical: 6, color: colors.accent, fontSize: 14},
  btn: {
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: colors.accent,
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnText: {color: '#fff', fontWeight: '600'},
  error: {color: colors.accentDanger, marginBottom: 8},
  meta: {color: colors.inkMute, marginBottom: 8},
  map: {flex: 1},
});
