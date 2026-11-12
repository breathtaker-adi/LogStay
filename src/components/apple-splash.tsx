// src/components/apple-splash.tsx
// Apple HIG Branded Futuristic Splash Screen with Glowing Progress Bar
// Displays the Futuristic Blue House-Key Splash art and resolves the user workspace smoothly.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthService } from '@/services/auth.service';
import { useStaff } from '@/lib/staff-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PROGRESS_BAR_WIDTH = Math.min(SCREEN_WIDTH * 0.62, 240);

const SPLASH_IMAGE = require('../../assets/images/Futuristic Blue House-Key Splash Screen.png');

export function AppleSplashScreen() {
  const insets = useSafeAreaInsets();
  const { setActiveStaff } = useStaff();

  const [progressAnim] = useState(() => new Animated.Value(0));
  const [fadeAnim] = useState(() => new Animated.Value(1));
  const [statusMessage, setStatusMessage] = useState('INITIALIZING SECURE ENGINE');

  useEffect(() => {
    let isCancelled = false;

    // Start smooth Apple progress animation (1.4s duration)
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 1400,
      useNativeDriver: false,
    }).start();

    const t1 = setTimeout(() => {
      if (!isCancelled) setStatusMessage('VERIFYING CLOUD WORKSPACE');
    }, 550);

    const t2 = setTimeout(() => {
      if (!isCancelled) setStatusMessage('READY');
    }, 1100);

    // Concurrently resolve authentication session & property state
    async function bootApp() {
      try {
        const result = await AuthService.resolveUserProfile();

        // Wait until progress bar completes nicely (~1.35s)
        await new Promise((res) => setTimeout(res, 1350));
        if (isCancelled) return;

        // Smooth fade-out before navigation
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start(async () => {
          if (result.session) {
            await setActiveStaff(result.session);
            router.replace('/home');
          } else if (result.needsPropertySetup) {
            router.replace('/setup-property');
          } else {
            router.replace('/login');
          }
        });
      } catch (err) {
        console.error('[AppleSplash] boot error:', err);
        router.replace('/login');
      }
    }

    bootApp();

    return () => {
      isCancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [progressAnim, fadeAnim, setActiveStaff]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, PROGRESS_BAR_WIDTH],
  });

  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
      <StatusBar style="light" />

      <View style={styles.backgroundImage}>
        <Image
          source={SPLASH_IMAGE}
          style={styles.artworkImage}
          resizeMode="contain"
        />
        {/* Bottom Progress Bar Container (Apple HIG positioning) */}
        <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
          {/* Subtle Status Caption */}
          <Text style={styles.statusCaption}>{statusMessage}</Text>

          {/* Progress Bar Track */}
          <View style={[styles.progressBarTrack, { width: PROGRESS_BAR_WIDTH }]}>
            <Animated.View
              style={[
                styles.progressBarFill,
                { width: progressWidth },
              ]}
            />
          </View>

          {/* Version Badge */}
          <Text style={styles.versionText}>LogStay Mobile 1.0 • AES-256 Cloud Link</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#011787',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#011787',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  artworkImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  bottomContainer: {
    alignItems: 'center',
    width: '100%',
  },
  statusCaption: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 1.2,
    marginBottom: 10,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  progressBarTrack: {
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#38BDF8',
    ...Platform.select({
      ios: {
        shadowColor: '#38BDF8',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  versionText: {
    marginTop: 14,
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.55)',
    letterSpacing: 0.4,
  },
});
