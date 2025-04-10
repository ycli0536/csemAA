import { create } from 'zustand';
import Papa from 'papaparse';

export interface ShipData {
  datetime?: string;
  latitude?: number;
  longitude?: number;
  northing?: number;
  easting?: number;
  suesiAltitude?: number;
  winch?: number;
  suesiDepth?: number;
  bathy?: number;
  shipHeading?: number;
  vulcanHeading?: number;
  vulcanDepth?: number;
  vulcanTiltX?: number;
  vulcanTiltY?: number;
  atetDepth?: number;
  atetTiltX?: number;
  atetTiltY?: number;
  atetHeading?: number;
  // time column will be ignored
}

export interface ReceiverData {
  latitude?: number;
  longitude?: number;
  depth?: number;
  depthDeployed?: number;
  northing?: number;
  easting?: number;
  siteName?: string;
}

interface ShipStore {
  data: ShipData[];
  loadData: () => Promise<void>;
}

interface ReceiverStore {
  data: ReceiverData[];
  loadData: () => Promise<void>;
}

export const useShipStore = create<ShipStore>((set) => ({
  data: [],
  loadData: async () => {
    try {
      console.log("Loading ship data...");
      const response = await fetch(`${import.meta.env.BASE_URL}data/ship_data_demo.csv`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
      }
      
      const csvText = await response.text();
      
      console.log(`CSV data loaded, size: ${csvText.length} bytes`);
      
      const results = Papa.parse<ShipData>(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        transformHeader: (header) => {
          // Convert header to lowercase and trim whitespace
          header = header.trim().toLowerCase();
          // Handle specific transformations for snake_case to camelCase
          if (header === 'suesidepth') return 'suesiDepth';
          if (header === 'suesialt' 
            || header === 'altitude'
            || header === 'alt'
            || header === 'suesialtitude'
            ) return 'suesiAltitude';
          if (header === 'heading'
            || header === 'heading_deg'
            || header === 'ship_heading'
            || header === 'shipheading'
            ) return 'shipHeading';
          if (header === 'heading_deg_vulcan'
            || header === 'vulcan_heading'
            || header === 'vulcanheading'
            ) return 'vulcanHeading';
          if (header === 'tilt_x_vulcan'
            || header === 'vulcan_tilt_x'
            || header === 'vulcantiltx'
            ) return 'vulcanTiltX';
          if (header === 'tilt_y_vulcan'
            || header === 'vulcan_tilt_y'
            || header === 'vulcantilty'
            ) return 'vulcanTiltY';
          if (header === 'depth_vulcan'
            || header === 'vulcan_depth'
            || header === 'vulcandepth'
            ) return 'vulcanDepth';
          if (header === 'tilt_x_atet'
            || header === 'atet_tilt_x'
            || header === 'atettiltx'
            ) return 'atetTiltX';
          if (header === 'tilt_y_atet'
            || header === 'atet_tilt_y'
            || header === 'atettilty'
            ) return 'atetTiltY';
          if (header === 'heading_atet'
            || header === 'atet_heading'
            || header === 'atetheading'
            ) return 'atetHeading';
          if (header === 'depth_atet'
            || header === 'atet_depth'
            || header === 'atetdepth'
            ) return 'atetDepth';
          return header;
        },
      });

      console.log(`Parsed ${results.data.length} rows with ${results.meta.fields?.length} fields`);
      console.log("Fields:", results.meta.fields);
      
      if (results.errors && results.errors.length > 0) {
        console.warn("CSV parsing errors:", results.errors);
      }

      // Process the data, using only the datetime column and depth values
      const shipData: ShipData[] = results.data
        .map((row) => ({
          datetime: row.datetime,
          latitude: typeof row.latitude === 'number' ? row.latitude : undefined,
          longitude: typeof row.longitude === 'number' ? row.longitude : undefined,
          suesiAltitude: typeof row.suesiAltitude === 'number' ? row.suesiAltitude : undefined,
          winch: typeof row.winch === 'number' ? row.winch : undefined,
          suesiDepth: typeof row.suesiDepth === 'number' ? row.suesiDepth : undefined,
          bathy: typeof row.bathy === 'number' ? row.bathy : undefined,
          shipHeading: typeof row.shipHeading === 'number' ? row.shipHeading : undefined,
          vulcanHeading: typeof row.vulcanHeading === 'number' ? row.vulcanHeading : undefined,
          vulcanTiltX: typeof row.vulcanTiltX === 'number' ? row.vulcanTiltX : undefined,
          vulcanTiltY: typeof row.vulcanTiltY === 'number' ? row.vulcanTiltY : undefined,
          vulcanDepth: typeof row.vulcanDepth === 'number' ? row.vulcanDepth : undefined,
          atetDepth: typeof row.atetDepth === 'number' ? row.atetDepth : undefined,
          atetTiltX: typeof row.atetTiltX === 'number' ? row.atetTiltX : undefined,
          atetTiltY: typeof row.atetTiltY === 'number' ? row.atetTiltY : undefined,
          atetHeading: typeof row.atetHeading === 'number' ? row.atetHeading : undefined,
        }));

      console.log(`Processed ${shipData.length} valid data points`);
      
      // Display sample data for debugging
      if (shipData.length > 0) {
        console.log("Sample data point:", shipData[1]);
      }

      set({ data: shipData });
    } catch (error) {
      console.error("Error loading ship data:", error);
      set({ data: [] });
    }
  },
}));

export const useReceiverStore = create<ReceiverStore>((set) => ({
  data: [],
  loadData: async () => {
    try {
      console.log("Loading receiver data...");
      const response = await fetch(`${import.meta.env.BASE_URL}data/Rx_forearc.csv`);

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
      }

      const csvText = await response.text();
      console.log(`CSV data loaded, size: ${csvText.length} bytes`);

      const results = Papa.parse<ReceiverData>(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        transformHeader: (header) => header.trim().toLowerCase(),
      });

      console.log(`Parsed ${results.data.length} rows with ${results.meta.fields?.length} fields`);
      console.log("Fields:", results.meta.fields);

      if (results.errors && results.errors.length > 0) {
        console.warn("CSV parsing errors:", results.errors);
      }

      const receiverData: ReceiverData[] = results.data.map((row) => ({
        latitude: typeof row.latitude === 'number' ? row.latitude : undefined,
        longitude: typeof row.longitude === 'number' ? row.longitude : undefined,
        depth: typeof row.depth === 'number' ? row.depth : undefined,
        depthDeployed: typeof row.depthDeployed === 'number' ? row.depthDeployed : undefined,
        northing: typeof row.northing === 'number' ? row.northing : undefined,
        easting: typeof row.easting === 'number' ? row.easting : undefined,
        siteName: typeof row.siteName === 'string' ? row.siteName : undefined,
      }));

      console.log(`Processed ${receiverData.length} valid data points`);

      if (receiverData.length > 0) {
        console.log("Sample data point:", receiverData[0]);
      }

      set({ data: receiverData });
    } catch (error) {
      console.error("Error loading receiver data:", error);
      set({ data: [] });
    }
  },
}));
