// src/services/property.service.ts
// Business Logic for Properties, Branding, Concierge & Photo Approvals

import { supabase } from '@/lib/supabase';
import { Property, ConciergeSettings, PropertyType } from '@/types/property';

export class PropertyService {
  /**
   * Creates a new property and auto-binds the creator as owner
   */
  static async createProperty(
    name: string,
    type: PropertyType | string,
    state: string,
    ownerName: string
  ): Promise<string> {
    const { data: propId, error } = await supabase.rpc('create_property', {
      p_name: name.trim(),
      p_type: type,
      p_state: state.trim(),
      p_pin: '',
      p_owner_name: ownerName.trim(),
    });

    if (error) throw error;
    if (!propId) throw new Error('No property ID returned from creation RPC');
    return propId;
  }

  /**
   * Fetches property metadata by ID
   */
  static async getProperty(propertyId: string): Promise<Property | null> {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('id', propertyId)
        .single();

      if (error) throw error;
      return data as Property;
    } catch (err) {
      console.warn('[PropertyService.getProperty] error:', err);
      return null;
    }
  }

  /**
   * Updates property name (Owner only)
   */
  static async updatePropertyName(propertyId: string, newName: string): Promise<void> {
    const { error } = await supabase
      .from('properties')
      .update({ name: newName.trim() })
      .eq('id', propertyId);

    if (error) throw error;
  }

  /**
   * Fetches Concierge & Wi-Fi settings
   */
  static async getConciergeSettings(propertyId: string): Promise<ConciergeSettings | null> {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('wifi_network, wifi_password, reception_phone, whatsapp_number, maps_location_url, rules_summary')
        .eq('id', propertyId)
        .single();

      if (error) throw error;
      return {
        property_id: propertyId,
        wifi_network: data?.wifi_network || '',
        wifi_password: data?.wifi_password || '',
        reception_phone: data?.reception_phone || '',
        whatsapp_number: data?.whatsapp_number || '',
        maps_location_url: data?.maps_location_url || '',
        rules_summary: data?.rules_summary || '',
      };
    } catch (err) {
      console.warn('[PropertyService.getConciergeSettings] error:', err);
      return null;
    }
  }

  /**
   * Updates Concierge & Wi-Fi settings
   */
  static async updateConciergeSettings(
    propertyId: string,
    settings: Partial<ConciergeSettings>
  ): Promise<void> {
    const { error } = await supabase
      .from('properties')
      .update({
        wifi_network: settings.wifi_network?.trim() || null,
        wifi_password: settings.wifi_password?.trim() || null,
        reception_phone: settings.reception_phone?.trim() || null,
        whatsapp_number: settings.whatsapp_number?.trim() || null,
        maps_location_url: settings.maps_location_url?.trim() || null,
        rules_summary: settings.rules_summary?.trim() || null,
      })
      .eq('id', propertyId);

    if (error) throw error;
  }
}

