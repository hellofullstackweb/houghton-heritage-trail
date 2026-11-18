// --- Application State ---
let trailData = [];
let currentStopIndex = 0;
let userCoords = null;
let map, userMarker;
let markers = [];
let isTrackingLocation = false;
let discoveredStops = new Set();
let trailPolyline = null;

// Center of Houghton-le-Spring
const HOUGHTON_COORDS = [54.8420, -1.4680];

// --- Initialize App ---
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  loadTrailData();
  bindUIEvents();
  registerServiceWorker();
});

// Register Service Worker for PWA & offline support
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.log('ServiceWorker registered with scope:', reg.scope))
        .catch((err) => console.warn('ServiceWorker registration failed:', err));
    });
  }
}

// 1. Initialize Map with Esri World Street Map (100% Free, reliable tiles)
function initMap() {
  map = L.map('map', {
    zoomControl: false
  }).setView(HOUGHTON_COORDS, 16);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, TomTom',
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

// 3. Drop Red Mystery Teardrop Pins & Connect with Dashed Path
function renderMarkers() {
  markers = [];
  const latLngs = [];

  trailData.forEach((stop, index) => {
    const isDiscovered = discoveredStops.has(stop.id);
    const customIcon = L.divIcon({
      className: `custom-pin ${isDiscovered ? 'discovered' : ''}`,
      html: `<span>${isDiscovered ? '✓' : '?'}</span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34]
    });

    const marker = L.marker([stop.coords.lat, stop.coords.lng], { icon: customIcon })
      .addTo(map)
      .on('click', () => openStoryDrawer(index));

    markers.push(marker);
    latLngs.push([stop.coords.lat, stop.coords.lng]);
  });

  // Connect all mystery stops with a subtle dashed walking route line
  if (trailPolyline) {
    map.removeLayer(trailPolyline);
  }
  if (latLngs.length > 1) {
    trailPolyline = L.polyline(latLngs, {
      color: '#dc2626',
      weight: 3,
      opacity: 0.55,
      dashArray: '6, 8'
    }).addTo(map);
  }

  // Fit all pins onto the screen automatically with padding
  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds(), {
      padding: [50, 50],
      maxZoom: 16
    });
  }
}

// 4. Populate Accessible List View
function renderListView() {
  const container = document.getElementById('stops-list');
  if (!container) return;
  container.innerHTML = '';

  trailData.forEach((stop, index) => {
    const distanceText = userCoords 
      ? `${Math.round(calculateDistance(userCoords.lat, userCoords.lng, stop.coords.lat, stop.coords.lng))}m away`
      : 'Mystery stop';

    const isDiscovered = discoveredStops.has(stop.id);

    const card = document.createElement('div');
    card.className = 'list-card';
    card.innerHTML = `
      <div>
        <h3>${isDiscovered ? '✅' : '📍'} ${stop.title}</h3>
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

  // Hide floating mini-bar when full drawer is open
  document.getElementById('mini-audio-bar').classList.add('hidden');

  // Mark stop as discovered and turn its map pin green
  if (!discoveredStops.has(stop.id)) {
    discoveredStops.add(stop.id);
    const pinEl = markers[index]?.getElement();
    if (pinEl) {
      pinEl.classList.add('discovered');
      pinEl.innerHTML = '<span>✓</span>';
    }
    renderListView();
  }

  document.getElementById('story-stop-num').innerText = `MYSTERY LOCATION • ${discoveredStops.size} OF ${trailData.length} DISCOVERED`;
  document.getElementById('story-title').innerText = stop.title;
  document.getElementById('story-era').innerText = `${stop.era} • ${stop.category}`;
  document.getElementById('story-description').innerText = stop.description;
  
  // Render Carousel
  renderGallery(stop.images || [stop.image]);

  const sourceEl = document.getElementById('audio-source');
  const audioEl = document.getElementById('story-audio');
  
  // Only change audio source if selecting a different stop
  if (!sourceEl.src.includes(stop.audio)) {
    audioEl.pause();
    sourceEl.src = stop.audio;
    audioEl.load();
  }

  const nextBtn = document.getElementById('btn-next-stop');
  if (discoveredStops.size === trailData.length && index === trailData.length - 1) {
    nextBtn.innerText = "Complete Trail 🎉";
  } else {
    nextBtn.innerText = "Next Mystery Stop ➔";
  }

  map.panTo([stop.coords.lat, stop.coords.lng]);
  document.getElementById('story-drawer').classList.remove('hidden');
}

function renderGallery(images) {
  const carousel = document.getElementById('gallery-carousel');
  const dotsContainer = document.getElementById('gallery-dots');
  const prevBtn = document.getElementById('btn-gallery-prev');
  const nextBtn = document.getElementById('btn-gallery-next');

  carousel.innerHTML = '';
  dotsContainer.innerHTML = '';

  const hasMultiple = images.length > 1;
  prevBtn.classList.toggle('hidden', !hasMultiple);
  nextBtn.classList.toggle('hidden', !hasMultiple);

  images.forEach((imgUrl, i) => {
    const img = document.createElement('img');
    img.src = imgUrl;
    img.className = 'gallery-item';
    img.alt = 'Historic photo';
    img.addEventListener('click', () => openLightbox(imgUrl));
    carousel.appendChild(img);

    if (hasMultiple) {
      const dot = document.createElement('span');
      dot.className = `dot ${i === 0 ? 'active' : ''}`;
      dot.addEventListener('click', () => {
        carousel.scrollTo({
          left: i * carousel.offsetWidth,
          behavior: 'smooth'
        });
      });
      dotsContainer.appendChild(dot);
    }
  });

  carousel.onscroll = () => {
    const scrollPos = carousel.scrollLeft;
    const width = carousel.offsetWidth;
    const activeIndex = Math.round(scrollPos / width);
    const dots = dotsContainer.querySelectorAll('.dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === activeIndex);
    });
  };
}

// Lightbox Handlers with Zoom Toggle
function openLightbox(url) {
  const modal = document.getElementById('image-lightbox');
  const img = document.getElementById('lightbox-img');
  img.src = url;
  img.classList.remove('zoomed');
  modal.classList.remove('hidden');

  img.onclick = (e) => {
    e.stopPropagation();
    img.classList.toggle('zoomed');
  };
}

function closeLightbox() {
  document.getElementById('image-lightbox').classList.add('hidden');
}

// Keeps audio playing in a floating mini-player when drawer closes
function closeStoryDrawer() {
  const audioEl = document.getElementById('story-audio');
  const miniBar = document.getElementById('mini-audio-bar');

  if (!audioEl.paused && audioEl.currentTime > 0 && !audioEl.ended) {
    document.getElementById('mini-title').innerText = trailData[currentStopIndex].title;
    miniBar.classList.remove('hidden');
  } else {
    miniBar.classList.add('hidden');
  }

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

// Haversine distance formula
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
  // Toggle minimize/expand on the Welcome Card handle or header
  const toggleWelcomeCard = () => {
    const sheet = document.getElementById('welcome-sheet');
    sheet.classList.remove('hidden');
    sheet.classList.toggle('minimized');
  };

  document.getElementById('welcome-handle').addEventListener('click', toggleWelcomeCard);
  document.getElementById('welcome-header-toggle').addEventListener('click', toggleWelcomeCard);

  // Start button minimizes the card into the slim bottom bar & triggers geolocation
  document.getElementById('btn-start-trail').addEventListener('click', () => {
    document.getElementById('welcome-sheet').classList.add('minimized');
    startLocationTracking();
  });

  document.getElementById('btn-close-drawer').addEventListener('click', closeStoryDrawer);

  document.getElementById('btn-next-stop').addEventListener('click', () => {
    if (discoveredStops.size === trailData.length && currentStopIndex === trailData.length - 1) {
      closeStoryDrawer();
      document.getElementById('completion-modal').classList.remove('hidden');
    } else {
      openStoryDrawer((currentStopIndex + 1) % trailData.length);
    }
  });

  // Carousel previous / next arrows (for desktop)
  document.getElementById('btn-gallery-prev').addEventListener('click', () => {
    const carousel = document.getElementById('gallery-carousel');
    carousel.scrollBy({ left: -carousel.offsetWidth, behavior: 'smooth' });
  });

  document.getElementById('btn-gallery-next').addEventListener('click', () => {
    const carousel = document.getElementById('gallery-carousel');
    carousel.scrollBy({ left: carousel.offsetWidth, behavior: 'smooth' });
  });

  // Lightbox close listeners
  document.getElementById('btn-close-lightbox').addEventListener('click', closeLightbox);
  document.getElementById('image-lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'image-lightbox') closeLightbox();
  });

  // Floating Mini-Player Controls
  document.getElementById('mini-player-expand').addEventListener('click', () => {
    openStoryDrawer(currentStopIndex);
  });

  document.getElementById('btn-mini-play').addEventListener('click', (e) => {
    e.stopPropagation();
    const audioEl = document.getElementById('story-audio');
    const playBtn = document.getElementById('btn-mini-play');
    if (audioEl.paused) {
      audioEl.play();
      playBtn.innerText = "❚❚";
    } else {
      audioEl.pause();
      playBtn.innerText = "▶";
    }
  });

  document.getElementById('btn-mini-close').addEventListener('click', (e) => {
    e.stopPropagation();
    const audioEl = document.getElementById('story-audio');
    audioEl.pause();
    audioEl.currentTime = 0;
    document.getElementById('mini-audio-bar').classList.add('hidden');
  });

  document.getElementById('story-audio').addEventListener('ended', () => {
    document.getElementById('mini-audio-bar').classList.add('hidden');
  });

  // Restart modal button
  document.getElementById('btn-restart').addEventListener('click', () => {
    document.getElementById('completion-modal').classList.add('hidden');
    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 16 });
    }
  });

  // Map & List toggles
  document.getElementById('btn-map-view').addEventListener('click', () => switchView('map'));
  document.getElementById('btn-list-view').addEventListener('click', () => switchView('list'));

  // Recenter GPS button
  document.getElementById('btn-recenter').addEventListener('click', () => {
    if (!isTrackingLocation) {
      startLocationTracking();
    }
    if (userCoords) {
      map.setView([userCoords.lat, userCoords.lng], 17);
    } else if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 16 });
    }
  });

  // Info button expands the welcome card back open
  document.getElementById('btn-info').addEventListener('click', () => {
    const sheet = document.getElementById('welcome-sheet');
    sheet.classList.remove('hidden', 'minimized');
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
