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
});

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

// 3. Drop Custom Numbered Pins on Map & Fit All Stops
function renderMarkers() {
  markers = [];
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

  // Hide floating mini-bar when full drawer is open
  document.getElementById('mini-audio-bar').classList.add('hidden');

  document.getElementById('story-stop-num').innerText = `STOP ${stop.id} OF ${trailData.length}`;
  document.getElementById('story-title').innerText = stop.title;
  document.getElementById('story-era').innerText = `${stop.era} • ${stop.category}`;
  document.getElementById('story-description').innerText = stop.description;
  document.getElementById('story-duration').innerText = stop.audioDuration;
  
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
  if (index === trailData.length - 1) {
    nextBtn.innerText = "Complete Trail 🎉";
  } else {
    nextBtn.innerText = "Next Stop ➔";
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

  // Tap or click photo to zoom in/out
  img.onclick = (e) => {
    e.stopPropagation();
    img.classList.toggle('zoomed');
  };
}

function closeLightbox() {
  document.getElementById('image-lightbox').classList.add('hidden');
}

// Updated closeStoryDrawer: Keeps audio playing in a floating mini-player
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
  // Start button triggers geolocation
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
    map.setView(HOUGHTON_COORDS, 16);
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
    } else {
      map.setView(HOUGHTON_COORDS, 16);
    }
  });

  // Info modal opener
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