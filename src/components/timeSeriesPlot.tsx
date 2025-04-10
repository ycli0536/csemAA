import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useRef, useEffect, useState, useCallback } from 'react';
import { useShipStore, ShipData } from '@/Store/shipStore';
import { wheelZoomPlugin } from '@/lib/uplot-wheel-zoom-plugin';
import { paddedRange, processTimestamps, formatTime, decimateData } from '@/lib/UPlot.utils';
import { useDateRangeStore } from '@/Store/dateRangeStore';
import React from 'react';

// Interface for the component props
interface TimeSeriesPlotProps {
  dataColumn: keyof ShipData;  // The column name to plot from the dataset (must be a key of ShipData)
  title?: string;              // Chart title
  color?: string;              // Line/point color
  seriesLabel?: string;        // Label for the data series
  height?: number;             // Chart height in pixels
  MAX_POINTS?: number;          // Number of data points to decimate to
}

// Use React.memo to prevent unnecessary rerenders
const TimeSeriesPlot: React.FC<TimeSeriesPlotProps> = ({
  dataColumn,
  title = "Time Series",
  color = "blue",
  seriesLabel,
  height = 256,
  MAX_POINTS = 20000
}) => {
  const { data } = useShipStore();
  const { minDate, maxDate } = useDateRangeStore();
  const plotRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isInitializedRef = useRef<boolean>(false);
  
  // Determine the series label if not provided
  const actualSeriesLabel = seriesLabel || `${dataColumn.charAt(0).toUpperCase() + dataColumn.slice(1)}`;
  
  // Reference to store processed data for reuse
  const dataRef = useRef<{
    sortedTimestamps: number[];
    values: (number | null)[];
  } | null>(null);

  // Filter data based on date range and required column
  const getFilteredData = useCallback(() => {
    // Create a clean dataset with valid entries only - check for the specified column
    const validData = data.filter(d => 
      d.datetime && (d[dataColumn] !== undefined)
    );
    console.log(`Found ${validData.length} data points with datetime and ${dataColumn} values`);

    // Further filter by date range if set
    if (minDate !== null && maxDate !== null) {
      return validData.filter(d => {
        if (!d.datetime) return false;
        const timestamp = new Date(d.datetime).getTime();
        return timestamp >= minDate && timestamp <= maxDate;
      });
    }

    const decimatedData = validData.length > MAX_POINTS 
      ? decimateData(validData, MAX_POINTS)
      : validData;

    return decimatedData;
  }, [data, minDate, maxDate, dataColumn, MAX_POINTS]);

  // Process data into format needed for chart
  const processChartData = useCallback(() => {
    try {
      setError(null);
      
      // Get filtered data
      const filteredData = getFilteredData();

      console.log(`Found ${filteredData.length} data points with datetime and ${dataColumn} values in selected range`);

      if (filteredData.length === 0) {
        setError(`No valid data points found with both datetime and ${dataColumn} values in selected range`);
        return null;
      }
      
      const { timeIndices, sortedTimestamps } = processTimestamps(filteredData, {convertToSeconds: true});
      
      // Extract values aligned with sorted timestamps for the specified column
      const values = timeIndices.map((i: number) => {
        const value = filteredData[i][dataColumn];
        return typeof value === 'number' ? value : null;
      });

      // Find the min and max values for scale setting
      const allValues = values.filter((v: number | null): v is number => v !== null);
      
      if (allValues.length === 0) {  
        setError(`No valid ${dataColumn} values found in the data in selected range`);
        return null;
      }

      return {
        sortedTimestamps,
        values
      };
    } catch (err) {
      console.error("Error processing data:", err);
      setError(`Error processing data: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }, [getFilteredData, dataColumn]);

  // Create chart options only once
  const createChartOptions = useCallback((containerWidth: number): uPlot.Options => {
    return {
      width: containerWidth || window.innerWidth - 50,
      height,
      title,
      mode: 1,
      plugins: [wheelZoomPlugin({
        factor: 0.9,
        drag: true,
        scroll: true,
      })],
      cursor: {
        drag: { x: true, y: true, uni: 1, dist: 30 },
        sync: {
          key: 'test',
          scales: ["x", null],
        }
      },
      series: [
        {
          label: "Time",
          value: (_u, v) => {
            return formatTime(v*1000);
          }
        },
        {
          label: actualSeriesLabel,
          stroke: color,
        }
      ],
      scales: {
        x: {
          time: true,
        },
        y: {
          time: false,
          range: (u, min, max) => paddedRange(u, min, max, 0)
        }
      },
      axes: [
        {values: [  
          // tick incr  default       year                        month   day                  hour   min               sec  mode 
          [3600*24*365,"{YYYY}",      null,                       null, null,                  null, null,              null, 1],
          [3600*24*28, "{MMM}",       "\n{YYYY}",                 null, null,                  null, null,              null, 1],
          [3600*24,    "{D}/{M}",     "\n{YYYY}",                 null, null,                  null, null,              null, 1],
          [3600,       "{HH}",        "\n{D}/{M}/{YY}",           null, "\n{D}/{M}",           null, null,              null, 1],
          [60,         "{HH}:{mm}",   "\n{D}/{M}/{YY}",           null, "\n{D}/{M}",           null, null,              null, 1],
          [1,          ":{ss}",       "\n{D}/{M}/{YY} {HH}:{mm}", null, "\n{D}/{M} {HH}:{mm}", null, "\n{HH}:{mm}",     null, 1],
          [0.001,      ":{ss}.{fff}", "\n{D}/{M}/{YY} {HH}:{mm}", null, "\n{D}/{M} {HH}:{mm}", null, "\n{HH}:{mm}",     null, 1],
                    ]},
        {}  // y-axis
      ],
      legend: {
        show: true
      }
    };
  }, [title, height, color, actualSeriesLabel]);

  // Main effect to create or update the chart
  useEffect(() => {
    if (!plotRef.current || !data.length) {
      return;
    }

    // Process the data
    const processedData = processChartData();
    if (!processedData) {
      return;
    }

    // Store processed data for reuse
    dataRef.current = processedData;
    const { sortedTimestamps, values } = processedData;

    // Create chart data
    const chartData: uPlot.AlignedData = [sortedTimestamps, values];

    // If chart already exists, just update the data
    if (chartRef.current && isInitializedRef.current) {
      console.log(`Updating existing ${dataColumn} plot data`);
      chartRef.current.setData(chartData);
    } else {
      // First time creation of the chart
      console.log(`Creating new ${dataColumn} plot instance`);
      const containerWidth = plotRef.current.clientWidth || window.innerWidth - 50;
      const opts = createChartOptions(containerWidth);

      // Clean up any existing chart content (should not be needed but just in case)
      if (plotRef.current.firstChild) {
        plotRef.current.innerHTML = '';
      }

      chartRef.current = new uPlot(opts, chartData, plotRef.current);
      isInitializedRef.current = true;

      // Make plot responsive
      const resizeObserver = new ResizeObserver(() => {
        if (plotRef.current && plotRef.current.clientWidth > 0 && chartRef.current) {
          chartRef.current.setSize({ 
            width: plotRef.current.clientWidth, 
            height: chartRef.current.height 
          });
        }
      });
      
      resizeObserver.observe(plotRef.current);

      // Clean up only happens on component unmount
      return () => {
        if (chartRef.current) {
          chartRef.current.destroy();
          chartRef.current = null;
        }
        isInitializedRef.current = false;
        resizeObserver.disconnect();
      };
    }
  }, [data, minDate, maxDate, processChartData, createChartOptions, dataColumn]);

  return (
    <div className="w-full p-4">
      {error ? (
        <div className="text-center py-8 text-red-500">{error}</div>
      ) : data.length === 0 ? (
        <div className="text-center py-8">No data available</div>
      ) : (
        <div ref={plotRef} />
      )}
    </div>
  );
}

// // Original AltTimeSeriesPlot component that uses the reusable TimeSeriesPlot
// const AltTimeSeriesPlot: React.FC = () => {
//   return (
//     <TimeSeriesPlot
//       dataColumn="suesiAltitude"
//       title="Altitude Time Series"
//       seriesLabel="Altitude"
//       color="blue"
//     />
//   );
// };

// // Wrap component with React.memo to prevent unnecessary rerenders
// export default React.memo(AltTimeSeriesPlot);

// Export the reusable component for use elsewhere
export { TimeSeriesPlot };
