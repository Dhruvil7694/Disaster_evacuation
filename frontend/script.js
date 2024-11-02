// State management with additional properties for emergency routing
const state = {
  map: null,
  startMarker: null,
  endMarker: null,
  routeLayer: null,
  selectedCity: null,
  mapMode: null,
  cities: [],
  isLoading: false,
  alternativeRoutes: [], // Store multiple route options
  currentRouteIndex: 0,
  emergencyFactors: {
    avoiding: new Set(), // Areas to avoid
    preferredRoads: new Set(), // Emergency routes
    safePoints: [], // Emergency assembly points
  },
};

// Constants
const API_BASE_URL = "http://localhost:5000";
const DEFAULT_CENTER = [28.6139, 77.209];
const DEFAULT_ZOOM = 12;

// Initialize map and fetch city list
document.addEventListener("DOMContentLoaded", () => {
  initializeMap();
  fetchCities();
  setupEventListeners();
});

// Initialize the map with default center and zoom
function initializeMap() {
  try {
    state.map = L.map("map").setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(state.map);
    state.map.on("click", handleMapClick);
  } catch (error) {
    showToast("Failed to initialize map", "error");
    console.error("Map initialization error:", error);
  }
}

// Utility function: Debounce
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Create custom icon for markers
function createCustomIcon(color, text) {
  return L.divIcon({
    className: "custom-div-icon",
    html: `<div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; justify-content: center; align-items: center; color: white; font-weight: bold;">${text}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

// Normalize text for consistent comparison
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Modified handleCitySearch with normalization
// Modified handleCitySearch with normalization and debugging
function handleCitySearch(event) {
  const searchTerm = normalizeText(event.target.value);
  console.log("City search term:", searchTerm); // Debugging log

  const filteredCities = state.cities.filter((city) =>
    normalizeText(city.city).includes(searchTerm)
  );
  console.log("Filtered cities:", filteredCities); // Debugging log

  populateCityList(filteredCities);
}

// UI Elements
const elements = {
  citySearch: document.getElementById("city-search"),
  cityList: document.getElementById("city-list"),
  setStart: document.getElementById("set-start"),
  setEnd: document.getElementById("set-end"),
  findRoute: document.getElementById("find-route"),
  reset: document.getElementById("reset"),
  startCoordinates: document.getElementById("start-coordinates"),
  endCoordinates: document.getElementById("end-coordinates"),
  routeDistance: document.getElementById("route-distance"),
  routeTime: document.getElementById("route-time"),
  loadingOverlay: document.getElementById("loading-overlay"),
};

// Set up UI event listeners for buttons and inputs
// Set up UI event listeners for buttons and inputs
function setupEventListeners() {
  elements.citySearch.addEventListener(
    "input",
    debounce(handleCitySearch, 300)
  );
  elements.setStart.addEventListener("click", () => setMapMode("start"));
  elements.setEnd.addEventListener("click", () => setMapMode("end"));
  elements.findRoute.addEventListener("click", findRoute); // Event listener for Find Route
  elements.reset.addEventListener("click", resetAll);
}

// Fetch city data from backend and populate the city list
async function fetchCities() {
  try {
    console.log("Fetching city data..."); // Debugging log
    showLoading();
    const response = await fetch(`${API_BASE_URL}/api/cities`);
    if (!response.ok) throw new Error("Failed to fetch cities");

    const data = await response.json();
    console.log("City data fetched successfully:", data); // Debugging log
    state.cities = data;
    populateCityList(state.cities);
  } catch (error) {
    console.error("Error fetching cities:", error);
    showToast("Error loading cities: " + error.message, "error");
  } finally {
    hideLoading();
  }
}

// Populate the city dropdown or list
function populateCityList(cities) {
  elements.cityList.innerHTML = "";
  if (cities.length === 0) {
    const noResults = document.createElement("div");
    noResults.className = "city-item no-results";
    noResults.textContent = "No cities found";
    elements.cityList.appendChild(noResults);
    elements.cityList.classList.add("active"); // Ensure the dropdown is visible
    return;
  }

  cities.forEach((city) => {
    const cityItem = document.createElement("div");
    cityItem.className = "city-item";
    cityItem.textContent = city.city;
    cityItem.onclick = () => selectCity(city);
    elements.cityList.appendChild(cityItem);
  });

  elements.cityList.classList.add("active"); // Ensure the dropdown is visible
}

// Add these styles to your CSS
const style = document.createElement("style");
style.textContent = `
    .route-info-marker {
        background: none;
        border: none;
    }
    .info-point {
        width: 12px;
        height: 12px;
        background-color: #ff8833;
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 0 4px rgba(0,0,0,0.3);
    }
`;
document.head.appendChild(style);

// Select a city and center the map on it
function selectCity(city) {
  state.selectedCity = city;
  elements.citySearch.value = city.city;
  elements.cityList.classList.remove("active");
  state.map.setView([city.lat, city.lng], DEFAULT_ZOOM);
  showToast(`Selected city: ${city.city}`, "success");
}

// Set map mode for setting start or end points
function setMapMode(mode) {
  state.mapMode = mode;
  updateUIState();
}

// Update UI for active start or end mode
function updateUIState() {
  elements.setStart.classList.toggle("active", state.mapMode === "start");
  elements.setEnd.classList.toggle("active", state.mapMode === "end");
  elements.findRoute.disabled = !(state.startMarker && state.endMarker);
}

// Handle map clicks to set start or end points
function handleMapClick(e) {
  if (!state.mapMode) return;

  const { lat, lng } = e.latlng;
  if (state.mapMode === "start") {
    setStartPoint(lat, lng);
  } else if (state.mapMode === "end") {
    setEndPoint(lat, lng);
  }
  state.mapMode = null;
  updateUIState();
}

// Set start point on the map
function setStartPoint(lat, lng) {
  if (state.startMarker) state.map.removeLayer(state.startMarker);
  state.startMarker = L.marker([lat, lng], {
    icon: createCustomIcon("green", "S"),
  }).addTo(state.map);
  elements.startCoordinates.textContent = `${lat.toFixed(4)}, ${lng.toFixed(
    4
  )}`;
}

// Set end point on the map
function setEndPoint(lat, lng) {
  if (state.endMarker) state.map.removeLayer(state.endMarker);
  state.endMarker = L.marker([lat, lng], {
    icon: createCustomIcon("red", "E"),
  }).addTo(state.map);
  elements.endCoordinates.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// Modified findRoute function with improved error handling and emergency routing
// Update the findRoute function to handle the enhanced response
async function findRoute(event) {
  event.preventDefault();

  if (!validateRouteInputs()) {
    showToast("Please set both start and end points", "error");
    return;
  }

  if (!state.selectedCity) {
    showToast("Please select a city first", "error");
    return;
  }

  try {
    showLoading();
    const response = await fetch(`${API_BASE_URL}/api/find_route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city: state.selectedCity.city,
        start_coords: [
          state.startMarker.getLatLng().lat,
          state.startMarker.getLatLng().lng,
        ],
        end_coords: [
          state.endMarker.getLatLng().lat,
          state.endMarker.getLatLng().lng,
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to fetch route");
    }

    const data = await response.json();

    if (!data.route || data.route.length === 0) {
      throw new Error("No valid route found");
    }

    // Convert route coordinates to LatLng array and display
    const routeLatLngs = data.route.map((coord) =>
      L.latLng(coord[0], coord[1])
    );
    displayRoute(routeLatLngs);

    // Display route statistics
    if (data.statistics) {
      elements.routeDistance.textContent = `${data.statistics.distance_km.toFixed(
        2
      )} km`;
      elements.routeTime.textContent = formatTime(
        data.statistics.estimated_time_minutes
      );
    }

    // Add route information markers
    if (data.route.length > 2) {
      addRouteInfoMarkers(routeLatLngs);
    }

    showToast("Route found successfully!", "success");
  } catch (error) {
    console.error("Error finding route:", error);
    showToast(error.message, "error");
  } finally {
    hideLoading();
  }
}

// Display the main route on the map
// Enhanced route display function with animations
function displayRoute(routeCoords) {
  if (state.routeLayer) {
    state.map.removeLayer(state.routeLayer);
  }

  // Create route polyline with animated dash array
  state.routeLayer = L.polyline(routeCoords, {
    color: "#3388ff",
    weight: 5,
    opacity: 0.8,
    lineCap: "round",
    lineJoin: "round",
    dashArray: "10, 10",
    dashOffset: "0",
    className: "animated-route",
  }).addTo(state.map);

  // Add route animation
  const style = document.createElement("style");
  style.textContent = `
    @keyframes dash {
      to {
        stroke-dashoffset: -20;
      }
    }
    .animated-route {
      animation: dash 1.5s linear infinite;
    }
  `;
  document.head.appendChild(style);

  // Fit map bounds to show entire route with padding
  const bounds = state.routeLayer.getBounds();
  state.map.fitBounds(bounds, {
    padding: [50, 50],
    maxZoom: 16,
  });
}

// Enhanced route info markers with improved visibility
function addRouteInfoMarkers(routeCoords) {
  // Sample key points along the route
  const keyPoints = sampleRoutePoints(routeCoords);

  keyPoints.forEach((point, index) => {
    const isEndPoint = index === 0 || index === keyPoints.length - 1;
    const markerColor =
      index === 0
        ? "#4CAF50"
        : index === keyPoints.length - 1
        ? "#f44336"
        : "#FF9800";

    const marker = L.marker(point, {
      icon: L.divIcon({
        className: "route-info-marker",
        html: `
          <div class="info-point" style="
            background-color: ${markerColor};
            width: ${isEndPoint ? "16px" : "12px"};
            height: ${isEndPoint ? "16px" : "12px"};
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 0 4px rgba(0,0,0,0.3);
          "></div>
        `,
        iconSize: isEndPoint ? [16, 16] : [12, 12],
        iconAnchor: isEndPoint ? [8, 8] : [6, 6],
      }),
    }).addTo(state.map);

    // Add informative tooltips
    const tooltipContent =
      index === 0
        ? "Start Point"
        : index === keyPoints.length - 1
        ? "Destination"
        : `Waypoint ${index}`;
    marker.bindTooltip(tooltipContent, {
      permanent: false,
      direction: "top",
      className: "route-tooltip",
    });
  });
}

// Sample points along the route for markers
function sampleRoutePoints(routeCoords) {
  const points = [];
  const totalPoints = routeCoords.length;

  // Always include start and end points
  points.push(routeCoords[0]);

  // Sample intermediate points
  if (totalPoints > 10) {
    const step = Math.floor(totalPoints / 5);
    for (let i = step; i < totalPoints - step; i += step) {
      points.push(routeCoords[i]);
    }
  }

  // Add end point
  points.push(routeCoords[totalPoints - 1]);

  return points;
}

// Improved key points identification
function identifyKeyPoints(routeCoords) {
  const keyPoints = [];
  const threshold = 30; // degrees
  const minDistance = 0.1; // km

  for (let i = 1; i < routeCoords.length - 1; i++) {
    const angle = calculateBearing(
      routeCoords[i - 1],
      routeCoords[i],
      routeCoords[i + 1]
    );

    const distance = calculateHaversineDistance(
      routeCoords[i - 1].lat,
      routeCoords[i - 1].lng,
      routeCoords[i].lat,
      routeCoords[i].lng
    );

    if (Math.abs(angle) > threshold && distance > minDistance) {
      keyPoints.push(routeCoords[i]);
    }
  }

  // Always include start and end points
  keyPoints.unshift(routeCoords[0]);
  keyPoints.push(routeCoords[routeCoords.length - 1]);

  return keyPoints;
}

// Calculate bearing between three points
function calculateBearing(point1, point2, point3) {
  const bearing1 = Math.atan2(point2.lng - point1.lng, point2.lat - point1.lat);
  const bearing2 = Math.atan2(point3.lng - point2.lng, point3.lat - point2.lat);

  let angle = (bearing2 - bearing1) * (180 / Math.PI);
  if (angle < -180) angle += 360;
  if (angle > 180) angle -= 360;

  return angle;
}

// Improved distance calculation using Haversine formula
function calculateRouteDistance(routeCoords) {
  let distance = 0;
  for (let i = 0; i < routeCoords.length - 1; i++) {
    distance += calculateHaversineDistance(
      routeCoords[i][0],
      routeCoords[i][1],
      routeCoords[i + 1][0],
      routeCoords[i + 1][1]
    );
  }
  return distance;
}

// Haversine formula for more accurate distance calculation
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Improved time estimation considering emergency factors
function estimateRouteTime(distance) {
  const baseSpeed = 30; // Base speed in km/h
  const emergencyFactor = 0.8; // Reduction factor for emergency situations
  const adjustedSpeed = baseSpeed * emergencyFactor;

  // Convert to minutes
  return (distance / adjustedSpeed) * 60;
}

// Display alternative routes
function displayAlternativeRoutes() {
  if (state.alternativeRoutes.length <= 1) return;

  // Remove existing alternative routes
  if (state.alternativeRoutes) {
    state.alternativeRoutes.forEach((layer) => state.map.removeLayer(layer));
  }

  state.alternativeRoutes = state.alternativeRoutes
    .slice(1) // Skip primary route
    .map((routeCoords) => displayRoute(routeCoords, false));
}

// Reset all markers and routes
function resetAll() {
  if (state.startMarker) state.map.removeLayer(state.startMarker);
  if (state.endMarker) state.map.removeLayer(state.endMarker);
  if (state.routeLayer) state.map.removeLayer(state.routeLayer);

  state.startMarker = null;
  state.endMarker = null;
  state.routeLayer = null;
  state.selectedCity = null;

  elements.startCoordinates.textContent = "Not set";
  elements.endCoordinates.textContent = "Not set";
  elements.routeDistance.textContent = "-";
  elements.routeTime.textContent = "-";
  elements.citySearch.value = "";
  elements.cityList.innerHTML = "";
  showToast("All inputs reset", "info");
}

// Format time as hours and minutes
function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

// Validate if both start and end points are set
function validateRouteInputs() {
  return state.startMarker && state.endMarker;
}

// Show and hide loading overlay
function showLoading() {
  state.isLoading = true;
  console.log("Loading started"); // Debugging log
  elements.loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  state.isLoading = false;
  console.log("Loading ended"); // Debugging log
  elements.loadingOverlay.classList.add("hidden");
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${
    type === "success" ? "fa-check-circle" : "fa-exclamation-circle"
  }"></i><span>${message}</span>`;

  // Append the toast to the container
  document.getElementById("toast-container").appendChild(toast);

  // Set a timeout to fade out and remove the toast after 3 seconds
  setTimeout(() => {
    toast.classList.add("fade-out"); // Add fade-out class for CSS animation
    setTimeout(() => toast.remove(), 500); // Wait for fade-out animation to finish, then remove
  }, 3000);
}
