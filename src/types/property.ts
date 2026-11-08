// src/types/property.ts
// Domain Types for Properties, Branding, and Concierge Settings

export type PropertyType = 'Hostel' | 'Hotel' | 'Guest House' | 'Resort' | 'Homestay';

export interface Property {
  id: string;
  name: string;
  type: string;
  state: string;
  owner_id: string;
  created_at: string;
  logo_url?: string | null;
  brand_color?: string | null;
  banner_photo_url?: string | null;
}

export interface ConciergeSettings {
  property_id: string;
  wifi_network: string;
  wifi_password: string;
  reception_phone: string;
  whatsapp_number: string;
  maps_location_url: string;
  rules_summary: string;
}

export interface PhotoChangeRequest {
  id: string;
  property_id: string;
  requested_by_id: string;
  requested_by_name: string;
  new_photo_uri: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

