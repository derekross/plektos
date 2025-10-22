interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  importance: number;
}

// Cache for search results
const searchCache = new Map<string, NominatimResult[]>();
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

export async function searchLocations(
  query: string
): Promise<NominatimResult[]> {
  if (!query) {
    return [];
  }

  // Check cache first
  const cachedResults = searchCache.get(query);
  if (cachedResults) {
    return cachedResults;
  }

  try {
    console.log("Searching for location:", query);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=10&addressdetails=1`,
      {
        headers: {
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "Plektos/1.0",
        },
      }
    );

    if (!response.ok) {
      console.error(`Nominatim API error: ${response.status} ${response.statusText}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Found ${data.length} results for "${query}"`, data);

    // Cache the results
    searchCache.set(query, data);

    // Clear cache after duration
    setTimeout(() => {
      searchCache.delete(query);
    }, CACHE_DURATION);

    return data;
  } catch (error) {
    console.error("Error searching locations:", error);
    return [];
  }
}

// Create a custom debounced search that properly handles async
let searchTimeout: NodeJS.Timeout | null = null;
const pendingSearches = new Map<string, Promise<NominatimResult[]>>();

export const search = (query: string): Promise<NominatimResult[]> => {
  return new Promise((resolve) => {
    // Clear any pending timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // If there's already a pending search for this exact query, return it
    if (pendingSearches.has(query)) {
      pendingSearches.get(query)!.then(resolve);
      return;
    }

    // Set a new timeout for the search
    searchTimeout = setTimeout(async () => {
      const searchPromise = searchLocations(query);
      pendingSearches.set(query, searchPromise);

      try {
        const results = await searchPromise;
        resolve(results);
      } catch (error) {
        console.error("Error in debounced search:", error);
        resolve([]);
      } finally {
        // Clean up after a delay
        setTimeout(() => {
          pendingSearches.delete(query);
        }, 1000);
      }
    }, 300); // 300ms debounce delay
  });
};
