import { create } from 'zustand';

// Define the store interface
interface DateRangeStore {
  minDate: number | null;
  maxDate: number | null;
  setDateRange: (min: number | null, max: number | null) => void;
  resetDateRange: () => void;
}

// Create the store
export const useDateRangeStore = create<DateRangeStore>((set) => ({
  minDate: null,
  maxDate: null,
  setDateRange: (min, max) => set({ minDate: min, maxDate: max }),
  resetDateRange: () => set({ minDate: null, maxDate: null }),
})); 