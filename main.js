class WiFiSpotFinder {
    constructor() {
        this.spots = [];
        this.filteredSpots = [];
        this.map = null;
        this.markers = null;
        this.currentPage = 1;
        this.spotsPerPage = 10;
        
        // Add route planning properties
        this.routeControl = null;
        this.selectedSpots = new Set();
        
        // Initialize elements
        this.elements = {
            welcomeScreen: document.getElementById('welcomeScreen'),
            mainApp: document.getElementById('mainApp'),
            searchInput: document.getElementById('searchInput'),
            searchButton: document.getElementById('searchButton'),
            nearMeButton: document.getElementById('nearMeButton'),
            spotsList: document.getElementById('spotsList'),
            spotCount: document.getElementById('spotCount'),
            resultsMessage: document.getElementById('resultsMessage'),
            loadMoreButton: document.getElementById('loadMoreButton'),
            toggleAdvanced: document.getElementById('toggleAdvanced'),
            advancedFilters: document.getElementById('advancedFilters'),
            applyFilters: document.getElementById('applyFilters'),
            planRoute: document.getElementById('planRoute'),
            routeMessage: document.getElementById('routeMessage')
        };

        // Add welcome screen elements
        this.welcomeElements = {
            welcomeScreen: document.getElementById('welcomeScreen'),
            welcomeSearchInput: document.getElementById('welcomeSearchInput'),
            welcomeSearchButton: document.getElementById('welcomeSearchButton'),
            welcomeNearMeButton: document.getElementById('welcomeNearMeButton'),
            mainApp: document.getElementById('mainApp')
        };

        // Add speed test elements
        this.speedTest = {
            button: document.getElementById('speedTestButton'),
            results: document.getElementById('speedTestResults'),
            downloadSpeed: document.getElementById('downloadSpeed'),
            uploadSpeed: document.getElementById('uploadSpeed'),
            latency: document.getElementById('latency'),
            connectionType: document.getElementById('connectionType')
        };

        // Initialize map
        this.initializeMap();
        this.loadSpots();
        this.setupEventListeners();

        // Initialize speed test
        this.initializeSpeedTest();
    }

    initializeMap() {
        this.map = L.map('map').setView([40.7128, -74.0060], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        this.markers = L.markerClusterGroup();
        this.map.addLayer(this.markers);
    }

    async loadSpots() {
        try {
            const response = await fetch('NYC_WIFI_data.csv');
            const csvText = await response.text();
            this.spots = this.parseCSV(csvText);
            this.initializeFilters();
            this.updateResults(this.spots);
        } catch (error) {
            console.error('Error loading spots:', error);
            this.elements.resultsMessage.textContent = 'Error loading WiFi spots data';
        }
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n');
        const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
        
        return lines.slice(1)
            .filter(line => line.trim())
            .map((line, index) => {
                const values = line.split(',').map(v => v.trim());
                const boroughValue = values[headers.indexOf('borough')] || 
                                   values[headers.indexOf('boroname')] || 
                                   values[headers.indexOf('borocode')] || 
                                   'Unknown';
                
                return {
                    id: index,
                    name: values[headers.indexOf('name')] || values[headers.indexOf('location')] || 'Unknown',
                    location: values[headers.indexOf('location')] || 'Unknown',
                    provider: values[headers.indexOf('provider')] || 'Unknown',
                    type: values[headers.indexOf('type')] || 'Unknown',
                    latitude: parseFloat(values[headers.indexOf('latitude')]),
                    longitude: parseFloat(values[headers.indexOf('longitude')]),
                    borough: this.getBoroughName(boroughValue),
                    zipcode: values[headers.indexOf('zipcode')] || values[headers.indexOf('postcode')] || 'Unknown'
                };
            })
            .filter(spot => spot.latitude && spot.longitude && !isNaN(spot.latitude) && !isNaN(spot.longitude));
    }

    initializeFilters() {
        const boroughs = [...new Set(this.spots.map(spot => spot.borough))].filter(Boolean).sort();
        const types = [...new Set(this.spots.map(spot => spot.type))].filter(Boolean).sort();

        const boroughFilter = document.getElementById('boroughFilter');
        const typeFilter = document.getElementById('typeFilter');

        boroughFilter.innerHTML = '<option value="">All Boroughs</option>';
        boroughs.forEach(borough => {
            const option = document.createElement('option');
            option.value = borough;
            option.textContent = borough;
            boroughFilter.appendChild(option);
        });

        typeFilter.innerHTML = '<option value="">All Types</option>';
        types.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            typeFilter.appendChild(option);
        });
    }

    setupEventListeners() {
        this.elements.searchButton.addEventListener('click', () => this.performSearch());
        this.elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.performSearch();
        });
        this.elements.nearMeButton.addEventListener('click', () => this.findNearMe());
        this.elements.toggleAdvanced.addEventListener('click', () => {
            this.elements.advancedFilters.classList.toggle('hidden');
        });
        this.elements.applyFilters.addEventListener('click', () => this.applyFilters());
        this.elements.loadMoreButton.addEventListener('click', () => this.loadMore());

        // Add welcome screen listeners
        this.welcomeElements.welcomeSearchButton.addEventListener('click', () => this.handleWelcomeSearch());
        this.welcomeElements.welcomeNearMeButton.addEventListener('click', () => this.handleWelcomeNearMe());
        this.welcomeElements.welcomeSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleWelcomeSearch();
        });

        // Add route planning listeners
        this.elements.planRoute.addEventListener('click', () => this.toggleRoutePlanning());
    }

    async performSearch() {
        const searchTerm = this.elements.searchInput.value.toLowerCase().trim();
        if (!searchTerm) return;

        try {
            const location = await this.geocodeAddress(searchTerm);
            this.map.setView([location.lat, location.lng], 15);
            this.filterSpotsByDistance(location);
        } catch (error) {
            this.filterSpotsByText(searchTerm);
        }
    }

    async geocodeAddress(address) {
        // Check if input is a ZIP code
        const zipRegex = /^\d{5}$/;
        const isZipCode = zipRegex.test(address);

        if (isZipCode) {
            // First try to find spots with matching ZIP code
            const spotsInZip = this.spots.filter(spot => spot.zipcode === address);
            if (spotsInZip.length > 0) {
                // Calculate center point of all spots in this ZIP code
                const center = spotsInZip.reduce((acc, spot) => {
                    return {
                        lat: acc.lat + spot.latitude / spotsInZip.length,
                        lng: acc.lng + spot.longitude / spotsInZip.length
                    };
                }, { lat: 0, lng: 0 });
                return center;
            }
        }

        // If not a ZIP code or no spots found, use Nominatim
        const query = isZipCode ? `${address}, New York City` : address;
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&bounded=1&viewbox=-74.2557,40.4957,-73.6895,40.9176`
        );
        const data = await response.json();
        
        if (!data.length) {
            throw new Error('Location not found');
        }

        // Verify the result is within NYC bounds
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        
        const nycBounds = {
            north: 40.9176,
            south: 40.4957,
            east: -73.6895,
            west: -74.2557
        };

        if (lat < nycBounds.south || lat > nycBounds.north || 
            lng < nycBounds.west || lng > nycBounds.east) {
            throw new Error('Location outside NYC');
        }

        return { lat, lng };
    }

    filterSpotsByDistance(location) {
        const radius = parseFloat(document.getElementById('radiusFilter')?.value || 2);
        const filteredSpots = this.spots.map(spot => ({
            ...spot,
            distance: this.calculateDistance(location.lat, location.lng, spot.latitude, spot.longitude)
        })).filter(spot => spot.distance <= radius)
          .sort((a, b) => a.distance - b.distance);

        this.updateResults(filteredSpots);
    }

    filterSpotsByText(searchTerm) {
        const zipRegex = /^\d{5}$/;
        const isZipCode = zipRegex.test(searchTerm);

        let filteredSpots = this.spots;
        
        if (isZipCode) {
            // Exact match for ZIP codes
            filteredSpots = filteredSpots.filter(spot => spot.zipcode === searchTerm);
        } else {
            // Fuzzy search for other terms
            filteredSpots = filteredSpots.filter(spot => {
                return ['name', 'location', 'provider', 'borough', 'zipcode']
                    .some(field => spot[field]?.toLowerCase().includes(searchTerm.toLowerCase()));
            });
        }

        this.updateResults(filteredSpots);
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 3959; // Earth's radius in miles (was 6371 km)
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                 Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
                 Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    toRad(degrees) {
        return degrees * (Math.PI / 180);
    }

    async findNearMe() {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject);
            });

            const location = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            this.map.setView([location.lat, location.lng], 15);
            this.filterSpotsByDistance(location);
        } catch (error) {
            alert('Unable to retrieve your location');
        }
    }

    updateResults(spots) {
        this.filteredSpots = spots;
        this.elements.spotCount.textContent = spots.length;
        this.elements.spotsList.innerHTML = '';
        
        if (spots.length === 0) {
            this.elements.resultsMessage.textContent = 'No spots found';
            this.elements.loadMoreButton.style.display = 'none';
            this.markers.clearLayers();
            return;
        }

        const spotsToShow = spots.slice(0, this.spotsPerPage * this.currentPage);
        spotsToShow.forEach(spot => this.createSpotCard(spot));
        
        this.elements.loadMoreButton.style.display = 
            spots.length > this.spotsPerPage * this.currentPage ? 'block' : 'none';
        
        this.updateMap(spots);
    }

    createSpotCard(spot) {
        const card = document.createElement('div');
        card.className = 'wifi-spot-card';
        const isSelected = this.selectedSpots.has(spot.id);
        
        if (isSelected) {
            card.classList.add('selected-for-route');
        }
        
        card.innerHTML = `
            <div class="card-header">
                <h3>${spot.name || 'Unknown Location'}</h3>
                <span class="type-badge">${spot.type || 'Unknown'}</span>
            </div>
            <div class="card-body">
                <p><i class="fas fa-map-marker-alt"></i> ${spot.location || 'No address available'}</p>
                <p><i class="fas fa-city"></i> ${spot.borough || 'Unknown Borough'}</p>
                <p><i class="fas fa-broadcast-tower"></i> ${spot.provider || 'Unknown Provider'}</p>
                ${spot.distance ? `<p><i class="fas fa-walking"></i> ${spot.distance.toFixed(2)} mi away</p>` : ''}
            </div>
            <div class="card-footer">
                <button onclick="app.focusOnMap(${spot.latitude}, ${spot.longitude})">
                    <i class="fas fa-map"></i> Show on Map
                </button>
                <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${spot.latitude},${spot.longitude}')">
                    <i class="fas fa-directions"></i> Directions
                </button>
                ${this.elements.planRoute.classList.contains('active') ? `
                    <button class="route-button ${isSelected ? 'active' : ''}" 
                            onclick="app.addToRoute({id: ${spot.id}, latitude: ${spot.latitude}, longitude: ${spot.longitude}})">
                        <i class="fas fa-route"></i> ${isSelected ? 'Remove from Route' : 'Add to Route'}
                    </button>
                ` : ''}
            </div>
        `;

        this.elements.spotsList.appendChild(card);
    }

    updateMap(spots) {
        this.markers.clearLayers();
        spots.forEach(spot => {
            const marker = L.marker([spot.latitude, spot.longitude])
                .bindPopup(this.createPopupContent(spot));
            this.markers.addLayer(marker);
        });
    }

    createPopupContent(spot) {
        return `
            <div class="popup-content">
                <h3>${spot.name}</h3>
                <p>${spot.location}</p>
                <p>Provider: ${spot.provider}</p>
                <p>Type: ${spot.type}</p>
            </div>
        `;
    }

    focusOnMap(lat, lng) {
        this.map.setView([lat, lng], 17);
    }

    loadMore() {
        this.currentPage++;
        this.updateResults(this.filteredSpots);
    }

    handleWelcomeSearch() {
        const searchTerm = this.welcomeElements.welcomeSearchInput.value.trim();
        if (!searchTerm) return;

        // Transfer search term to main app
        this.elements.searchInput.value = searchTerm;
        this.showMainApp();
        this.performSearch();
    }

    handleWelcomeNearMe() {
        this.showMainApp();
        this.findNearMe();
    }

    showMainApp() {
        this.welcomeElements.welcomeScreen.classList.add('fade-out');
        setTimeout(() => {
            this.welcomeElements.welcomeScreen.classList.add('hidden');
            this.welcomeElements.mainApp.classList.remove('hidden');
            this.welcomeElements.mainApp.classList.add('fade-in');
            // Refresh map after showing
            this.map.invalidateSize();
        }, 500);
    }

    applyFilters() {
        const borough = document.getElementById('boroughFilter').value.toLowerCase();
        const type = document.getElementById('typeFilter').value.toLowerCase();
        const searchTerm = this.elements.searchInput.value.toLowerCase().trim();

        let filteredSpots = this.spots;

        // Apply borough filter
        if (borough) {
            filteredSpots = filteredSpots.filter(spot => 
                spot.borough.toLowerCase() === borough
            );
        }

        // Apply type filter
        if (type) {
            filteredSpots = filteredSpots.filter(spot => 
                spot.type.toLowerCase() === type
            );
        }

        // Apply search term
        if (searchTerm) {
            filteredSpots = filteredSpots.filter(spot => {
                return ['name', 'location', 'provider', 'borough', 'zipcode']
                    .some(field => spot[field]?.toLowerCase().includes(searchTerm));
            });
        }

        this.currentPage = 1;
        this.updateResults(filteredSpots);
    }

    getBoroughName(code) {
        const boroughMap = {
            '1': 'Manhattan',
            '2': 'Bronx',
            '3': 'Brooklyn',
            '4': 'Queens',
            '5': 'Staten Island'
        };
        return boroughMap[code] || code; // Return original value if not a code
    }

    toggleRoutePlanning() {
        if (this.routeControl) {
            // Disable route planning
            this.map.removeControl(this.routeControl);
            this.routeControl = null;
            this.selectedSpots.clear();
            this.elements.planRoute.classList.remove('active');
            this.elements.routeMessage.textContent = '';
        } else {
            // Enable route planning
            this.selectedSpots.clear();
            this.elements.planRoute.classList.add('active');
            this.elements.routeMessage.textContent = 'Select WiFi spots to create a route (2-5 spots)';
        }
        this.updateResults(this.filteredSpots);
    }

    addToRoute(spot) {
        if (!this.elements.planRoute.classList.contains('active')) {
            return;
        }

        if (this.selectedSpots.has(spot.id)) {
            this.selectedSpots.delete(spot.id);
        } else if (this.selectedSpots.size < 5) {
            this.selectedSpots.add(spot.id);
        } else {
            alert('Maximum 5 spots allowed in a route');
            return;
        }

        this.updateRouteDisplay();
    }

    updateRouteDisplay() {
        // Clear existing route
        if (this.routeControl) {
            this.map.removeControl(this.routeControl);
            this.routeControl = null;
        }

        // Create new route if we have at least 2 spots
        if (this.selectedSpots.size >= 2) {
            const waypoints = Array.from(this.selectedSpots)
                .map(id => this.spots.find(s => s.id === id))
                .filter(spot => spot)
                .map(spot => L.latLng(spot.latitude, spot.longitude));

            try {
                this.routeControl = L.Routing.control({
                    waypoints,
                    router: L.Routing.osrmv1({
                        serviceUrl: 'https://router.project-osrm.org/route/v1',
                        profile: 'walking' // Use walking profile for pedestrian directions
                    }),
                    routeWhileDragging: false,
                    addWaypoints: false,
                    draggableWaypoints: false,
                    showAlternatives: true,
                    altLineOptions: {
                        styles: [
                            {color: 'gray', opacity: 0.4, weight: 4}
                        ]
                    },
                    lineOptions: {
                        styles: [{ 
                            color: '#2196f3', 
                            weight: 6,
                            opacity: 0.8
                        }]
                    },
                    createMarker: (i, wp, n) => {
                        return L.marker(wp.latLng, {
                            icon: L.divIcon({
                                className: 'route-marker',
                                html: `<div>${String.fromCharCode(65 + i)}</div>`, // Use letters A, B, C, etc.
                                iconSize: [24, 24]
                            }),
                            title: `Stop ${String.fromCharCode(65 + i)}`
                        });
                    },
                    containerClassName: 'route-instructions',
                    collapsible: true,
                    show: false, // Don't auto-show the instructions panel
                    units: 'metric'
                }).addTo(this.map);

                // Add custom styling and behavior
                this.routeControl.on('routesfound', (e) => {
                    const routes = e.routes;
                    const summary = routes[0].summary;
                    const instructions = routes[0].instructions;
                    
                    // Update route message with summary
                    this.elements.routeMessage.innerHTML = `
                        <div class="route-summary">
                            <span><i class="fas fa-walking"></i> ${(summary.totalDistance / 1609.34).toFixed(1)} mi</span>
                            <span><i class="fas fa-clock"></i> ${Math.round(summary.totalTime / 60)} mins</span>
                        </div>
                        <button id="showDirections" class="show-directions-btn">
                            <i class="fas fa-directions"></i> Show Directions
                        </button>
                    `;

                    // Add click handler for showing directions
                    document.getElementById('showDirections').addEventListener('click', () => {
                        const container = this.routeControl.getContainer();
                        container.style.display = container.style.display === 'none' ? 'block' : 'none';
                    });
                });

                // Fit map to show all waypoints
                const bounds = L.latLngBounds(waypoints);
                this.map.fitBounds(bounds, { padding: [50, 50] });
            } catch (error) {
                console.error('Error creating route:', error);
                alert('Error creating route. Please try again.');
            }
        }

        // Update all spot cards to show selection state
        this.updateResults(this.filteredSpots);
    }
}

// Initialize app
window.onload = () => {
    window.app = new WiFiSpotFinder();
}; 