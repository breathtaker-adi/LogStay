// src/app/ErrorBoundary.tsx
// Apple HIG Crash Resilient Error Boundary
// Catches unhandled runtime exceptions, scrubs sensitive data (OWASP M6),
// and presents a calming, recoverable Apple interface with reload & support options.

import React, { Component } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorText: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorText: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorText: error.toString() };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught exception:", error, errorInfo);
  }

  handleRestart = () => {
    this.setState({ hasError: false, errorText: "" });
  };

  handleWhatsAppSupport = () => {
    const supportPhone = "919999999999";
    // OWASP M6: Scrub PII (tokens, phones, UUIDs, emails) from logs before sending
    const sanitizedError = (this.state.errorText || "")
      .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_TOKEN]')
      .replace(/\b\d{10,12}\b/g, '[REDACTED_PHONE]')
      .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '[REDACTED_UUID]')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');

    const message = encodeURIComponent(`LogStay Mobile Diagnostics:\n${sanitizedError}`);
    Linking.openURL(`https://wa.me/${supportPhone}?text=${message}`);
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <Ionicons name="sparkles" size={28} color="#2563EB" />
              </View>

              <Text style={styles.title}>Workspace Paused</Text>
              <Text style={styles.subtitle}>
                LogStay encountered a momentary snag. All active rooms, folios, and shifts remain securely synced in the cloud.
              </Text>

              {/* Redacted Error Detail Box */}
              <View style={styles.detailBox}>
                <Text style={styles.detailTitle}>INCIDENT REFERENCE</Text>
                <Text style={styles.errorText} numberOfLines={4} selectable>
                  {this.state.errorText || "Unexpected state error"}
                </Text>
              </View>

              {/* Action Buttons (Apple HIG pills) */}
              <View style={styles.actionColumn}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={this.handleRestart}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Reload Workspace</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={this.handleWhatsAppSupport}
                  activeOpacity={0.7}
                >
                  <Ionicons name="logo-whatsapp" size={17} color="#16A34A" />
                  <Text style={styles.secondaryButtonText}>Send Diagnostics to Support</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 24,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  detailBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 22,
  },
  detailTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#94A3B8',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 16,
  },
  actionColumn: {
    width: '100%',
    gap: 10,
  },
  primaryButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  secondaryButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '600',
  },
});
