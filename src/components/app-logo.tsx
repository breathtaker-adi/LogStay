// src/components/app-logo.tsx
import React from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';

interface AppLogoProps {
  size?: number;
  rounded?: boolean;
  style?: ViewStyle;
}

export function AppLogo({ size = 64, rounded = true, style }: AppLogoProps) {
  const borderRadius = rounded ? Math.round(size * 0.22) : 0;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: borderRadius,
        },
        style
      ]}
    >
      <Image
        source={require('../../assets/images/icon.png')}
        style={{
          width: size,
          height: size,
          borderRadius: borderRadius,
        }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    shadowColor: '#023dfd',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4
  }
});
