// src/lib/staff-context.tsx
// Centralized State Management for Staff Session, Roles, and Role-Based Permissions

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { can as checkPermission, Action, Role } from './permissions';
import { StaffRole, ActiveStaffSession } from '@/types/staff';

interface StaffContextType {
  activeStaff: ActiveStaffSession | null;
  loadingStaff: boolean;
  isOwner: boolean;
  isCoAdmin: boolean;
  isDesk: boolean;
  isHousekeeper: boolean;
  canManage: boolean;
  propertyId: string | null;
  setActiveStaff: (staff: ActiveStaffSession | null) => Promise<void>;
  logoutStaff: () => Promise<void>;
  can: (action: Action) => boolean;
}

const StaffContext = createContext<StaffContextType | undefined>(undefined);

export const StaffProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeStaff, setActiveStaffState] = useState<ActiveStaffSession | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const appState = useRef(AppState.currentState);
  const activeStaffRef = useRef<ActiveStaffSession | null>(null);

  useEffect(() => {
    activeStaffRef.current = activeStaff;
  }, [activeStaff]);

  const logoutStaff = useCallback(async () => {
    try {
      await AsyncStorage.removeItem('activeStaff');
      setActiveStaffState(null);
    } catch (e) {
      console.error('[StaffContext.logoutStaff] error:', e);
    }
  }, []);

  // Load active staff from AsyncStorage on mount
  useEffect(() => {
    const loadStaff = async () => {
      try {
        const stored = await AsyncStorage.getItem('activeStaff');
        if (stored) {
          setActiveStaffState(JSON.parse(stored));
        }
      } catch (e) {
        console.error('[StaffContext.loadStaff] error:', e);
      } finally {
        setLoadingStaff(false);
      }
    };
    loadStaff();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const setActiveStaff = useCallback(async (staff: ActiveStaffSession | null) => {
    try {
      if (staff) {
        await AsyncStorage.setItem('activeStaff', JSON.stringify(staff));
      } else {
        await AsyncStorage.removeItem('activeStaff');
      }
      setActiveStaffState(staff);
    } catch (e) {
      console.error('[StaffContext.setActiveStaff] error:', e);
      setActiveStaffState(staff);
    }
  }, []);

  const role = activeStaff?.role as StaffRole | undefined;
  const isOwner = role === 'owner';
  const isCoAdmin = role === 'co_admin';
  const isDesk = role === 'desk';
  const isHousekeeper = role === 'housekeeping';
  const canManage = isOwner || isCoAdmin;
  const propertyId = activeStaff?.propertyId || null;

  const can = useCallback(
    (action: Action) => checkPermission(activeStaff?.role as Role, action),
    [activeStaff?.role]
  );

  return (
    <StaffContext.Provider
      value={{
        activeStaff,
        loadingStaff,
        isOwner,
        isCoAdmin,
        isDesk,
        isHousekeeper,
        canManage,
        propertyId,
        setActiveStaff,
        logoutStaff,
        can,
      }}
    >
      {children}
    </StaffContext.Provider>
  );
};

export const useStaff = () => {
  const context = useContext(StaffContext);
  if (!context) throw new Error('useStaff must be used within a StaffProvider');
  return context;
};
