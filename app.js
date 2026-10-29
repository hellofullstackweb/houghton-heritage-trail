// --- Application State ---
let trailData = [];
let currentStopIndex = 0;
let userCoords = null;
let map, userMarker;
let markers = [];
let isTrackingLocation = false;

// Center of Houghton-le-Spring
const HOUGHTON_COORDS = [54.8420, -1.4680];

// --- Initialize App ---
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  loadTrailData();
  bindUIEvents();
  // Location is NOT called here anymore — user must tap "Start Trail" or "Recenter" first
});

// 1. Initialize Map with Esri World Street Map (100% Free, No API key needed)
function initMap() {
  map = L.map('map', {
    zoomControl: false
  }).setView(HOUGHTON_COORDS, 16);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom',
    maxZoom: 19
  }).addTo(map);
}

// 2. Fetch Structured Data
async function loadTrailData() {
  try {
    const res = await fetch('./data/trail-data.json');
    trailData = await res.json();
    renderMarkers();
    renderListView();
  } catch (err) {
    console.error("Error loading trail-data.json:", err);
  }
}

// 3. Drop Custom Numbered Pins on Map
function renderMarkers() {
  trailData.forEach((stop, index) => {
    const customIcon = L.divIcon({
      className: 'custom-pin',
      html: `<span>${stop.id}</span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([stop.coords.lat, stop.coords.lng], { icon: customIcon })
      .addTo(map)
      .on('click', () => openStoryDrawer(index));

    markers.push(marker);
  });
}

// 4. Populate Accessible List View
function renderListView() {
  const container = document.getElementById('stops-list');
  if (!container) return;
  container.innerHTML = '';

  trailData.forEach((stop, index) => {
    const distanceText = userCoords 
      ? `${Math.round(calculateDistance(userCoords.lat, userCoords.lng, stop.coords.lat, stop.coords.lng))}m away`
      : 'Walking stop';

    const card = document.createElement('div');
    card.className = 'list-card';
    card.innerHTML = `
      <div>
        <h3>Stop ${stop.id}: ${stop.title}</h3>
        <p>${stop.era}</p>
      </div>
      <span class="distance">${distanceText} ➔</span>
    `;
    card.addEventListener('click', () => {
      switchView('map');
      openStoryDrawer(index);
    });
    container.appendChild(card);
  });
}

// 5. Drawer & View Navigation
function openStoryDrawer(index) {
  currentStopIndex = index;
  const stop = trailData[index];

  const audioEl = document.getElementById('story-audio');
  audioEl.pause();

  document.getElementById('story-stop-num').innerText = `STOP ${stop.id} OF ${trailData.length}`;
  document.getElementById('story-title').innerText = stop.title;
  document.getElementById('story-era').innerText = `${stop.era} • ${stop.category}`;
  document.getElementById('story-image').src = stop.image;
  document.getElementById('story-description').innerText = stop.description;
  document.getElementById('story-duration').innerText = stop.audioDuration;
  
  const sourceEl = document.getElementById('audio-source');
  sourceEl.src = stop.audio;
  audioEl.load();

  const nextBtn = document.getElementById('btn-next-stop');
  if (index === trailData.length - 1) {
    nextBtn.innerText = "Complete Trail 🎉";
  } else {
    nextBtn.innerText = "Next Stop ➔";
  }

  map.panTo([stop.coords.lat, stop.coords.lng]);
  document.getElementById('story-drawer').classList.remove('hidden');
}

function closeStoryDrawer() {
  document.getElementById('story-audio').pause();
  document.getElementById('story-drawer').classList.add('hidden');
}

// 6. User-Initiated Geolocation
function startLocationTracking() {
  if (isTrackingLocation || !navigator.geolocation) return;
  isTrackingLocation = true;

  const userIcon = L.divIcon({
    className: 'user-gps-dot',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  navigator.geolocation.watchPosition(
    (pos) => {
      userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };

      if (!userMarker) {
        userMarker = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon }).addTo(map);
      } else {
        userMarker.setLatLng([userCoords.lat, userCoords.lng]);
      }
      renderListView();
    },
    (err) => {
      console.warn("Location permission denied or unavailable:", err.message);
    },
    { enableHighAccuracy: true }
  );
}

// Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 7. Bind Interactive Events
function bindUIEvents() {
  // Only request location when user taps "Start Walking Trail"
  document.getElementById('btn-start-trail').addEventListener('click', () => {
    document.getElementById('welcome-sheet').classList.add('hidden');
    startLocationTracking();
  });

  document.getElementById('btn-close-drawer').addEventListener('click', closeStoryDrawer);

  document.getElementById('btn-next-stop').addEventListener('click', () => {
    if (currentStopIndex === trailData.length - 1) {
      closeStoryDrawer();
      document.getElementById('completion-modal').classList.remove('hidden');
    } else {
      openStoryDrawer(currentStopIndex + 1);
    }
  });

  document.getElementById('btn-restart').addEventListener('click', () => {
    document.getElementById('completion-modal').classList.add('hidden');
    map.setView(HOUGHTON_COORDS, 16);
  });

  document.getElementById('btn-map-view').addEventListener('click', () => switchView('map'));
  document.getElementById('btn-list-view').addEventListener('click', () => switchView('list'));

  // Request/recenter location when user clicks the target button
  document.getElementById('btn-recenter').addEventListener('click', () => {
    if (!isTrackingLocation) {
      startLocationTracking();
    }
    if (userCoords) {
      map.setView([userCoords.lat, userCoords.lng], 17);
    } else {
      map.setView(HOUGHTON_COORDS, 16);
    }
  });

  document.getElementById('btn-info').addEventListener('click', () => {
    document.getElementById('welcome-sheet').classList.remove('hidden');
  });
}

function switchView(view) {
  const mapBtn = document.getElementById('btn-map-view');
  const listBtn = document.getElementById('btn-list-view');
  const listView = document.getElementById('list-view');

  if (view === 'map') {
    mapBtn.classList.add('active');
    listBtn.classList.remove('active');
    listView.classList.add('hidden');
  } else {
    listBtn.classList.add('active');
    mapBtn.classList.remove('active');
    listView.classList.remove('hidden');
  }
}