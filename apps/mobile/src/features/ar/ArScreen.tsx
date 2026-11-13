import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {ScreenChrome} from '../../components/ScreenChrome';
import {colors} from '../../theme/colors';

type Props = {
  onOpenNativeMeasure: () => void;
};

export function ArScreen({onOpenNativeMeasure}: Props) {
  return (
    <ScreenChrome
      title="AR"
      subtitle="Native ARCore / ARKit measurement (replaces browser gyro tracking)">
      <View style={styles.body}>
        <Text style={styles.p}>
          Outdoor AR navigation with the guide doll is being ported from web. Indoor admin
          measurement uses native world tracking on this device.
        </Text>
        <Pressable style={styles.btn} onPress={onOpenNativeMeasure}>
          <Text style={styles.btnText}>Open native AR measurement</Text>
        </Pressable>
      </View>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  body: {padding: 16},
  p: {color: colors.inkMute, lineHeight: 22, marginBottom: 16},
  btn: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: 6,
    alignItems: 'center',
  },
  btnText: {color: '#fff', fontWeight: '600'},
});
