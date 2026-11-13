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
import type {IndoorPlace, IndoorRouteResponse} from '@campusar/shared';
import {api, ApiError} from '../../api/api';
import {useAuthStore} from '../../stores/authStore';
import {ScreenChrome} from '../../components/ScreenChrome';
import {colors} from '../../theme/colors';

export function IndoorScreen() {
  const token = useAuthStore(s => s.accessToken);
  const [qr, setQr] = useState('');
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<IndoorPlace[]>([]);
  const [anchorNodeId, setAnchorNodeId] = useState<string | null>(null);
  const [selected, setSelected] = useState<IndoorPlace | null>(null);
  const [route, setRoute] = useState<IndoorRouteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onScanAnchor() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.indoorResolveAnchor(qr.trim(), token);
      setAnchorNodeId(res.anchor.nodeId);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid QR / anchor code');
    } finally {
      setBusy(false);
    }
  }

  async function onSearch() {
    try {
      setPlaces(await api.indoorSearchPlaces(query.trim(), undefined, token));
    } catch {
      setPlaces([]);
    }
  }

  async function onRoute() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      setRoute(
        await api.indoorRoute(
          {
            sourceNodeId: anchorNodeId ?? undefined,
            sourceAnchorCode: anchorNodeId ? undefined : qr.trim() || undefined,
            destinationPlaceId: selected.id,
            expectedBuildingId: selected.buildingId,
          },
          token,
        ),
      );
    } catch (err) {
      setRoute(null);
      setError(err instanceof ApiError ? err.message : 'Indoor routing failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenChrome
      title="Indoor"
      subtitle="QR / marker localization and indoor graph routing (same API as web)">
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.label}>Indoor QR / marker code</Text>
        <TextInput
          style={styles.input}
          value={qr}
          onChangeText={setQr}
          placeholder="Scan or type anchor code"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="characters"
        />
        <Pressable style={styles.btn} onPress={onScanAnchor} disabled={busy || !qr.trim()}>
          <Text style={styles.btnText}>Resolve anchor</Text>
        </Pressable>
        {anchorNodeId ? (
          <Text style={styles.ok}>Localized to node {anchorNodeId.slice(0, 8)}…</Text>
        ) : null}
        <Text style={[styles.label, {marginTop: 16}]}>Destination search</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={onSearch}
          placeholder="Room or place name"
          placeholderTextColor={colors.inkFaint}
        />
        <Pressable style={styles.btnSecondary} onPress={onSearch}>
          <Text style={styles.btnSecondaryText}>Search</Text>
        </Pressable>
        {places.map(p => (
          <Pressable
            key={p.id}
            style={[styles.place, selected?.id === p.id && styles.placeSelected]}
            onPress={() => setSelected(p)}>
            <Text style={styles.placeName}>{p.name}</Text>
            <Text style={styles.placeMeta}>{p.buildingId}</Text>
          </Pressable>
        ))}
        {selected ? (
          <Pressable style={styles.btn} onPress={onRoute} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Route to {selected.name}</Text>
            )}
          </Pressable>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {route ? (
          <View style={styles.routeBox}>
            <Text style={styles.routeTitle}>Route · {route.nodes.length} nodes</Text>
            {route.instructions.slice(0, 8).map((s, i) => (
              <Text key={i} style={styles.step}>
                {i + 1}. {s}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  pad: {padding: 16, paddingBottom: 40},
  label: {fontSize: 13, fontWeight: '600', color: colors.ink},
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    padding: 10,
    color: colors.ink,
    backgroundColor: colors.paperRaised,
  },
  btn: {
    marginTop: 10,
    backgroundColor: colors.accent,
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnText: {color: '#fff', fontWeight: '600'},
  btnSecondary: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnSecondaryText: {color: colors.ink},
  ok: {marginTop: 8, color: colors.accent, fontSize: 13},
  place: {
    marginTop: 8,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperRaised,
  },
  placeSelected: {borderColor: colors.accent},
  placeName: {fontWeight: '600', color: colors.ink},
  placeMeta: {fontSize: 12, color: colors.inkMute, marginTop: 2},
  error: {marginTop: 12, color: colors.accentDanger},
  routeBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.paperRaised,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  routeTitle: {fontWeight: '700', color: colors.ink, marginBottom: 8},
  step: {fontSize: 13, color: colors.inkMute, marginBottom: 4},
});
