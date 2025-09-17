


import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { LocationData } from './types';
import { LOCATIONS } from './constants';

// Declare Leaflet globally to avoid TypeScript errors with CDN version
declare const L: any;

// A type for the global window function to bridge Leaflet popup and React state
declare global {
    interface Window {
        updateRadius: (id: number, radius: number) => void;
    }
}

const App: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [radii, setRadii] = useState<{ [key: number]: number }>({});
    const [isSynced, setIsSynced] = useState<boolean>(false);
    const [uniformRadius, setUniformRadius] = useState<number>(10);
    const [showLabels, setShowLabels] = useState<boolean>(true);
    const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
    const [isClusteringEnabled, setIsClusteringEnabled] = useState<boolean>(true);

    const mapRef = useRef<any>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const layerRefs = useRef<{ [key: number]: { marker: any; circle: any } }>({});
    const markerClusterGroupRef = useRef<any>(null);
    const heatmapLayerRef = useRef<any>(null);

    const filteredLocations = useMemo(() =>
        LOCATIONS.filter(location =>
            location.city.toLowerCase().includes(searchTerm.toLowerCase())
        ), [searchTerm]);

    // Helper function to create marker icons dynamically
    const createMarkerIcon = (loc: LocationData, labelsVisible: boolean) => {
        const labelHtml = labelsVisible
            ? `<div class="absolute" style="left: 100%; top: 50%; transform: translateY(-50%); margin-left: 4px;">
                <div class="bg-white text-gray-800 text-xs font-semibold px-2 py-1 rounded-md shadow-md whitespace-nowrap">${loc.city}</div>
              </div>`
            : '';

        // The dot is w-3 h-3 (12px) + border-2 (4px) = 16px. We use a container to center it.
        // The label is positioned relative to this container.
        return L.divIcon({
            className: 'custom-div-icon',
            html: `
                <div class="relative" style="width: 16px; height: 16px;">
                    <div class="bg-red-600 w-3 h-3 rounded-full border-2 border-white shadow-lg absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
                    ${labelHtml}
                </div>
            `,
            iconSize: [16, 16], // Size of the icon container (the dot)
            iconAnchor: [8, 8],   // Anchor to the center of the dot
        });
    };

    // Effect for map initialization (runs only once)
    useEffect(() => {
        if (mapRef.current || !mapContainerRef.current) return;

        // Initialize map
        const map = L.map(mapContainerRef.current).setView([54.5, -2.5], 6);
        mapRef.current = map;

        // Add OpenStreetMap tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        
        // Prepare data for heatmap
        const heatPoints = LOCATIONS.map(loc => [loc.lat, loc.lng, loc.courierNeed]);
        
        // Initialize heatmap layer
        const heatLayer = L.heatLayer(heatPoints, { 
            radius: 25, 
            blur: 15, 
            maxZoom: 12,
            gradient: {0.1: 'blue', 0.3: 'lime', 0.5: 'yellow', 1: 'red'} 
        });
        heatmapLayerRef.current = heatLayer;

        // Initialize marker cluster group
        const markerClusterGroup = L.markerClusterGroup();
        markerClusterGroupRef.current = markerClusterGroup;

        // Function to handle radius updates from popup sliders
        window.updateRadius = (id, radius) => {
            setRadii(prev => ({ ...prev, [id]: Number(radius) }));
        };

        // Initialize radii state and create map layers for each location
        const initialRadii: { [key: number]: number } = {};
        LOCATIONS.forEach(loc => {
            initialRadii[loc.id] = 10; // Default radius 10km

            const customIcon = createMarkerIcon(loc, true); // Initially show labels
            
            const marker = L.marker([loc.lat, loc.lng], { icon: customIcon });

            // Create circle overlay, but don't add to map yet
            const circle = L.circle([loc.lat, loc.lng], {
                color: '#000',
                weight: 1,
                fillColor: '#3b82f6',
                fillOpacity: 0.3,
                radius: 10 * 1000, // initial 10km radius in meters
            });

            // Link circle visibility to marker visibility for clustering
            marker.on('add', () => {
                if (!map.hasLayer(circle)) {
                    map.addLayer(circle);
                }
            });
            marker.on('remove', () => {
                if (map.hasLayer(circle)) {
                    map.removeLayer(circle);
                }
            });

            // Create popup content with a slider
            const popupContent = `
                <div class="w-48">
                    <h3 class="font-bold text-lg">${loc.city}</h3>
                    <p class="text-sm text-gray-600">Courier Need: <span class="font-semibold text-blue-600">${loc.courierNeed} sign-ups</span></p>
                    <div class="mt-2">
                        <label for="radius-${loc.id}" class="text-sm">Radius: <span id="radius-val-${loc.id}">10</span> km</label>
                        <input 
                            type="range" 
                            id="radius-${loc.id}" 
                            min="1" max="50" value="10" 
                            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                            oninput="document.getElementById('radius-val-${loc.id}').innerText = this.value; window.updateRadius(${loc.id}, this.value)"
                        />
                    </div>
                </div>
            `;
            marker.bindPopup(popupContent);
            
            layerRefs.current[loc.id] = { marker, circle };

            // Add marker to the cluster group
            markerClusterGroup.addLayer(marker);
        });

        // Add the cluster group to the map initially
        map.addLayer(markerClusterGroup);
        setRadii(initialRadii);
        
        // Add Legend
        const legend = L.control({ position: 'bottomleft' });
        legend.onAdd = function () {
            const div = L.DomUtil.create('div', 'info legend bg-white p-3 rounded-lg shadow-lg w-48');
            div.innerHTML = `
                <h4 class="font-bold mb-2 text-gray-800">Legend</h4>
                <div class="flex items-center mb-1">
                    <div class="bg-red-600 w-4 h-4 rounded-full border-2 border-white mr-2"></div>
                    <span class="text-sm text-gray-700">Courier Hotspot</span>
                </div>
                <div class="flex items-center mb-2">
                    <div class="w-4 h-4 rounded-full mr-2" style="background-color: rgba(59, 130, 246, 0.3); border: 1px solid #000;"></div>
                    <span class="text-sm text-gray-700">Coverage Radius</span>
                </div>
                <div>
                    <span class="font-semibold text-gray-700 text-sm">Heatmap Intensity</span>
                    <div class="w-full h-4 mt-1 rounded" style="background: linear-gradient(to right, blue, lime, yellow, red);"></div>
                    <div class="flex justify-between text-xs text-gray-600">
                        <span>Low</span>
                        <span>High</span>
                    </div>
                </div>
            `;
            return div;
        };
        legend.addTo(map);

        // Fullscreen Control
        const fullscreenControl = L.Control.extend({
            onAdd: function() {
                const button = L.DomUtil.create('button', 'leaflet-bar leaflet-control leaflet-control-custom');
                button.innerHTML = '&#x26F6;'; // Fullscreen symbol
                button.title = 'Toggle Fullscreen';
                button.onclick = () => {
                    const container = map.getContainer();
                     if (!document.fullscreenElement) {
                        container.requestFullscreen().catch(err => {
                            alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
                        });
                    } else {
                        document.exitFullscreen();
                    }
                };
                return button;
            },
        });
        map.addControl(new fullscreenControl({ position: 'topleft' }));


        return () => {
            map.remove();
            mapRef.current = null;
            window.updateRadius = () => {};
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Effect to update circle radii when React state changes
    useEffect(() => {
        Object.entries(radii).forEach(([id, radius]) => {
            const numericId = parseInt(id, 10);
            if (layerRefs.current[numericId]) {
                const radiusInMeters = Number(radius) * 1000;
                layerRefs.current[numericId].circle.setRadius(radiusInMeters);
                
                const popupSlider = document.getElementById(`radius-${numericId}`) as HTMLInputElement;
                if (popupSlider) {
                    popupSlider.value = String(radius);
                    const radiusValueDisplay = document.getElementById(`radius-val-${numericId}`);
                    if (radiusValueDisplay) {
                        radiusValueDisplay.innerText = String(radius);
                    }
                }
            }
        });
    }, [radii]);
    
    // Effect to toggle the heatmap layer
    useEffect(() => {
        if (!mapRef.current || !heatmapLayerRef.current) return;
        const map = mapRef.current;
        const heatmap = heatmapLayerRef.current;
    
        if (showHeatmap) {
            if (!map.hasLayer(heatmap)) {
                map.addLayer(heatmap);
            }
        } else {
            if (map.hasLayer(heatmap)) {
                map.removeLayer(heatmap);
            }
        }
    }, [showHeatmap]);

    // Effect for synchronizing all radii with the uniform radius
    useEffect(() => {
        if (isSynced) {
            const newRadii = Object.keys(radii).reduce((acc, id) => {
                acc[parseInt(id, 10)] = uniformRadius;
                return acc;
            }, {} as { [key: number]: number });
            setRadii(newRadii);
        }
    }, [isSynced, uniformRadius]);
    
    // Effect to toggle marker labels
    useEffect(() => {
        LOCATIONS.forEach(loc => {
            if (layerRefs.current[loc.id]) {
                const marker = layerRefs.current[loc.id].marker;
                const newIcon = createMarkerIcon(loc, showLabels);
                marker.setIcon(newIcon);
            }
        });
    }, [showLabels]);

    // Effect to toggle clustering
    useEffect(() => {
        if (!mapRef.current || !markerClusterGroupRef.current) return;
        const map = mapRef.current;
        const markerClusterGroup = markerClusterGroupRef.current;

        if (isClusteringEnabled) {
            // Remove individual markers if they were added
            Object.values(layerRefs.current).forEach(({ marker }) => {
                if (map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            // Add cluster group
            if (!map.hasLayer(markerClusterGroup)) {
                map.addLayer(markerClusterGroup);
            }
        } else {
            // Remove cluster group
            if (map.hasLayer(markerClusterGroup)) {
                map.removeLayer(markerClusterGroup);
            }
            // Add individual markers
            Object.values(layerRefs.current).forEach(({ marker }) => {
                if (!map.hasLayer(marker)) {
                    map.addLayer(marker);
                }
            });
        }
    }, [isClusteringEnabled]);

    const handleLocationSelect = (loc: LocationData) => {
        if (mapRef.current && layerRefs.current[loc.id]) {
            const map = mapRef.current;
            const { marker } = layerRefs.current[loc.id];
            
            if (isClusteringEnabled && markerClusterGroupRef.current) {
                // Use zoomToShowLayer to navigate to the marker, even if it's in a cluster
                markerClusterGroupRef.current.zoomToShowLayer(marker, () => {
                    marker.openPopup();
                });
            } else {
                // When clustering is off, just pan to the marker's location and open the popup
                map.setView(marker.getLatLng(), 13); // Zoom level 13 is a reasonable detail level
                marker.openPopup();
            }
        }
    };

    return (
        <div className="h-full w-full flex flex-col md:flex-row bg-gray-100">
            {/* Control Panel */}
            <div className="w-full md:w-80 lg:w-96 bg-white shadow-lg p-4 flex flex-col z-[1000] overflow-y-auto">
                <header className="mb-4">
                    <h1 className="text-2xl font-bold text-gray-800">Courier Hotspots</h1>
                    <p className="text-sm text-gray-500">UK Campaign Planner</p>
                </header>

                {/* Search Box */}
                <div className="mb-4">
                    <input
                        type="text"
                        placeholder="Search for a location..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex-grow overflow-y-auto border-t border-gray-200">
                    <ul className="divide-y divide-gray-200">
                        {filteredLocations.map(loc => (
                            <li key={loc.id} onClick={() => handleLocationSelect(loc)}
                                className="p-3 hover:bg-blue-50 cursor-pointer transition-colors duration-150">
                                <p className="font-semibold text-gray-700">{loc.city}</p>
                                <p className="text-xs text-gray-500">{loc.region}</p>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Global Controls */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                    <h3 className="font-bold text-lg mb-2">Global Controls</h3>
                    <div className="flex items-center justify-between mb-3">
                        <label htmlFor="enable-clustering" className="font-semibold text-gray-700">Enable Clustering</label>
                        <input
                            type="checkbox"
                            id="enable-clustering"
                            checked={isClusteringEnabled}
                            onChange={(e) => setIsClusteringEnabled(e.target.checked)}
                            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                    </div>
                    <div className="flex items-center justify-between mb-3">
                        <label htmlFor="show-heatmap" className="font-semibold text-gray-700">Show Heatmap</label>
                        <input
                            type="checkbox"
                            id="show-heatmap"
                            checked={showHeatmap}
                            onChange={(e) => setShowHeatmap(e.target.checked)}
                            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                    </div>
                    <div className="flex items-center justify-between mb-3">
                        <label htmlFor="show-labels" className="font-semibold text-gray-700">Show Labels</label>
                        <input
                            type="checkbox"
                            id="show-labels"
                            checked={showLabels}
                            onChange={(e) => setShowLabels(e.target.checked)}
                            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                    </div>
                    <div className="flex items-center justify-between mb-2">
                        <label htmlFor="sync-all" className="font-semibold text-gray-700">Sync All Radii</label>
                        <input
                            type="checkbox"
                            id="sync-all"
                            checked={isSynced}
                            onChange={(e) => setIsSynced(e.target.checked)}
                            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="uniform-radius" className="text-sm">Uniform Radius: <span className="font-bold">{uniformRadius} km</span></label>
                        <input
                            type="range"
                            id="uniform-radius"
                            min="1" max="50"
                            value={uniformRadius}
                            onChange={(e) => setUniformRadius(Number(e.target.value))}
                            disabled={!isSynced}
                            className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${isSynced ? 'bg-blue-200' : 'bg-gray-200'}`}
                        />
                    </div>
                </div>
            </div>

            {/* Map Container */}
            <div ref={mapContainerRef} className="flex-grow h-full w-full" />
        </div>
    );
};

export default App;
