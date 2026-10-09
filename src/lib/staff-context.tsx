// src/lib/staff-context.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface StaffProfile {
  id: string;
  name: string;
  role: string;
  attendanceId: string | null;
}

interface StaffContextType {
  activeStaff: StaffProfile | null;
  loadingStaff: boolean;
  setActiveStaff: (staff: StaffProfile | null) => void;
  logoutStaff: () => void;
}

const StaffContext = createContext<StaffContextType | undefined>(undefined);

export const StaffProvider = ({ children }: { children: React.ReactNode }) => {
  const [activeStaff, setActiveStaffState] = useState<StaffProfile | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(true);

  // Load active staff from AsyncStorage on app start
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
  }, []);

  const setActiveStaff = async (staff: StaffProfile | null) => {
    if (staff) {
      await AsyncStorage.setItem('activeStaff', JSON.stringify(staff));
    } else {
      await AsyncStorage.removeItem('activeStaff');
    }
    setActiveStaffState(staff);
  };

  const logoutStaff = async () => {
    // Optional: You could trigger staff_attendance clock_out here later
    await AsyncStorage.removeItem('activeStaff');
    setActiveStaffState(null);
  };

  return (
    <StaffContext.Provider value={{ activeStaff, loadingStaff, setActiveStaff, logoutStaff }}>
      {children}
    </StaffContext.Provider>
  );
};

export const useStaff = () => {
  const context = useContext(StaffContext);
  if (!context) throw new Error('useStaff must be used within a StaffProvider');
  return context;
};