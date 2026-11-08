// src/lib/screen-header.tsx
// Unified back-button header used on every screen for consistency.
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;        // optional right-side slot (e.g. "Add Room" button)
  onBack?: () => void;            // custom back handler; defaults to router.back()
  showBack?: boolean;             // whether to display back button; defaults to true
}

export function ScreenHeader({ title, subtitle, right, onBack, showBack = true }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <View style={[
      styles.container,
      { paddingTop: Math.max(insets.top, 12) + 6, backgroundColor: theme.backgroundElement, borderBottomColor: theme.separator }
    ]}>
      {showBack ? (
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack ?? (() => router.back())}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={theme.accent} />
        </TouchableOpacity>
      ) : (
        <View style={styles.placeholder} />
      )}

      <View style={styles.center}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>

      <View style={styles.right}>
        {right ?? <View style={styles.placeholder} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  backBtn: {
    // Bare chevron — no box, no border. 44×44 hit area via hitSlop.
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  placeholder: {
    width: 38,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '400',
  },
  right: {
    minWidth: 38,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
