import { useEffect, useState } from 'react';
import DepthTimeSeriesPlot from '@/components/DepthTimeSeriesPlot'; 
import { useShipStore, useReceiverStore } from '@/Store/shipStore';
import BubblePlot from '@/components/PositionPlot';
import { TimeSeriesPlot } from '@/components/timeSeriesPlot';
import { useDateRangeStore } from '@/Store/dateRangeStore';
import { formatTime } from '@/lib/UPlot.utils';
import RadixDatetimeSlider from '@/components/datetimeSlider';

function App() {
  const loadData = useShipStore((state) => state.loadData);
  const loadReceiverData = useReceiverStore((state) => state.loadData);
  const { minDate, maxDate } = useDateRangeStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        await loadData();
        await loadReceiverData();
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [loadData, loadReceiverData]);

  // Format the active date range for display
  const getActiveDateRangeText = () => {
    if (!minDate || !maxDate) return null;
    
    const minDateFormatted = formatTime(minDate);
    const maxDateFormatted = formatTime(maxDate);
    
    return (
      <div className="text-sm mb-3 p-2 bg-blue-50 border border-blue-200 rounded">
        <strong>Active Filter:</strong> Showing data from <span className="font-mono">{minDateFormatted}</span> to <span className="font-mono">{maxDateFormatted}</span>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4 min-h-screen">
      <header>
        <h1 className="text-2xl font-bold mb-4">CSEM Navigation Visualization and Analysis</h1>
      </header>
      
      {isLoading ? (
        <div className="p-4 text-center loading">
          <p>Loading data...</p>
        </div>
      ) : (
        <>
          {getActiveDateRangeText()}

          <div className="w-full mb-6 sticky top-0 bg-white z-10">
            <RadixDatetimeSlider />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-15 gap-6">
            <div className="xl:col-span-7 space-y-6">
              <div className="w-full p-6 rounded-lg shadow-md">
                <h2 className="text-lg font-bold mb-2">Depth Time Series</h2>
                <DepthTimeSeriesPlot />   
              </div>

              <div className="w-full p-6 rounded-lg shadow-md">
                <h2 className="text-lg font-bold mb-2">Altitude Time Series</h2>
                <TimeSeriesPlot dataColumn="suesiAltitude"
                  MAX_POINTS={20000}
                  title=""
                />
              </div>

              <div className="w-full p-6 rounded-lg shadow-md">
                <h2 className="text-lg font-bold mb-2">Heading Time Series</h2>
                <TimeSeriesPlot dataColumn="shipHeading"
                  MAX_POINTS={20000}
                  title=""
                />
              </div>
            </div>
            <div className="xl:col-span-8 space-y-6">
              <div className="w-full p-6 rounded-lg shadow-md">
                <h2 className="text-lg font-bold mb-2">Position Plot</h2>
                <BubblePlot />
              </div>
              <div className="w-full h-[500px] p-6 rounded-lg shadow-md">
                <h2 className="text-lg font-bold mb-2">Along Profile Plot</h2>
              </div>
            </div>
          </div>
        </>
      )}
      
      <footer className="p-4 text-center">
        <p className="text-sm">yli3354@gatech.edu</p>
      </footer>
    </div>
  );
}

export default App;
