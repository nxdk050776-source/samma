// ═══════════════════════════════════════
// 🌌 سماء — التطبيق الكامل
// ═══════════════════════════════════════

const state = {
    myLat: 24.7136,
    myLng: 46.6753,
    map: null,
    markers: {},
    planes: [],
    lightning: [],
    iss: null,
    filter: 'all',
    blackbox: {
        recording: false,
        timer: null,
        startTime: null,
        audioClips: 0,
        locations: 0,
        recorder: null
    },
    night: {
        mode: 'green',
        zoom: 1.0,
        settings: {
            exposure: 1.0,
            contrast: 1.5,
            brightness: 1.5,
            denoise: 0.4
        }
    }
};

// ═══════════════════════════════════════
// 1️⃣ التبويبات
// ═══════════════════════════════════════
document.querySelectorAll('.bottom-tab').forEach(tab => {
    tab.onclick = () => {
        document.querySelectorAll('.bottom-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`view-${tab.dataset.view}`).classList.add('active');

        if (tab.dataset.view === 'map' && state.map) {
            setTimeout(() => state.map.invalidateSize(), 100);
        }
        if (tab.dataset.view === 'night') {
            startNightVision();
        } else {
            stopNightVision();
        }
    };
});

// ═══════════════════════════════════════
// 2️⃣ الساعة
// ═══════════════════════════════════════
setInterval(() => {
    const now = new Date();
    document.getElementById('timeBadge').textContent =
        `🕐 ${now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`;
}, 1000);

// ═══════════════════════════════════════
// 3️⃣ الموقع
// ═══════════════════════════════════════
if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition(
        (pos) => {
            state.myLat = pos.coords.latitude;
            state.myLng = pos.coords.longitude;
            if (!state.map) initMap();
        },
        (err) => console.log('⚠️ موقع:', err.message),
        { enableHighAccuracy: true, maximumAge: 60000 }
    );
}

// ═══════════════════════════════════════
// 4️⃣ الخريطة
// ═══════════════════════════════════════
function initMap() {
    state.map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([state.myLat, state.myLng], 10);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(state.map);

    L.circleMarker([state.myLat, state.myLng], {
        radius: 8,
        color: '#00d4ff',
        fillColor: '#00d4ff',
        fillOpacity: 1,
        weight: 3
    }).addTo(state.map).bindPopup('📍 أنت هنا');

    L.circle([state.myLat, state.myLng], {
        radius: 30000,
        color: '#00d4ff',
        fillColor: '#00d4ff',
        fillOpacity: 0.04,
        weight: 1,
        dashArray: '5,8'
    }).addTo(state.map);

    startTracking();
}

// ═══════════════════════════════════════
// 5️⃣ الطائرات
// ═══════════════════════════════════════
async function fetchPlanes() {
    try {
        const d = 1.5;
        const url = `https://opensky-network.org/api/states/all?` +
                    `lamin=${state.myLat-d}&lomin=${state.myLng-d}&` +
                    `lamax=${state.myLat+d}&lomax=${state.myLng+d}`;

        const res = await fetch(url);
        if (!res.ok) return;

        const data = await res.json();
        state.planes = (data.states || [])
            .map(p => ({
                icao: p[0],
                callsign: (p[1] || '').trim() || 'بدون اسم',
                country: p[2],
                lng: p[5],
                lat: p[6],
                altitude: p[7],
                speed: p[9],
                heading: p[10]
            }))
            .filter(p => p.lat && p.lng);

        renderPlanes();
        updateStats();
    } catch (e) {
        console.log('⚠️ طائرات:', e.message);
    }
}

function renderPlanes() {
    Object.keys(state.markers).forEach(k => {
        if (k.startsWith('plane-')) {
            state.map.removeLayer(state.markers[k]);
            delete state.markers[k];
        }
    });

    if (state.filter !== 'all' && state.filter !== 'plane') return;

    state.planes.forEach(p => {
        const key = `plane-${p.icao}`;
        const icon = L.divIcon({
            html: `<div class="marker-plane" style="transform: rotate(${p.heading || 0}deg)">✈️</div>`,
            className: '',
            iconSize: [24, 24]
        });

        const distance = calculateDistance(state.myLat, state.myLng, p.lat, p.lng);
        const bearing = calculateBearing(state.myLat, state.myLng, p.lat, p.lng);

        const marker = L.marker([p.lat, p.lng], { icon })
            .addTo(state.map)
            .bindPopup(`
                <b>✈️ ${p.callsign}</b><br>
                🌍 ${p.country || ''}<br>
                🧭 ${bearingToArabic(bearing)}<br>
                📏 ${distance.toFixed(1)} كم<br>
                ⬆️ ${p.altitude ? Math.round(p.altitude).toLocaleString() + ' م' : '—'}<br>
                ⚡ ${p.speed ? Math.round(p.speed * 3.6) + ' كم/س' : '—'}
            `);

        state.markers[key] = marker;
    });
}

// ═══════════════════════════════════════
// 6️⃣ ISS
// ═══════════════════════════════════════
async function fetchISS() {
    try {
        const res = await fetch('https://api.open-notify.org/iss-now.json');
        const data = await res.json();

        state.iss = {
            lat: parseFloat(data.iss_position.latitude),
            lng: parseFloat(data.iss_position.longitude)
        };

        renderISS();
        updateISSInfo();
        updateStats();
    } catch (e) {
        console.log('⚠️ ISS:', e.message);
    }
}

function renderISS() {
    if (state.markers['iss']) {
        state.map.removeLayer(state.markers['iss']);
    }
    if (!state.iss) return;
    if (state.filter !== 'all' && state.filter !== 'iss') return;

    const icon = L.divIcon({
        html: `<div class="marker-iss">🛰️</div>`,
        className: '',
        iconSize: [32, 32]
    });

    const distance = calculateDistance(state.myLat, state.myLng, state.iss.lat, state.iss.lng);

    state.markers['iss'] = L.marker([state.iss.lat, state.iss.lng], { icon })
        .addTo(state.map)
        .bindPopup(`
            <b>🛰️ محطة الفضاء</b><br>
            📏 ${distance.toFixed(0)} كم<br>
            ⚡ 27,600 كم/س<br>
            ⬆️ 408 كم
        `);
}

function updateISSInfo() {
    if (!state.iss) return;
    const distance = calculateDistance(state.myLat, state.myLng, state.iss.lat, state.iss.lng);
    document.getElementById('issInfo').innerHTML = `
        <div>📍 الموقع: ${state.iss.lat.toFixed(2)}, ${state.iss.lng.toFixed(2)}</div>
        <div>📏 المسافة منك: ${distance.toFixed(0)} كم</div>
        <div>⚡ السرعة: 27,600 كم/س</div>
        <div>⬆️ الارتفاع: 408 كم</div>
        <div>👨‍🚀 الطاقم: 7 رواد</div>
    `;
}

// ═══════════════════════════════════════
// 7️⃣ البرق (محاكاة)
// ═══════════════════════════════════════
function startLightning() {
    setInterval(() => {
        if (Math.random() > 0.6) {
            const lat = state.myLat + (Math.random() - 0.5) * 0.3;
            const lng = state.myLng + (Math.random() - 0.5) * 0.3;
            flashLightning(lat, lng);
        }
    }, 8000);
}

function flashLightning(lat, lng) {
    if (state.filter !== 'all' && state.filter !== 'lightning') return;

    const icon = L.divIcon({
        html: `<div class="marker-bolt">⚡</div>`,
        className: '',
        iconSize: [30, 30]
    });

    const bolt = L.marker([lat, lng], { icon }).addTo(state.map);

    const distance = calculateDistance(state.myLat, state.myLng, lat, lng);
    const bearing = calculateBearing(state.myLat, state.myLng, lat, lng);

    bolt.bindPopup(`
        <b>⚡ ضربة برق</b><br>
        🧭 ${bearingToArabic(bearing)}<br>
        📏 ${distance.toFixed(1)} كم
    `);

    setTimeout(() => {
        let op = 1;
        const fade = setInterval(() => {
            op -= 0.1;
            bolt.setOpacity(op);
            if (op <= 0) {
                clearInterval(fade);
                state.map.removeLayer(bolt);
            }
        }, 100);
    }, 2000);

    if (navigator.vibrate) navigator.vibrate(100);

    state.lightning.push({ lat, lng, time: Date.now() });
    if (state.lightning.length > 50) state.lightning.shift();
    updateStats();
}

// ═══════════════════════════════════════
// 8️⃣ دوال مساعدة
// ═══════════════════════════════════════
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
              Math.sin(dLng/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function calculateBearing(lat1, lng1, lat2, lng2) {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
              Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function bearingToArabic(deg) {
    const dirs = ['شمال', 'شمال-شرق', 'شرق', 'جنوب-شرق',
                  'جنوب', 'جنوب-غرب', 'غرب', 'شمال-غرب'];
    return dirs[Math.round(deg / 45) % 8];
}

// ═══════════════════════════════════════
// 9️⃣ الإحصائيات
// ═══════════════════════════════════════
function updateStats() {
    document.getElementById('planeCount').textContent = state.planes.length;
    document.getElementById('issCount').textContent = state.iss ? 1 : 0;
    document.getElementById('lightningCount').textContent = state.lightning.length;
}

// ═══════════════════════════════════════
// 🔟 الفلاتر
// ═══════════════════════════════════════
document.querySelectorAll('.filter').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filter = btn.dataset.type;

        Object.values(state.markers).forEach(m => state.map.removeLayer(m));
        state.markers = {};

        if (state.filter === 'all' || state.filter === 'plane') renderPlanes();
        if (state.filter === 'all' || state.filter === 'iss') renderISS();
    };
});

// زر الموقع
document.getElementById('locateBtn').onclick = () => {
    state.map.setView([state.myLat, state.myLng], 13, { animate: true });
};

// ═══════════════════════════════════════
// 1️⃣1️⃣ بدء التتبع
// ═══════════════════════════════════════
function startTracking() {
    fetchPlanes();
    fetchISS();
    startLightning();

    setInterval(fetchPlanes, 15000);
    setInterval(fetchISS, 10000);
}

// ═══════════════════════════════════════
// 1️⃣2️⃣ المنظار الليلي
// ═══════════════════════════════════════
const nightVideo = document.getElementById('nightVideo');
const nightCanvas = document.getElementById('nightCanvas');
const nightCtx = nightCanvas.getContext('2d', { willReadFrequently: true });
let nightStream = null;
let nightAnimating = false;
let nightFacingMode = 'environment';

async function startNightVision() {
    if (nightStream) return;

    try {
        nightStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: nightFacingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        nightVideo.srcObject = nightStream;
        nightVideo.onloadedmetadata = () => {
            nightVideo.play();
            nightCanvas.width = nightVideo.videoWidth;
            nightCanvas.height = nightVideo.videoHeight;
            nightAnimating = true;
            nightLoop();
        };
    } catch (e) {
        console.log('⚠️ كاميرا:', e.message);
    }
}

function stopNightVision() {
    nightAnimating = false;
    if (nightStream) {
        nightStream.getTracks().forEach(t => t.stop());
        nightStream = null;
    }
}

const nightOffscreen = document.createElement('canvas');
const nightOffCtx = nightOffscreen.getContext('2d', { willReadFrequently: true });

function nightLoop() {
    if (!nightAnimating) return;

    if (nightVideo.readyState >= 2) {
        nightOffscreen.width = nightCanvas.width;
        nightOffscreen.height = nightCanvas.height;
        nightOffCtx.drawImage(nightVideo, 0, 0, nightCanvas.width, nightCanvas.height);

        const imageData = nightOffCtx.getImageData(0, 0, nightCanvas.width, nightCanvas.height);
        const data = imageData.data;

        const s = state.night.settings;

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            r *= s.brightness;
            g *= s.brightness;
            b *= s.brightness;

            r = ((r / 255 - 0.5) * s.contrast + 0.5) * 255;
            g = ((g / 255 - 0.5) * s.contrast + 0.5) * 255;
            b = ((b / 255 - 0.5) * s.contrast + 0.5) * 255;

            r = Math.max(0, Math.min(255, r));
            g = Math.max(0, Math.min(255, g));
            b = Math.max(0, Math.min(255, b));

            const lum = r * 0.299 + g * 0.587 + b * 0.114;

            let nr, ng, nb;
            switch (state.night.mode) {
                case 'green':
                    nr = lum * 0.2; ng = lum; nb = lum * 0.2;
                    break;
                case 'white':
                    nr = ng = nb = lum;
                    break;
                case 'red':
                    nr = lum; ng = lum * 0.15; nb = lum * 0.15;
                    break;
                case 'amber':
                    nr = lum; ng = lum * 0.72; nb = lum * 0.08;
                    break;
                default:
                    nr = ng = nb = lum;
            }

            data[i] = nr;
            data[i + 1] = ng;
            data[i + 2] = nb;
        }

        nightCtx.putImageData(imageData, 0, 0);

        // قياس الضوء
        let sum = 0, count = 0;
        for (let i = 0; i < data.length; i += 160) {
            sum += data[i];
            count++;
        }
        const level = sum / count / 255;
        document.getElementById('luxBar').style.width = Math.min(100, level * 150) + '%';
    }

    requestAnimationFrame(nightLoop);
}

// أزرار المنظار
document.querySelectorAll('.nmode').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.nmode').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.night.mode = btn.dataset.mode;
        if (navigator.vibrate) navigator.vibrate(20);
    };
});

document.getElementById('nightSnapshot').onclick = () => {
    nightCanvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `samaa-night-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        if (navigator.vibrate) navigator.vibrate(50);
    });
};

document.getElementById('nightSwitch').onclick = async () => {
    nightFacingMode = nightFacingMode === 'environment' ? 'user' : 'environment';
    stopNightVision();
    await startNightVision();
};

document.getElementById('nightZoomIn').onclick = () => {
    state.night.zoom = Math.min(5, state.night.zoom + 0.5);
    nightVideo.style.transform = `scale(${state.night.zoom})`;
};

document.getElementById('nightZoomOut').onclick = () => {
    state.night.zoom = Math.max(1, state.night.zoom - 0.5);
    nightVideo.style.transform = `scale(${state.night.zoom})`;
};

// ═══════════════════════════════════════
// 1️⃣3️⃣ الصندوق الأسود
// ═══════════════════════════════════════
document.getElementById('bbStart').onclick = async () => {
    state.blackbox.recording = true;
    state.blackbox.startTime = Date.now();

    document.getElementById('bbStatus').textContent = '🔴 جاري التسجيل';
    document.getElementById('bbStatus').classList.add('recording');
    document.getElementById('bbStart').disabled = true;
    document.getElementById('bbStop').disabled = false;

    state.blackbox.timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.blackbox.startTime) / 1000);
        const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        document.getElementById('bbTimer').textContent = `${h}:${m}:${s}`;
    }, 1000);

    // سجّل الموقع
    if ('geolocation' in navigator) {
        navigator.geolocation.watchPosition((pos) => {
            state.blackbox.locations++;
            document.getElementById('bbLocCount').textContent = state.blackbox.locations;
        });
    }
};

document.getElementById('bbStop').onclick = () => {
    state.blackbox.recording = false;
    clearInterval(state.blackbox.timer);
    document.getElementById('bbStatus').textContent = '⚫ متوقف';
    document.getElementById('bbStatus').classList.remove('recording');
    document.getElementById('bbStart').disabled = false;
    document.getElementById('bbStop').disabled = true;
};

// ═══════════════════════════════════════
// 1️⃣4️⃣ Service Worker
// ═══════════════════════════════════════
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => {
        console.log('✅ SW مسجل');
    });
}

console.log('🌌 سماء جاهز');