import uPlot from 'uplot';

// Function to decimate data points for large datasets
export const decimateData = <T>(data: T[], maxPoints: number = 2000): T[] => {
  if (data.length <= maxPoints) return data;
  
  const skipFactor = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % skipFactor === 0);
}

// Function to add padding to axis ranges
export const paddedRange = (_u: uPlot, min: number | null, max: number | null, axis: number): [number, number] => {
  // If data bounds are invalid, return reasonable defaults
  if (min === null || max === null || min === max) {
    return axis === 1 ? [-100, 0] : [0, 100];
  }
  
  // Calculate padding (5% of the range on each side)
  const range = max - min;
  const padding = range * 0.05;
  
  return [min - padding, max + padding];
};

export const formatTime = (v: number): string => {
  // Format the time with 24-hour format and milliseconds
  const date = new Date(v);
  // only show 1 decimal second
  const timePart = date.toISOString().split('.')[0];
  const ms = date.getMilliseconds().toString().padStart(1, '0');
  return `${timePart}.${ms}`;
};

/**
 * Processes date strings from data objects into sorted numeric timestamps
 * @param data Array of data objects containing datetime field
 * @param options Configuration options
 * @returns Object containing sorted timestamps and indices for sorted data
 */
export const processTimestamps = <T extends { datetime?: string }>(
  data: T[],
  options: {
    convertToSeconds?: boolean;
    setError?: (message: string) => void;
  } = {}
) => {
  const { convertToSeconds = true, setError } = options;
  
  // Extract timestamps from datetime column
  const timestamps = data.map(d => {
    if (d.datetime) {
      const date = new Date(d.datetime);
      if (isNaN(date.getTime())) {
        console.warn(`Invalid date: ${d.datetime}`);
        return null;
      }
      // Convert to seconds if requested (default for uPlot), otherwise keep in milliseconds
      return convertToSeconds ? date.getTime()/1000 : date.getTime();
    }
    return null;
  }).filter(Boolean) as number[];

  if (timestamps.length === 0) {
    const errorMessage = "No valid timestamps found in the data";
    console.error(errorMessage);
    if (setError) {
      setError(errorMessage);
    }
    return { timestamps: [], timeIndices: [], sortedTimestamps: [] };
  }

  // Sort the data by timestamp
  const timeIndices = timestamps.map((_t, i) => i)
    .sort((a, b) => timestamps[a] - timestamps[b]);

  const sortedTimestamps = timeIndices.map(i => timestamps[i]);

  return {
    timeIndices,
    sortedTimestamps
  };
};

  