import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useRef, useEffect, useState, useCallback } from 'react';
import { useShipStore } from '@/Store/shipStore';
import { wheelZoomPlugin } from '@/lib/uplot-wheel-zoom-plugin';
import { paddedRange, processTimestamps, formatTime } from '@/lib/UPlot.utils';
import { useDateRangeStore } from '@/Store/dateRangeStore';

export default function DepthTimeSeriesPlot() {
  const { data } = useShipStore();
  const { minDate, maxDate } = useDateRangeStore();
  const plotRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWinch, setShowWinch] = useState<boolean>(false);
  
  // Store processed data for reuse without recalculation
  const dataRef = useRef<{
    sortedTimestamps: number[];
    suesiDepths: (number | null)[];
    bathyDepths: (number | null)[];
    winchLengths: (number | null)[];
  } | null>(null);

  // Filter data based on date range
  const getFilteredData = useCallback(() => {
    // Create a clean dataset with valid entries only
    const validData = data.filter(d => 
      d.datetime && 
      (d.suesiDepth !== undefined || d.bathy !== undefined)
    );
    
    // Further filter by date range if set
    if (minDate !== null && maxDate !== null) {
      return validData.filter(d => {
        if (!d.datetime) return false;
        const timestamp = new Date(d.datetime).getTime();
        return timestamp >= minDate && timestamp <= maxDate;
      });
    }
    
    return validData;
  }, [data, minDate, maxDate]);

  // Update chart when showWinch changes
  useEffect(() => {
    if (!chartRef.current || !dataRef.current) return;
    
    const { sortedTimestamps, suesiDepths, bathyDepths, winchLengths } = dataRef.current;
    const chart = chartRef.current;
    
    // Check if winch series exists
    const hasWinchSeries = chart.series.length > 3;
    
    // Add winch series if it should be shown but isn't
    if (showWinch && !hasWinchSeries) {
      console.log("Adding winch data series");
      
      chart.addSeries({
        label: 'Winch Length (m)', 
        stroke: 'green',
        points: {
          show: true,
          fill: 'green',
          size: 3
        },
        paths: () => null,
      });
      
      chart.setData([
        sortedTimestamps, 
        suesiDepths, 
        bathyDepths, 
        winchLengths
      ] as uPlot.AlignedData);
    } 
    // Remove winch series if it shouldn't be shown but is
    else if (!showWinch && hasWinchSeries) {
      console.log("Removing winch data series");
      
      const lastSeriesIdx = chart.series.length - 1;
      chart.delSeries(lastSeriesIdx);
      
      chart.setData([
        sortedTimestamps, 
        suesiDepths, 
        bathyDepths
      ] as uPlot.AlignedData);
    }
  }, [showWinch]);

  // Main effect to create the chart
  useEffect(() => {
    if (plotRef.current && data.length) {
      try {
        setError(null);
        
        // Get filtered data
        const filteredData = getFilteredData();
        
        console.log(`Found ${filteredData.length} data points with datetime and depth values in selected range`);
        
        if (data.length === 0) {
          setError("No data available for plotting");
          return;
        }

        if (filteredData.length === 0) {
          setError("No valid data points found with both datetime and depth values in the selected range");
          return;
        }

        const { timeIndices, sortedTimestamps } = processTimestamps(filteredData, { convertToSeconds: true });
        
        // Extract depth values aligned with sorted timestamps
        const suesiDepths = timeIndices.map(i => 
          filteredData[i].suesiDepth !== undefined ? filteredData[i].suesiDepth : null
        );
        
        const bathyDepths = timeIndices.map(i => 
          filteredData[i].bathy !== undefined ? filteredData[i].bathy : null
        );
        
        // Extract winch values for later use
        const winchLengths = timeIndices.map(i => 
          filteredData[i].winch !== undefined ? filteredData[i].winch : null
        );

        // Store processed data for reuse
        dataRef.current = {
          sortedTimestamps,
          suesiDepths,
          bathyDepths,
          winchLengths
        };

        // Find the min and max depths for scale setting
        const allDepths = [...suesiDepths, ...bathyDepths, ...winchLengths].filter(d => d !== null) as number[];
        
        if (allDepths.length === 0) {
          setError("No valid depth values found in the data for the selected date range");
          return;
        }
        
        // If chart already exists, just update the data
        if (chartRef.current) {
          console.log("Updating existing depth plot data");
          
          // Initialize data - always start with basic data
          const chartData: uPlot.AlignedData = [sortedTimestamps, suesiDepths, bathyDepths];
          
          // If there's a winch series and showWinch is true, add the winch data
          const hasWinchSeries = chartRef.current.series.length > 3;
          if (showWinch) {
            if (!hasWinchSeries) {
              // Add the winch series if it doesn't exist
              chartRef.current.addSeries({
                label: 'Winch Length (m)', 
                stroke: 'green',
                points: {
                  show: true,
                  fill: 'green',
                  size: 3
                },
                paths: () => null,
              });
            }
            chartData.push(winchLengths);
          } else if (hasWinchSeries) {
            // Remove the winch series if it exists but shouldn't
            const lastSeriesIdx = chartRef.current.series.length - 1;
            chartRef.current.delSeries(lastSeriesIdx);
          }
          
          chartRef.current.setData(chartData);
          return;
        }
        
        // Below code only runs for initial chart creation
        // Basic uPlot options
        const opts: uPlot.Options = {
          mode: 1,
          title: "Depth Time Series",
          width: plotRef.current.clientWidth || window.innerWidth - 50,
          height: 300,
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
              // Time x-values (required)
              value: (_u, v) => {
                return formatTime(v*1000);
              }
            }, 
            { 
              label: 'SUESI Depth (m)', 
              stroke: 'blue',
              paths: () => null,
              points: {
                fill: 'blue',
                show: true,
                size: 3
              }
            },
            { 
              label: 'Bathymetry (m)', 
              stroke: 'red',
              paths: () => null,
              points: {
                fill: 'red',
                show: true,
                size: 3
              }
            },
          ],
          scales: {
            x: {
              time: true,
            },
            y: {
              time: false,
              dir: -1, // https://leeoniya.github.io/uPlot/demos/scales-dir-ori.html
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

        // Clean up any existing chart content
        if (plotRef.current.firstChild) {
          plotRef.current.innerHTML = '';
        }

        // Initial data without winch
        let initialData: uPlot.AlignedData = [sortedTimestamps, suesiDepths, bathyDepths];
        
        // If showWinch is true at initialization, prepare the chart with winch series
        if (showWinch) {
          opts.series.push({
            label: 'Winch Length (m)', 
            stroke: 'green',
            points: {
              show: true,
              fill: 'green',
              size: 3
            },
            paths: () => null,
          });
          initialData = [sortedTimestamps, suesiDepths, bathyDepths, winchLengths];
        }
        
        chartRef.current = new uPlot(opts, initialData, plotRef.current);

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

        return () => {
          if (chartRef.current) {
            chartRef.current.destroy();
            chartRef.current = null;
          }
          resizeObserver.disconnect();
        };
      } catch (err) {
        console.error("Error creating chart:", err);
        setError(`Error creating chart: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (data.length === 0) {
      console.log("No data available for plotting");
    } else if (!plotRef.current) {
      console.log("Plot reference not ready");
    }
  }, [data, minDate, maxDate, getFilteredData, showWinch]); // Include showWinch

  return (
    <div className="w-full p-4">
      {error ? (
        <div className="text-center py-8 text-red-500">{error}</div>
      ) : data.length === 0 ? (
        <div className="text-center py-8">No data available</div>
      ) : (
        <>
          <div className="mb-4 flex items-center">
            <label className="inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={showWinch} 
                onChange={(e) => setShowWinch(e.target.checked)}
                className="sr-only peer"
              />
              <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              <span className="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">
                Show Winch Length
              </span>
            </label>
          </div>
          <div ref={plotRef}></div>
        </>
      )}
    </div>
  );
} 