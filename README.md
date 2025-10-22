# Plektos

## About Plektos

Plektos is a decentralized meetup platform built on Nostr. It enables users to create, join, and manage event. As a decentralized application, Plektos gives users full control over their data and event management without relying on centralized services.

## Features

### Event Management

- 🎯 Create and manage events with detailed information
- 📅 Schedule and organize meetups
- 📍 Location-based event discovery with smart address search
- 🔄 **Advanced Recurring Events** - Create recurring event series with flexible patterns
  - Daily, weekly, and monthly recurrence options
  - Advanced monthly patterns (e.g., "3rd Thursday of every month")
  - Custom repeat intervals and occurrence limits
  - Visual preview of generated events
- 🗺️ **Interactive map view** to visualize events geographically
- 📏 **Distance-based sorting** to find events near you
- ⚡ Use Zaps to pay for event tickets
- 🔔 Real-time notifications for RSVPs, comments, and zaps
- 📱 **Enhanced Calendar Integration** - Direct calendar app integration with multiple providers

### Privacy & Security

- 🛡️ Decentralized data storage through Nostr
- 🔒 User-controlled data and privacy settings
- 🎭 Optional anonymous participation

### Technical Features

- 🚀 Built with React 18 and Vite for optimal performance
- 🎨 Modern UI components using shadcn/ui and TailwindCSS
- 📱 Responsive design for all devices
- 🌙 Dark mode support
- 🔄 Real-time updates
- 🔍 Advanced search and filtering capabilities
- 🌍 **Geolocation support** with geohash encoding (NIP-52)
- 🗺️ **Interactive maps** powered by Leaflet and OpenStreetMap
- 📍 **Smart location search** using Nominatim geocoding API

## Tech Stack

- **Frontend Framework**: React 18.x
- **Styling**: TailwindCSS 3.x
- **Build Tool**: Vite
- **UI Components**: shadcn/ui
- **Nostr Integration**: Nostrify
- **State Management**: TanStack Query
- **Routing**: React Router
- **Type Safety**: TypeScript
- **Maps & Geolocation**: Leaflet, React Leaflet, OpenStreetMap
- **Geocoding**: Nominatim API

## Getting Started

### Prerequisites

- Node.js 18.x or later
- npm or yarn package manager

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/derekross/plektos.git
   cd plektos
   ```

2. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

3. Start the development server:

   ```bash
   npm run dev
   # or
   yarn dev
   ```

4. Open your browser and navigate to `http://localhost:5173`

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run test` - Run tests
- `npm run lint` - Run linter
- `npm run format` - Format code with Prettier

### Project Structure

```
plektos/
├── src/
│   ├── components/     # UI components
│   │   ├── MapView.tsx           # Interactive map component
│   │   └── LocationSearch.tsx    # Location search with geocoding
│   ├── hooks/         # Custom React hooks
│   ├── pages/         # Page components
│   ├── lib/           # Utility functions
│   │   ├── geolocation.ts        # Distance calc, geohash encoding
│   │   └── nominatim.ts          # Location search API
│   └── main.tsx       # Application entry point
├── public/            # Static assets
└── package.json       # Project dependencies
```

## Location Features

### Map View

Plektos includes an interactive map powered by Leaflet that displays all events with geographic coordinates. The map automatically:

- Shows event markers with clickable popups containing event details
- Fits bounds to display all visible events
- Displays event status (live events, in-person events)
- Links directly to event detail pages

**To use the map view:**
1. Navigate to the home page
2. Click the "Map" toggle button (alongside Grid and Calendar views)
3. Click on any marker to see event details
4. Click "Click for details →" in the popup to view the full event

### Location-Based Filtering

Find events near you with distance-based sorting:

1. Open the filters panel on the home page
2. Use the "Filter by Location" search
3. Type an address, city, or landmark (e.g., "Times Square, New York" or "Eiffel Tower, Paris")
4. Select a location from the dropdown
5. Events will automatically sort by distance from your selected location
6. Distance badges appear on event cards (e.g., "5.2km away")

### Smart Address Search

When creating or editing events, the location search provides:

- **Global coverage**: Search for any address worldwide
- **Accurate geocoding**: Uses OpenStreetMap's Nominatim API
- **Automatic coordinate storage**: Saves latitude/longitude as geohash (NIP-52 standard)
- **Intelligent debouncing**: Reduces API calls while typing

**Tips for best results:**
- Be specific: Include street numbers, city, and state/country
- Use full addresses when possible
- Try different formats if one doesn't work (e.g., "NYC" vs "New York City")
- Minimum 2 characters required to search

### Geolocation Data Format

Events store location data following the Nostr NIP-52 standard:

- **Geohash** (`g` tag): 9-character encoded coordinates (~4.8m precision)
- **Raw coordinates** (`lat`/`lon` tags): Stored for backward compatibility
- **Human-readable address** (`location` tag): Display text for users

### Recurring Events System

Plektos now features a comprehensive recurring events system inspired by Eventbrite's professional event management:

- **🔄 Flexible Recurrence Patterns**
  - Daily events (every N days)
  - Weekly events (specific days of the week)
  - Monthly events (same day or advanced patterns like "3rd Thursday")

- **📅 Advanced Monthly Patterns**
  - Same day of month (e.g., "15th of every month")
  - Same weekday of month (e.g., "3rd Thursday of every month")
  - Last weekday of month (e.g., "Last Friday of every month")

- **👀 Visual Event Preview**
  - See exactly what events will be created before submission
  - Preview shows dates, times, and locations for each occurrence
  - Easy editing of individual events after creation
  
## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Nostr Protocol](https://github.com/nostr-protocol/nostr)
- [shadcn/ui](https://ui.shadcn.com/)
- [TailwindCSS](https://tailwindcss.com/)
- [Vite](https://vitejs.dev/)
- [React](https://reactjs.org/)
- [Leaflet](https://leafletjs.com/) - Interactive map library
- [OpenStreetMap](https://www.openstreetmap.org/) - Map tiles and geocoding data
