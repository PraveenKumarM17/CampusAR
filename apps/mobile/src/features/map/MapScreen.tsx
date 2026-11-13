import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TextInput, View} from 'react-native';
import MapView, {Marker, Polyline, PROVIDER_GOOGLE} from 'react-native-maps';
import type {Building, GraphEdge, GraphNode, SearchResult} from '@campusar/shared';
import {api} from '../../api/api';
import {useActiveSite} from '../../hooks/useActiveSite';
import {useAuthStore} from '../../stores/authStore';
import {colors} from '../../theme/colors';

export function MapScreen() {
  const token = useAuthStore(s => s.accessToken);
  const {mapCenter, label} = useActiveSite();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.buildings(token), api.nodes(token), api.edges(token)])
      .then(([b, n, e]) => {
        if (cancelled) return;
        setBuildings(b);
        setNodes(n);
        setEdges(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.search(query.trim(), token).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query, token]);

  const polylines = useMemo(() => {
    const byId = new Map(nodes.map(n => [n.id, n]));
    return edges
      .map(e => {
        const a = byId.get(e.fromNodeId);
        const b = byId.get(e.toNodeId);
        if (!a || !b) return null;
        return {
          id: e.id,
          coords: [
            {latitude: a.latitude, longitude: a.longitude},
            {latitude: b.latitude, longitude: b.longitude},
          ],
        };
      })
      .filter(Boolean) as {id: string; coords: {latitude: number; longitude: number}[]}[];
  }, [edges, nodes]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.searchWrap}>
        <Text style={styles.siteLabel}>{label}</Text>
        <TextInput
          style={styles.search}
          placeholder="Search campus…"
          placeholderTextColor={colors.inkFaint}
          value={query}
          onChangeText={setQuery}
        />
        {results.slice(0, 4).map(r => (
          <Text key={r.id} style={styles.result} numberOfLines={1}>
            {r.name} · {r.type}
          </Text>
        ))}
      </View>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          ...mapCenter,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}>
        {buildings.map(b => (
          <Marker
            key={b.id}
            coordinate={{latitude: b.latitude, longitude: b.longitude}}
            title={b.name}
            description={b.code}
          />
        ))}
        {polylines.map(p => (
          <Polyline key={p.id} coordinates={p.coords} strokeColor={colors.accent} strokeWidth={3} />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  searchWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: colors.paperRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  siteLabel: {fontSize: 12, color: colors.inkMute, marginBottom: 6},
  search: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.ink,
  },
  result: {fontSize: 13, color: colors.ink, marginTop: 4},
  map: {flex: 1},
});
