/**
 * BubblePlot Component
 * 
 * A React component that renders a bubble plot chart using uPlot.
 * Each bubble represents a data point with:
 * - X-axis position (GDP)
 * - Y-axis position (Income)
 * - Size (Population)
 * - Label (Country name)
 * 
 * The component handles:
 * - Drawing bubbles with different colors for different regions
 * - Hover interactions to show details
 * - Custom legend display
 * - Quadtree-based efficient hit detection
 */
import React, { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
// Only importing QuadTree since pointWithin is provided by the library but we use our own implementation
import QuadTree, { pointWithin } from '@/lib/quadtree';
import { useShipStore, useReceiverStore } from '@/Store/shipStore';
import { wheelZoomPlugin } from '@/lib/uplot-wheel-zoom-plugin';
import { paddedRange, decimateData, formatTime } from '@/lib/UPlot.utils';
import { useDateRangeStore } from '@/Store/dateRangeStore';
// ------------------------------------------------------------------------
// Utility Functions
// ------------------------------------------------------------------------

// Function to find min/max values in an array without using spread operator
function findMinMax(values: (number | undefined)[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val !== undefined) {
      if (val < min) min = val;
      if (val > max) max = val;
    }
  }
  
  return [min, max];
}

/**
 * Ensures data range is valid and has sufficient spread
 * Prevents issues with min=max or null values
 * 
 * @param u - uPlot instance (not used but kept for API compatibility)
 * @param min - Minimum value of the range
 * @param max - Maximum value of the range
 * @returns A tuple with adjusted [min, max] values
 */
function guardedRange(_u: uPlot, min: number | null, max: number | null): [number, number] {
  if (max === min) {
    if (min == null) {
      // Default range if both values are null
      min = 0;
      max = 100;
    }
    else {
      // Create a range around the single value
      const delta = Math.abs(min as number) || 100;
      max = (max as number) + delta;
      min = (min as number) - delta;
    }
  }
  else {
    [min, max] = paddedRange(_u, min, max, 0);
  }

  return [min as number, max as number];
}

/**
 * BubblePlot Component
 * Renders a bubble chart with interactive hover effects
 */
const BubblePlot: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const { data: shipData } = useShipStore();
  const { data: rcvData } = useReceiverStore();
  const { minDate, maxDate } = useDateRangeStore();
  // ------------------------------------------------------------------------
  // Refs
  // ------------------------------------------------------------------------
  
  // Reference to the container DOM element
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Reference to the uPlot chart instance
  const chartInstance = useRef<uPlot | null>(null);
  
  // Reference to the quadtree used for efficient point hit detection
  const qtRef = useRef<QuadTree | null>(null);
  
  // Reference to the currently hovered bubble point
  const hoverPointRef = useRef<QuadTree | null>(null);
  
  // State for toggling quadtree hit detection
  const [useQuadtree, setUseQuadtree] = useState<boolean>(false);
  
  // ------------------------------------------------------------------------
  // Chart Creation Effect
  // ------------------------------------------------------------------------
  
  useEffect(() => {
    // Only create chart if container exists and chart doesn't exist yet
    if (!containerRef.current || chartInstance.current) return;

    // Filter ship data based on date range
    const getFilteredShipData = () => {
      if (minDate === null || maxDate === null) {
        return shipData;
      }
      
      return shipData.filter(d => {
        if (!d.datetime) return false;
        const timestamp = new Date(d.datetime).getTime();
        return timestamp >= minDate && timestamp <= maxDate;
      });
    };

    if (shipData.length || rcvData.length) {
      try {
        setError(null);
        // Process ship data
        const filteredShipData = getFilteredShipData();
        
        const validShipData = filteredShipData.filter(d => 
          d.datetime &&
          (d.longitude !== undefined && d.latitude !== undefined)
        );
        console.log(`Found ${validShipData.length} ship data points with position information in selected date range`);

        // Process receiver data
        const validRcvData = rcvData.filter(d => 
          (d.longitude !== undefined && d.latitude !== undefined)
        );
        console.log(`Found ${validRcvData.length} receiver data points with position information`);

        if (validShipData.length === 0 && validRcvData.length === 0) {
          setError("No valid data points found with both 'longitude' and 'latitude' columns");
          return;
        }

        const MAX_POINTS = 20000;
        // Process ship data
        const processedShipData = validShipData.length > MAX_POINTS 
          ? decimateData(validShipData, MAX_POINTS)
          : validShipData;

        // Process receiver data
        const processedRcvData = validRcvData.length > MAX_POINTS 
          ? decimateData(validRcvData, MAX_POINTS)
          : validRcvData;

        console.log(`Processing ${processedShipData.length} ship position points (decimated from ${validShipData.length})`);
        console.log(`Processing ${processedRcvData.length} receiver position points (decimated from ${validRcvData.length})`);

        // Extract timestamps for ship data
        const shipTimestamps = processedShipData.map(d => {
          if (d.datetime) {
            const date = new Date(d.datetime);
            if (isNaN(date.getTime())) {
              console.warn(`Invalid date: ${d.datetime}`);
              return null;
            }
            return date.getTime() / 1000;
          }
          return null;
        }).filter(Boolean) as number[];

        // Since receiver data doesn't have datetime, create null timestamps
        // This will be used for display purposes only
        const rcvTimestampData = new Array(processedRcvData.length).fill(null);

        if (shipTimestamps.length === 0) {
          setError("No valid timestamps found in the ship data");
          return;
        }

        // Extract coordinates for ship data
        const shipLongitudes = processedShipData.map(d => d.longitude) as number[];
        const shipLatitudes = processedShipData.map(d => d.latitude) as number[];

        // Extract coordinates for receiver data
        const rcvLongitudes = processedRcvData.map(d => d.longitude) as number[];
        const rcvLatitudes = processedRcvData.map(d => d.latitude) as number[];

        // Find overall min/max for combined data
        const allLongitudes = [...shipLongitudes, ...rcvLongitudes];
        const allLatitudes = [...shipLatitudes, ...rcvLatitudes];
        const [minLon, maxLon] = findMinMax(allLongitudes);
        const [minLat, maxLat] = findMinMax(allLatitudes);

        console.log(`Combined position range: Lon (${minLon.toFixed(4)} to ${maxLon.toFixed(4)}), Lat (${minLat.toFixed(4)} to ${maxLat.toFixed(4)})`);
        
        // Get device pixel ratio for high-DPI displays
        const pxRatio = window.devicePixelRatio;
        
        // ------------------------------------------------------------------------
        // Drawing Functions Interface
        // ------------------------------------------------------------------------
        
        /**
         * Options for configuring the bubble drawing function
         */
        interface DrawPointsOptions {
          disp: {
            size?: {
              unit: number;  // Size unit (pixels)
              values: (u: uPlot, seriesIdx: number) => number[];  // Function to generate sizes
            };
          };
          each: (u: uPlot, seriesIdx: number, dataIdx: number, lft: number, top: number, wid: number, hgt: number) => void;
        }
    
        // ------------------------------------------------------------------------
        // Bubble Drawing Function
        // ------------------------------------------------------------------------
    
        /**
         * Creates a function to draw bubbles for a series
         * @param opts - Configuration options for drawing
         * @returns A drawing function compatible with uPlot paths
         */
        const makeDrawPoints = (opts: DrawPointsOptions): uPlot.Series.PathBuilder => {
          return (u: uPlot, seriesIdx: number) => {
            // Use uPlot's orient helper to handle the coordinate system
            uPlot.orient(u, seriesIdx, (series, _dataX, _dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim, moveTo, _lineTo, _rect, arc) => {
              // Get the data for this series
              const seriesData = u.data[seriesIdx];
              
              // Skip if no data or invalid format
              if (!seriesData || !Array.isArray(seriesData[0])) return;
              
              // Cast data arrays to appropriate types
              // These are: x-values, y-values, size, and labels
              const xValues = seriesData[0] as unknown as number[];
              const yValues = seriesData[1] as unknown as number[];
              
              // Get point size from options or use default
              // This is the important change to enable different sizes
              const pointSize = opts.disp.size?.unit || 2;
              
              // Line width for bubble stroke
              const strokeWidth = 1;
              
              // Set up canvas state
              u.ctx.save();
              
              // Clip to the plotting area
              u.ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
              u.ctx.clip();
              
              // Set styles with type-safe access to properties
              u.ctx.fillStyle = typeof series.fill === 'function' 
                ? (series.fill as () => string)() 
                : series.fill as string;
              u.ctx.strokeStyle = typeof series.stroke === 'function' 
                ? (series.stroke as () => string)() 
                : series.stroke as string;
              u.ctx.lineWidth = strokeWidth;
              
              // Full circle in radians
              const deg360 = 2 * Math.PI;

              // Use Path2D for better performance
              const p = new Path2D();

              // Calculate visible range boundaries
              const filtLft = scaleX.min ?? -Infinity;
              const filtRgt = scaleX.max ?? Infinity;
              const filtBtm = scaleY.min ?? -Infinity;
              const filtTop = scaleY.max ?? Infinity;
              
              // Loop through each data point
              for (let i = 0; i < xValues.length; i++) {
                const xVal = xValues[i];
                const yVal = yValues[i];
                // Use the point size from options
                const size = pointSize * pxRatio;
                
                // Only draw bubbles in the visible area
                if (xVal >= filtLft && xVal <= filtRgt && yVal >= filtBtm && yVal <= filtTop) {
                  // Convert data values to pixel positions
                  const cx = valToPosX(xVal, scaleX, xDim, xOff);
                  const cy = valToPosY(yVal, scaleY, yDim, yOff);

                  moveTo(p, cx + size/2, cy);
                  arc(p, cx, cy, size/2, 0, deg360);
                  
                  // Register this bubble in the interaction system
                  opts.each(u, seriesIdx, i,
                    cx - size/2 - strokeWidth/2,
                    cy - size/2 - strokeWidth/2,
                    size + strokeWidth,
                    size + strokeWidth
                  );
                }
              }
              
              // Fill and stroke all points at once
              u.ctx.fill(p);
              u.ctx.stroke(p);

              // Restore canvas state
              u.ctx.restore();
            });
            
            return null;
          };
        };
    
        // ------------------------------------------------------------------------
        // Create the Draw Points Function
        // ------------------------------------------------------------------------
        
        // Now create two different draw functions with different sizes
        const drawShipPoints = makeDrawPoints({
          disp: {
            size: {
              unit: 3, // Bigger size for ships (adjust as needed)
              values: () => [] // This is required by the interface but not used
            }
          },
          each: (u: uPlot, seriesIdx: number, dataIdx: number, lft: number, top: number, wid: number, hgt: number) => {
            // Translate from canvas coordinates to chart coordinates
            lft -= u.bbox.left;
            top -= u.bbox.top;
            
            // Add the point to the quadtree if it exists
            if (qtRef.current) {
              qtRef.current.add(new QuadTree(lft, top, wid, hgt, 0, seriesIdx, dataIdx));
            }
          },
        });
    
        const drawReceiverPoints = makeDrawPoints({
          disp: {
            size: {
              unit: 10, // Even bigger size for receivers (adjust as needed)
              values: () => [] // This is required by the interface but not used
            }
          },
          each: (u: uPlot, seriesIdx: number, dataIdx: number, lft: number, top: number, wid: number, hgt: number) => {
            // Translate from canvas coordinates to chart coordinates
            lft -= u.bbox.left;
            top -= u.bbox.top;
            
            // Add the point to the quadtree if it exists
            if (qtRef.current) {
              qtRef.current.add(new QuadTree(lft, top, wid, hgt, 0, seriesIdx, dataIdx));
            }
          },
        });
    
    // ------------------------------------------------------------------------
    // Legend Values Function
    // ------------------------------------------------------------------------

    /**
     * Generates legend values for a hovered point
     * Includes error handling for various edge cases
     */
    const legendValues = (u: uPlot, seriesIdx: number, dataIdx: number | null) => {
      // Default values when no hover or during initialization
      if (!u.data || !Array.isArray(u.data) || !u.data[seriesIdx] || dataIdx === null) {
        return {
          "Time": '-',
          "Longitude": '-',
          "Latitude": '-',
          "Type": '-',
        };
      }
      
      try {
        // Safely access data with error handling
        const seriesData = u.data[seriesIdx];
        const idx = dataIdx;
        
        // Validate series data format
        if (!Array.isArray(seriesData) || seriesData.length < 2) {
          console.error("Series data format invalid:", seriesData);
          return {
            "Time": '-',
            "Longitude": '-',
            "Latitude": '-',
            "Type": '-',
          };
        }
        
        // Extract data arrays
        const timeData = seriesData[2];
        const xData = seriesData[0];
        const yData = seriesData[1];
        
        // Validate each array and index bounds
        if (!Array.isArray(xData) || !Array.isArray(yData) || 
            idx >= xData.length || idx >= yData.length) {
          console.warn("Data index out of bounds:", idx, "for series:", seriesIdx);
          return {
            "Time": '-',
            "Longitude": '-',
            "Latitude": '-',
            "Type": '-'
          };
        }
        
        // Format the time value, handling null case for receivers
        const timeValue = Array.isArray(timeData) && idx < timeData.length && timeData[idx] ? 
          formatTime(timeData[idx]) : 
          'Not available';
        
        // Get series type for display
        const pointType = seriesIdx === 1 ? "Ship" : "Receiver";
        
        // Format the values with proper display formatting
        return {
          "Time": timeValue,
          "Longitude": xData[idx]?.toFixed(5) + "°E" || 'Unknown',
          "Latitude": yData[idx]?.toFixed(5) + "°N" || 'Unknown',
          "Type": pointType
        };
      } catch (error) {
        // Catch any unexpected errors
        console.error("Error generating legend values:", error);
        return {
          "Time": '-',
          "Longitude": '-',
          "Latitude": '-',
          "Type": '-'
        };
      }
    };
    
    // ------------------------------------------------------------------------
    // Chart Configuration Options
    // ------------------------------------------------------------------------
    
    // Determine container width and height
    const containerWidth = containerRef.current.clientWidth || window.innerWidth - 50;
    // With aspect ratio 1, we want a square plot area (excluding axes and padding)
    const containerHeight = containerWidth * 0.8; // Adjust for a good fit in the UI
    

    const opts: uPlot.Options = {
      // Chart title
      title: "Position Plot",
      
      // Mode 2 enables cursor interaction
      mode: 2,
      
      // Chart dimensions
      width: containerWidth,
      height: containerHeight,

      plugins: [
        wheelZoomPlugin({
          factor: 0.9,
          drag: true,
          scroll: true,
        }),
      ],
      
      // Legend configuration
      legend: {
        // show: false, // Uncomment to hide legend
        live: useQuadtree,     // Only update legend on hover when quadtree is enabled
        // isolate: true, // Uncomment to highlight only hovered series
      },
      
      // Cursor and interaction configuration
      cursor: {
        // Custom function to determine which point is under the cursor
        dataIdx: (u: uPlot, seriesIdx: number): number | null => {
          // For the first call in a hover, detect all points (for any series)
          if (seriesIdx === 1) {
            // Get cursor position in pixel coordinates
            const cx = (u.cursor.left || 0) * pxRatio;
            const cy = (u.cursor.top || 0) * pxRatio;
            
            // Reset state for new hover detection
            let minDist = Infinity;
            hoverPointRef.current = null;
            
            if (useQuadtree) {
              // Use quadtree for efficient point hit testing
              qtRef.current?.get(cx, cy, 1, 1, (qt) => {
                // Consider points from all series
                if (pointWithin(cx, cy, qt.x, qt.y, qt.x + qt.w, qt.y + qt.h)){
                  // Calculate distance from cursor to center of bubble
                  const ocx = qt.x + qt.w / 2;
                  const ocy = qt.y + qt.h / 2;
                  
                  const dx = ocx - cx;
                  const dy = ocy - cy;
                  const d = Math.sqrt(dx * dx + dy * dy);
                  
                  // Only consider if within the bubble's radius and closer than any previous match
                  if (d <= qt.w / 2 && d < minDist) {
                    minDist = d;
                    hoverPointRef.current = qt;
                    // console.log(`Found closest point: Series ${qt.seriesIndex}, Index ${qt.dataIndex}`);
                  }
                }
              });
            }
          }
          
          // When useQuadtree is false, always return null to disable hover interaction
          if (!useQuadtree) return null;
          
          // Return the data index ONLY if it matches the current seriesIdx
          if (hoverPointRef.current && hoverPointRef.current.seriesIndex === seriesIdx && hoverPointRef.current.dataIndex != null) {
            console.log(`Returning index ${hoverPointRef.current.dataIndex} for series ${seriesIdx}`);
            return hoverPointRef.current.dataIndex;
          }
          
          // Otherwise return null (no highlight for this series)
          return null;
        },
        
        // Configure point appearance on hover
        points: {
          size: (_u: uPlot, seriesIdx: number) => {
            // Show point at original size when hovered, otherwise hide it
            return seriesIdx === hoverPointRef.current?.seriesIndex ? (hoverPointRef.current.w / pxRatio) : 0;
          }
        },
        
        // Focus configuration for highlighting
        focus: {
          // Distance threshold for focus
          prox: 1e3,
          
          // Custom distance function for focus behavior
          dist: (_u: uPlot, seriesIdx: number) => {
            // Return 0 distance for the hovered series, Infinity for others
            return hoverPointRef.current?.seriesIndex === seriesIdx ? 0 : Infinity;
          },
        }
      },
      
      // Lifecycle hooks
      hooks: {
        // Uncomment to log series selection
        // setSeries: [ (u: uPlot, seriesIdx: number) => console.log('setSeries', seriesIdx) ],
        
        // Uncomment to log legend updates
        // setLegend: [ (u: uPlot) => console.log('setLegend', u.legend.idxs) ],
        
        // Hook that runs before each chart redraw
        drawClear: [
          (u: uPlot) => {
            // Initialize or reset the quadtree
            qtRef.current = 
              qtRef.current || new QuadTree(0, 0, u.bbox.width, u.bbox.height);
            qtRef.current.clear();
            
            // Force regeneration of cached paths
            // This ensures the quadtree gets rebuilt with fresh coordinates
            u.series.forEach((s, i) => {
              if (i > 0) (s as unknown as { _paths: uPlot.Series.Paths | null })._paths = null;
            });
            
            // Log when redrawing for debugging
            console.log("Redrawing chart, current hover point:", 
              hoverPointRef.current ? 
              `Series: ${hoverPointRef.current.seriesIndex}, DataIdx: ${hoverPointRef.current.dataIndex}` : 
              "None");
          },
        ],
      },
      
      // Axis configuration
      axes: [
        {
          label: "Longitude",  // x-axis
          labelSize: 20,
          size: 50,
          space: 60,
          values: (_u, vals) => vals.map((v: number) => v?.toFixed(1) + "°E")
        },
        {
          label: "Latitude",  // y-axis
          labelSize: 20,
          size: 50,
          space: 60,
          labelGap:10,
          values: (_u, vals) => vals.map((v: number) => v?.toFixed(1) + "°N")
        },
      ],
      
      // Scale configuration
      scales: {
        x: {
          time: false,        // Not a time series
          range: guardedRange, // Use our custom range function
        },
        y: {
          range: guardedRange, // Use our custom range function
        }
      },
      
      // Series configuration (data visualization)
      series: [
        // First element is always null (uPlot convention)
        {},

        {
          label: "Ship Position",
          stroke: "red",
          fill: "rgba(255,0,0,0.3)",
          paths: drawShipPoints,    // Use ship-specific drawing function
          values: legendValues,
        },
        
        {
          label: "Receiver Position",
          stroke: "blue",
          fill: "rgba(0,0,255,0.3)",
          paths: drawReceiverPoints,    // Use receiver-specific drawing function
          values: legendValues,
        },
      ],
    };
    
    // ------------------------------------------------------------------------
    // Create Chart
    // ------------------------------------------------------------------------
    // Create aligned data format that uPlot expects
    // Using type assertion to work around complex nested array typing
    const alignedData = [
      [], // Empty array for first series
      [shipLongitudes, shipLatitudes, shipTimestamps],
      [rcvLongitudes, rcvLatitudes, rcvTimestampData],
    ];
    
    // Initialize the chart with options and data
    // Using type assertion to bypass type checking for the complex data structure
    chartInstance.current = new uPlot(opts, alignedData as unknown as uPlot.AlignedData, containerRef.current);

    // Make plot responsive
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && containerRef.current.clientWidth > 0) {
        chartInstance.current?.setSize({ width: containerRef.current.offsetWidth, height: chartInstance.current.height });
      }
    });

    resizeObserver.observe(containerRef.current);

    // ------------------------------------------------------------------------
    // Cleanup Function
    // ------------------------------------------------------------------------
    
    // Return a cleanup function that will run when the component unmounts
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        resizeObserver.disconnect();
        chartInstance.current = null;
      }
    };


  }
  catch (err) {
      console.error("Error generating data:", err);
      setError(`Error creating chart: ${err instanceof Error ? err.message : String(err)}`);
    }
    
  }

  }, [shipData, rcvData, useQuadtree, minDate, maxDate]); // Removed getFilteredShipData from dependencies
  
  // ------------------------------------------------------------------------
  // Component Rendering
  // ------------------------------------------------------------------------
  
  // Render a container div for the chart
  return <div className="w-full p-4">
    {error ? (
      <div className="text-center py-8 text-red-500">{error}</div>
    ) : shipData.length === 0 && rcvData.length === 0 ? (
      <div className="text-center py-8">No data available</div>
    ) : (
      <>
        <div className="mb-4 flex items-center">
          <label className="inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={useQuadtree} 
              onChange={(e) => setUseQuadtree(e.target.checked)}
              className="sr-only peer"
            />
            <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            <span className="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">
              Use Quadtree Hit Detection
            </span>
          </label>
        </div>
        <div ref={containerRef}></div>
      </>
    )}
  </div>;
};

export default BubblePlot; 