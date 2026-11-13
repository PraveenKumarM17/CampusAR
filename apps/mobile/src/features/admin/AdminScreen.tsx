import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Text} from 'react-native';
import type {Building} from '@campusar/shared';
import {api} from '../../api/api';
import {useAuthStore} from '../../stores/authStore';
import {ScreenChrome} from '../../components/ScreenChrome';
import {colors} from '../../theme/colors';

export function AdminScreen() {
  const token = useAuthStore(s => s.accessToken);
  const user = useAuthStore(s => s.user);
  const [buildings, setBuildings] = useState<Building[]>([]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    api.buildings(token).then(setBuildings).catch(() => setBuildings([]));
  }, [token, user?.role]);

  if (user?.role !== 'admin') {
    return (
      <ScreenChrome title="Admin" subtitle="Organization administrators only">
        <Text style={styles.denied}>Sign in as admin to manage campus data.</Text>
      </ScreenChrome>
    );
  }

  return (
    <ScreenChrome title="Admin" subtitle="Campus buildings and map operations">
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.section}>Buildings ({buildings.length})</Text>
        {buildings.map(b => (
          <Text key={b.id} style={styles.card}>
            {b.name}
            {'\n'}
            {b.code} · {b.latitude.toFixed(5)}, {b.longitude.toFixed(5)}
          </Text>
        ))}
        <Text style={styles.note}>
          Full map builder (Terra-draw / indoor floor editor) is next on the mobile parity
          roadmap. Data changes still go through the same API as web.
        </Text>
      </ScrollView>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  pad: {padding: 16},
  denied: {padding: 16, color: colors.inkMute},
  section: {fontWeight: '700', fontSize: 16, color: colors.ink, marginBottom: 8},
  card: {
    padding: 10,
    marginBottom: 8,
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    color: colors.ink,
  },
  note: {marginTop: 16, fontSize: 13, color: colors.inkMute, lineHeight: 20},
});
