// --- Application State ---
let trailData = [];
let currentStopIndex = 0;
let userCoords = null;
let map, userMarker;
let markers = [];
let isTrackingLocation = false;
let trailPolyline = null;

// Persisted Progress State
let discoveredStops = new Set(JSON.parse(localStorage.getItem('houghton_discovered') || '[]'));
let solvedPuzzles = new Set(JSON.parse(localStorage.getItem('houghton_solved') || '[]'));

const HOUGHTON_COORDS = [54.8420, -1.4680];

// --- Initialize App ---
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  loadTrailData();
  bindUIEvents();
  registerServiceWorker();
});

function saveQuestProgress() {
  localStorage.setItem('houghton_discovered', JSON.stringify([...discoveredStops]));
  localStorage.setItem('houghton_solved', JSON.stringify([...solvedPuzzles]));
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => console.log('ServiceWorker registered:', reg.scope))
        .catch((err) => console.warn('ServiceWorker registration failed:', err));
    });
  }
}

// 1. Initialize Map
function initMap() {
  map = L.map('map', { zoomControl: false }).setView(HOUGHTON_COORDS, 16);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, TomTom',
    maxZoom: 19
  }).addTo(map);
}

// 2. Fetch Data
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

// 3. Render Mystery Pins & Connecting Path
function renderMarkers() {
  markers = [];
  const latLngs = [];

  trailData.forEach((stop, index) => {
    const isCompleted = stop.puzzle ? solvedPuzzles.has(stop.id) : discoveredStops.has(stop.id);
    const pinSymbol = isCompleted ? '✓' : (stop.puzzle ? '🧩' : '?');

    const customIcon = L.divIcon({
      className: `custom-pin ${isCompleted ? 'discovered' : ''}`,
      html: `<span>${pinSymbol}</span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34]
    });

    const marker = L.marker([stop.coords.lat, stop.coords.lng], { icon: customIcon })
      .addTo(map)
      .on('click', () => openStoryDrawer(index));

    markers.push(marker);
    latLngs.push([stop.coords.lat, stop.coords.lng]);
  });

  if (trailPolyline) map.removeLayer(trailPolyline);
  if (latLngs.length > 1) {
    trailPolyline = L.polyline(latLngs, {
      color: '#dc2626',
      weight: 3,
      opacity: 0.55,
      dashArray: '6, 8'
    }).addTo(map);
  }

  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 16 });
  }
}

// 4. Populate List View
function renderListView() {
  const container = document.getElementById('stops-list');
  if (!container) return;
  container.innerHTML = '';

  trailData.forEach((stop, index) => {
    const distanceText = userCoords 
      ? `${Math.round(calculateDistance(userCoords.lat, userCoords.lng, stop.coords.lat, stop.coords.lng))}m away`
      : (stop.puzzle ? 'Puzzle Stop' : 'Mystery Stop');

    const isCompleted = stop.puzzle ? solvedPuzzles.has(stop.id) : discoveredStops.has(stop.id);
    const statusIcon = isCompleted ? '✅' : (stop.puzzle ? '🧩' : '📍');

    const card = document.createElement('div');
    card.className = 'list-card';
    card.innerHTML = `
      <div>
        <h3>${statusIcon} ${stop.title}</h3>
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

// 5. Open Story & Puzzle Drawer
function openStoryDrawer(index) {
  currentStopIndex = index;
  const stop = trailData[index];

  document.getElementById('mini-audio-bar').classList.add('hidden');
  discoveredStops.add(stop.id);
  saveQuestProgress();

  const hasUnsolvedPuzzle = stop.puzzle && !solvedPuzzles.has(stop.id);

  document.getElementById('story-stop-num').innerText = hasUnsolvedPuzzle
    ? `MYSTERY CHALLENGE • SOLVE TO UNLOCK`
    : `MYSTERY LOCATION • DISCOVERED`;
  document.getElementById('story-title').innerText = stop.title;
  document.getElementById('story-era').innerText = `${stop.era} • ${stop.category}`;
  document.getElementById('story-description').innerText = stop.description;

  const puzzleGate = document.getElementById('puzzle-gate');
  const unlockedContent = document.getElementById('unlocked-story-content');

  if (hasUnsolvedPuzzle) {
    puzzleGate.classList.remove('hidden');
    unlockedContent.classList.add('hidden');
    renderPuzzle(stop);
  } else {
    puzzleGate.classList.add('hidden');
    unlockedContent.classList.remove('hidden');
    updatePinAppearance(index, true);
    renderListView();
  }

  renderGallery(stop.images || [stop.image]);

  const sourceEl = document.getElementById('audio-source');
  const audioEl = document.getElementById('story-audio');
  if (!sourceEl.src.includes(stop.audio)) {
    audioEl.pause();
    sourceEl.src = stop.audio;
    audioEl.load();
  }

  const nextBtn = document.getElementById('btn-next-stop');
  nextBtn.innerText = (index === trailData.length - 1) ? "Complete Trail 🎉" : "Next Mystery Stop ➔";

  map.panTo([stop.coords.lat, stop.coords.lng]);
  document.getElementById('story-drawer').classList.remove('hidden');
}

function updatePinAppearance(index, isDone) {
  const pinEl = markers[index]?.getElement();
  if (pinEl && isDone) {
    pinEl.classList.add('discovered');
    pinEl.innerHTML = '<span>✓</span>';
  }
}

// --- Puzzle Engine (4 Interactive Modes) ---
function renderPuzzle(stop) {
  const promptEl = document.getElementById('puzzle-prompt');
  const workspace = document.getElementById('puzzle-workspace');
  const feedback = document.getElementById('puzzle-feedback');

  promptEl.innerText = stop.puzzle.prompt;
  workspace.innerHTML = '';
  feedback.classList.add('hidden');
  feedback.className = 'puzzle-feedback hidden';

  const type = stop.puzzle.type;

  // MODE A: 3x3 Tile-Swap Jigsaw
  if (type === 'jigsaw') {
    let order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    do {
      order.sort(() => Math.random() - 0.5);
    } while (order.every((val, idx) => val === idx));

    let selectedTileIdx = null;
    const grid = document.createElement('div');
    grid.className = 'jigsaw-grid';

    const drawTiles = () => {
      grid.innerHTML = '';
      order.forEach((pieceId, currentPos) => {
        const tile = document.createElement('div');
        tile.className = `jigsaw-tile ${selectedTileIdx === currentPos ? 'selected' : ''}`;
        const col = pieceId % 3;
        const row = Math.floor(pieceId / 3);
        tile.style.backgroundImage = `url('${stop.puzzle.image}')`;
        tile.style.backgroundPosition = `${col * 50}% ${row * 50}%`;

        tile.addEventListener('click', () => {
          if (selectedTileIdx === null) {
            selectedTileIdx = currentPos;
            drawTiles();
          } else {
            const temp = order[selectedTileIdx];
            order[selectedTileIdx] = order[currentPos];
            order[currentPos] = temp;
            selectedTileIdx = null;
            drawTiles();

            if (order.every((val, idx) => val === idx)) {
              completeStopPuzzle(stop);
            }
          }
        });
        grid.appendChild(tile);
      });
    };

    drawTiles();
    workspace.appendChild(grid);
  }

  // MODE B: Visual Multiple Choice
  else if (type === 'choice') {
    if (stop.puzzle.image) {
      const img = document.createElement('img');
      img.src = stop.puzzle.image;
      img.className = 'puzzle-ref-img';
      img.alt = 'Clue visual';
      workspace.appendChild(img);
    }

    const stack = document.createElement('div');
    stack.className = 'choice-stack';

    stop.puzzle.options.forEach((optionText, idx) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.innerText = optionText;
      btn.addEventListener('click', () => {
        if (idx === stop.puzzle.correctIndex) {
          completeStopPuzzle(stop);
        } else {
          feedback.innerText = "Not quite! Look closely at the clue and try again.";
          feedback.className = 'puzzle-feedback error';
          feedback.classList.remove('hidden');
        }
      });
      stack.appendChild(btn);
    });
    workspace.appendChild(stack);
  }

  // MODE C: Timeline Sorter
  else if (type === 'timeline') {
    let items = [...stop.puzzle.events].sort(() => Math.random() - 0.5);
    const list = document.createElement('div');
    list.className = 'timeline-list';

    const drawTimeline = () => {
      list.innerHTML = '';
      items.forEach((ev, idx) => {
        const row = document.createElement('div');
        row.className = 'timeline-item';
        row.innerHTML = `
          <span>${ev.text}</span>
          <div class="timeline-arrows">
            <button type="button" aria-label="Move up">▲</button>
            <button type="button" aria-label="Move down">▼</button>
          </div>
        `;
        const [upBtn, downBtn] = row.querySelectorAll('button');
        upBtn.addEventListener('click', () => {
          if (idx > 0) {
            [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
            drawTimeline();
          }
        });
        downBtn.addEventListener('click', () => {
          if (idx < items.length - 1) {
            [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
            drawTimeline();
          }
        });
        list.appendChild(row);
      });
    };

    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn-primary';
    checkBtn.innerText = 'Check Timeline Order';
    checkBtn.addEventListener('click', () => {
      const isSorted = items.every((item, i) => i === 0 || items[i - 1].year <= item.year);
      if (isSorted) {
        completeStopPuzzle(stop);
      } else {
        feedback.innerText = "Those dates aren't in chronological order yet—try swapping them!";
        feedback.className = 'puzzle-feedback error';
        feedback.classList.remove('hidden');
      }
    });

    drawTimeline();
    workspace.appendChild(list);
    workspace.appendChild(checkBtn);
  }

  // MODE D: Camera Photo Challenge
  else if (type === 'photo') {
    const label = document.createElement('label');
    label.className = 'camera-upload-label';
    label.innerHTML = `📷 Take Photo of Historic Detail <input type="file" accept="image/*" capture="environment" class="hidden">`;
    
    const input = label.querySelector('input');
    input.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        completeStopPuzzle(stop);
      }
    });
    workspace.appendChild(label);
  }
}

function completeStopPuzzle(stop) {
  solvedPuzzles.add(stop.id);
  saveQuestProgress();
  updatePinAppearance(currentStopIndex, true);
  renderListView();

  document.getElementById('story-stop-num').innerText = `MYSTERY LOCATION • UNLOCKED`;
  document.getElementById('puzzle-gate').classList.add('hidden');
  document.getElementById('unlocked-story-content').classList.remove('hidden');
}

// --- Gallery & Lightbox ---
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
        carousel.scrollTo({ left: i * carousel.offsetWidth, behavior: 'smooth' });
      });
      dotsContainer.appendChild(dot);
    }
  });

  carousel.onscroll = () => {
    const activeIndex = Math.round(carousel.scrollLeft / carousel.offsetWidth);
    dotsContainer.querySelectorAll('.dot').forEach((dot, idx) => {
      dot.classList.toggle('active', idx === activeIndex);
    });
  };
}

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

// --- Geolocation ---
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
    (err) => console.warn("Location unavailable:", err.message),
    { enableHighAccuracy: true }
  );
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

// --- Bind Events ---
function bindUIEvents() {
  const toggleWelcomeCard = () => {
    const sheet = document.getElementById('welcome-sheet');
    sheet.classList.remove('hidden');
    sheet.classList.toggle('minimized');
  };

  document.getElementById('welcome-handle').addEventListener('click', toggleWelcomeCard);
  document.getElementById('welcome-header-toggle').addEventListener('click', toggleWelcomeCard);

  document.getElementById('btn-start-trail').addEventListener('click', () => {
    document.getElementById('welcome-sheet').classList.add('minimized');
    startLocationTracking();
    if (trailData.length > 0) openStoryDrawer(0);
  });

  document.getElementById('btn-close-drawer').addEventListener('click', closeStoryDrawer);

  document.getElementById('btn-skip-puzzle').addEventListener('click', () => {
    completeStopPuzzle(trailData[currentStopIndex]);
  });

  document.getElementById('btn-next-stop').addEventListener('click', () => {
    if (currentStopIndex === trailData.length - 1) {
      closeStoryDrawer();
      document.getElementById('completion-modal').classList.remove('hidden');
    } else {
      openStoryDrawer((currentStopIndex + 1) % trailData.length);
    }
  });

  // Gallery Navigation
  document.getElementById('btn-gallery-prev').addEventListener('click', () => {
    const carousel = document.getElementById('gallery-carousel');
    carousel.scrollBy({ left: -carousel.offsetWidth, behavior: 'smooth' });
  });

  document.getElementById('btn-gallery-next').addEventListener('click', () => {
    const carousel = document.getElementById('gallery-carousel');
    carousel.scrollBy({ left: carousel.offsetWidth, behavior: 'smooth' });
  });

  document.getElementById('btn-close-lightbox').addEventListener('click', closeLightbox);
  document.getElementById('image-lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'image-lightbox') closeLightbox();
  });

  // Mini Audio Player
  document.getElementById('mini-player-expand').addEventListener('click', () => openStoryDrawer(currentStopIndex));
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

  document.getElementById('btn-restart').addEventListener('click', () => {
    document.getElementById('completion-modal').classList.add('hidden');
    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 16 });
    }
  });

  document.getElementById('btn-map-view').addEventListener('click', () => switchView('map'));
  document.getElementById('btn-list-view').addEventListener('click', () => switchView('list'));

  document.getElementById('btn-recenter').addEventListener('click', () => {
    if (!isTrackingLocation) startLocationTracking();
    if (userCoords) {
      map.setView([userCoords.lat, userCoords.lng], 17);
    } else if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 16 });
    }
  });

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
