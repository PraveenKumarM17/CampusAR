import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Text} from 'react-native';
import type {Building} from '@campusar/shared';
import {api} from '../../api/api';
import {useAuthStore} from '../../stores/authStore';
import {ScreenChrome} from '../../components/ScreenChrome';
import {colors} from '../../theme/colors';

/** Digital twin 3D (Cesium on web) → simplified building catalog on mobile until RN 3D twin ships. */
export function TwinScreen() {
  const token = useAuthStore(s => s.accessToken);
  const [buildings, setBuildings] = useState<Building[]>([]);

  useEffect(() => {
    api.buildings(token).then(setBuildings).catch(() => setBuildings([]));
  }, [token]);

  return (
    <ScreenChrome title="Digital Twin" subtitle="Campus buildings and live data hooks">
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.note}>
          Web uses CesiumJS for 3D. Mobile shows the same campus building catalog and will add
          native 3D in a later release.
        </Text>
        {buildings.map(b => (
          <Text key={b.id} style={styles.card}>
            {b.name}
            {`\n${b.floorsCount} floors`}
          </Text>
        ))}
      </ScrollView>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  pad: {padding: 16},
  note: {color: colors.inkMute, marginBottom: 12, lineHeight: 20},
  card: {
    padding: 10,
    marginBottom: 8,
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    color: colors.ink,
  },
});
