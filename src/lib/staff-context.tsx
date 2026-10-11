import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { can as checkPermission, Action, Role } from './permissions';

interface StaffProfile {
  id: string;
  name: string;
  role: Role | string;
  attendanceId: string | null;
}

interface StaffContextType {
  activeStaff: StaffProfile | null;
  loadingStaff: boolean;
  setActiveStaff: (staff: StaffProfile | null) => void;
  logoutStaff: () => void;
  can: (action: Action) => boolean;
}

const StaffContext = createContext<StaffContextType | undefined>(undefined);

export const StaffProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeStaff, setActiveStaffState] = useState<StaffProfile | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const appState = useRef(AppState.currentState);
  const backgroundTime = useRef<number | null>(null);
  const activeStaffRef = useRef<StaffProfile | null>(null);

  useEffect(() => {
    activeStaffRef.current = activeStaff;
  }, [activeStaff]);

  const logoutStaff = async () => {
    // Optional: You could trigger staff_attendance clock_out here later
    await AsyncStorage.removeItem('activeStaff');
    setActiveStaffState(null);
  };

  // Load active staff from AsyncStorage on app start and listen for auto-lock
  useEffect(() => {
    const loadStaff = async () => {
      try {
        const stored = await AsyncStorage.getItem('activeStaff');
        if (stored) {
          setActiveStaffState(JSON.parse(stored));
        }
      } catch (e) {
        console.error('Failed to load staff', e);
      } finally {
        setLoadingStaff(false);
      }
    };
    loadStaff();

    // Auto-Lock Listener
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (
        (appState.current === 'active' && (nextAppState === 'inactive' || nextAppState === 'background')) ||
        (nextAppState === 'background' && !backgroundTime.current)
      ) {
        // App went to background
        backgroundTime.current = Date.now();
      } else if (nextAppState === 'active' && backgroundTime.current) {
        // App returned to foreground
        const idleTime = (Date.now() - backgroundTime.current) / 1000; // in seconds
        if (idleTime > 180 && activeStaffRef.current) { // 3 minutes & staff logged in
          console.log('Auto-locking due to inactivity');
          await logoutStaff();
          router.replace('/staff-login');
        }
        backgroundTime.current = null;
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const setActiveStaff = async (staff: StaffProfile | null) => {
    if (staff) {
      await AsyncStorage.setItem('activeStaff', JSON.stringify(staff));
    } else {
      await AsyncStorage.removeItem('activeStaff');
    }
    setActiveStaffState(staff);
  };

  const can = (action: Action) => checkPermission(activeStaff?.role as Role, action);

  return (
    <StaffContext.Provider value={{ activeStaff, loadingStaff, setActiveStaff, logoutStaff, can }}>
      {children}
    </StaffContext.Provider>
  );
};

export const useStaff = () => {
  const context = useContext(StaffContext);
  if (!context) throw new Error('useStaff must be used within a StaffProvider');
  return context;
};