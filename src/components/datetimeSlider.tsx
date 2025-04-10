import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { useShipStore } from "@/Store/shipStore";
import { formatTime } from "@/lib/UPlot.utils";
import { useDateRangeStore } from "@/Store/dateRangeStore";

interface RadixDatetimeSliderProps {
  className?: string;
}

const RadixDatetimeSlider: React.FC<RadixDatetimeSliderProps> = ({ className = '' }) => {
  // Get data from stores
  const shipData = useShipStore((state) => state.data);
  
  // Get date range state
  const { minDate, maxDate, setDateRange } = useDateRangeStore();
  
  // State for slider values (as percentages, 0-100)
  const [sliderValues, setSliderValues] = useState<[number, number]>([0, 100]);
  
  // Temporary slider values during dragging (to avoid constant updates)
  const [tempSliderValues, setTempSliderValues] = useState<[number, number]>([0, 100]);
  
  // Store the actual min/max timestamps from data
  const [dataMinTime, setDataMinTime] = useState<number | null>(null);
  const [dataMaxTime, setDataMaxTime] = useState<number | null>(null);
  
  // Find min and max date in the data - optimized for large datasets
  useEffect(() => {
    if (shipData.length === 0) return;
    
    // Use sampling for very large datasets
    const sampleSize = 1000;
    const samplingFactor = Math.max(1, Math.floor(shipData.length / sampleSize));
    
    let min = Infinity;
    let max = -Infinity;
    
    // Process data in chunks to avoid call stack issues
    const processDataChunk = (startIdx: number, endIdx: number) => {
      for (let i = startIdx; i < endIdx; i += samplingFactor) {
        const item = shipData[i];
        if (item && item.datetime) {
          const date = new Date(item.datetime);
          const timestamp = date.getTime();
          if (!isNaN(timestamp)) {
            min = Math.min(min, timestamp);
            max = Math.max(max, timestamp);
          }
        }
      }
    };
    
    // Process data in chunks of 5000 items
    const chunkSize = 5000;
    for (let i = 0; i < shipData.length; i += chunkSize) {
      processDataChunk(i, Math.min(i + chunkSize, shipData.length));
    }
    
    if (min !== Infinity && max !== -Infinity) {
      setDataMinTime(min);
      setDataMaxTime(max);
      
      // Initialize slider values if not already set
      if (minDate === null || maxDate === null) {
        setDateRange(min, max);
        setSliderValues([0, 100]);
        setTempSliderValues([0, 100]);
      }
    }
  }, [shipData, minDate, maxDate, setDateRange]);
  
  // Convert slider percentage to actual timestamp
  const percentToTimestamp = useCallback((percent: number): number => {
    if (dataMinTime === null || dataMaxTime === null) return 0;
    const range = dataMaxTime - dataMinTime;
    return dataMinTime + (range * percent / 100);
  }, [dataMinTime, dataMaxTime]);
  
  // When slider values change during dragging
  const handleSliderChange = useCallback((values: number[]) => {
    const [min, max] = values as [number, number];
    setTempSliderValues([min, max]);
  }, []);
  
  // When slider movement is complete
  const handleSliderCommit = useCallback(() => {
    setSliderValues(tempSliderValues);
    setDateRange(
      percentToTimestamp(tempSliderValues[0]), 
      percentToTimestamp(tempSliderValues[1])
    );
  }, [tempSliderValues, percentToTimestamp, setDateRange]);
  
  // Handle reset
  const handleReset = useCallback(() => {
    if (dataMinTime !== null && dataMaxTime !== null) {
      setDateRange(dataMinTime, dataMaxTime);
      setSliderValues([0, 100]);
      setTempSliderValues([0, 100]);
    }
  }, [dataMinTime, dataMaxTime, setDateRange]);
  
  // Format timestamps for display - memoize to prevent unnecessary recalculations
  const formatMinTime = useMemo(() => 
    minDate ? formatTime(minDate) : 'N/A', 
    [minDate]
  );
  
  const formatMaxTime = useMemo(() => 
    maxDate ? formatTime(maxDate) : 'N/A', 
    [maxDate]
  );
  
  // Format temporary values for display during dragging
  const formatTempMinTime = useMemo(() => 
    dataMinTime ? formatTime(percentToTimestamp(tempSliderValues[0])) : 'N/A', 
    [dataMinTime, percentToTimestamp, tempSliderValues]
  );
  
  const formatTempMaxTime = useMemo(() => 
    dataMaxTime ? formatTime(percentToTimestamp(tempSliderValues[1])) : 'N/A', 
    [dataMaxTime, percentToTimestamp, tempSliderValues]
  );
  
  return (
    <div className={`w-full p-6 rounded-lg shadow-md ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-lg text-gray-800">Date Range Filter</h3>
        <button 
          onClick={handleReset}
          className="px-3 py-1.5 bg-blue-600 text-black rounded hover:bg-blue-700 text-sm font-medium transition-colors"
        >
          Reset Range
        </button>
      </div>
      
      <div className="space-y-6">
        <div className="flex justify-between mb-2 text-sm text-gray-700">
          <div>
            <span className="font-medium text-gray-800 block mb-1">Start Time:</span>
            <span className="font-mono bg-white px-2 py-1 rounded border border-gray-300">
              {tempSliderValues[0] !== sliderValues[0] ? formatTempMinTime : formatMinTime}
            </span>
          </div>
          <div className="text-right">
            <span className="font-medium text-gray-800 block mb-1">End Time:</span>
            <span className="font-mono bg-white px-2 py-1 rounded border border-gray-300">
              {tempSliderValues[1] !== sliderValues[1] ? formatTempMaxTime : formatMaxTime}
            </span>
          </div>
        </div>
        
        {/* The slider container with specific CSS to prevent scroll interference */}
        <div className="py-4">
          <div style={{ touchAction: 'pan-x' }}>
            <Slider
              defaultValue={[0, 100]}
              value={tempSliderValues}
              min={0}
              max={100}
              step={0.0001}
              onValueChange={handleSliderChange}
              onValueCommit={handleSliderCommit}
              className="w-full"
            />
          </div>
        </div>
      </div>
      
      <div className="text-sm text-gray-600 mt-1 p-2 bg-blue-50 rounded border border-blue-100">
        <span className="font-medium">Tip:</span> Drag the handles to adjust the date range. Changes will apply when you release the slider.
      </div>
    </div>
  );
};

export default RadixDatetimeSlider; 