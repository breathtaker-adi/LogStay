import React, { Component } from "react";
import { View, Text, Button, StyleSheet, TouchableOpacity, Linking } from "react-native";

export default class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean, errorText: string }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorText: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorText: error.toString() };
  }

  handleWhatsAppSupport = () => {
    // Replace with your actual WhatsApp number
    const phone = "919999999999"; 
    const message = encodeURIComponent(`LogStay Crashed: ${this.state.errorText}`);
    Linking.openURL(`https://wa.me/${phone}?text=${message}`);
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>😵‍💫</Text>
          <Text style={styles.title}>Don't Panic!</Text>
          <Text style={styles.subtitle}>LogStay hit a snag. The desk staff can still take manual bookings.</Text>
          
          <Text style={styles.errorText} selectable>{this.state.errorText}</Text>

          <View style={styles.buttonContainer}>
            <Button title="Restart App" onPress={() => this.setState({ hasError: false })} color="#2563eb" />
          </View>
          
          <TouchableOpacity style={styles.whatsappBtn} onPress={this.handleWhatsAppSupport}>
            <Text style={styles.whatsappText}>📞 Send Error to Support</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6", padding: 20 },
  emoji: { fontSize: 60, marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "bold", color: "#1f2937" },
  subtitle: { fontSize: 16, color: "#6b7280", textAlign: "center", marginTop: 5, marginBottom: 20 },
  errorText: { fontSize: 12, color: "#ef4444", backgroundColor: "white", padding: 10, borderRadius: 8, marginBottom: 30 },
  buttonContainer: { width: "100%", marginBottom: 15 },
  whatsappBtn: { backgroundColor: "#25D366", padding: 15, borderRadius: 8, width: "100%", alignItems: "center" },
  whatsappText: { color: "white", fontWeight: "bold", fontSize: 16 }
});