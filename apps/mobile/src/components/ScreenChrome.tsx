import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme/colors';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function ScreenChrome({title, subtitle, children}: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper},
  header: {paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8},
  title: {fontSize: 24, fontWeight: '700', color: colors.ink},
  subtitle: {marginTop: 4, fontSize: 14, color: colors.inkMute},
});
