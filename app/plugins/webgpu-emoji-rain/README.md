# WebGPU Emoji Rain Plugin

GPU-beschleunigter Emoji-Partikel-Effekt für LTTH unter Verwendung der WebGPU-Engine mit instanziertem Rendering.

## Features

- **Instanced Rendering**: Hunderte Partikel mit einem einzelnen Draw Call
- **GPU-basierte Simulation**: Effiziente Partikel-Updates via Storage Buffer
- **Echtzeit-Parameter**: Anpassbare Physik (Gravitation, Rotation, Lebensdauer)
- **TikTok-Integration**: Reagiert auf Gifts, Likes, Follows, Shares
- **OBS-kompatibel**: Transparentes Overlay für Browser-Quellen

## Overlay-URL

```
http://localhost:3000/webgpu-emoji-rain/overlay
```

## API-Endpunkte

### Status abfragen
```
GET /api/webgpu-emoji-rain/status
```

### Konfiguration
```
GET /api/webgpu-emoji-rain/config
POST /api/webgpu-emoji-rain/config
```

### Toggle
```
POST /api/webgpu-emoji-rain/toggle
Body: { "enabled": true/false }
```

### Test-Spawn
```
POST /api/webgpu-emoji-rain/test
Body: { "count": 20, "x": 0.5, "y": 0.0 }
```

## Socket.io Events

### Partikel spawnen
```javascript
socket.emit('webgpu-emoji-rain:spawn', {
  count: 20,
  x: 0.5,      // 0-1, horizontal
  y: 0.0,      // 0-1, vertikal (0 = oben)
  spread: 0.5  // Streuung
});
```

### Konfiguration ändern
```javascript
socket.emit('webgpu-emoji-rain:config', {
  particleScale: 0.08,
  gravity: 0.5,
  lifespan: 5.0
});
```

## Technische Details

### WGSL Shader

Der Vertex-Shader verwendet instanziertes Rendering:
- Jede Partikel-Instanz liest ihre Daten aus einem Storage Buffer
- Quad-Vertices werden prozedural generiert (6 Vertices pro Partikel)
- Rotation und Skalierung werden per Instanz angewendet

### Performance

- Max. 1000 Partikel gleichzeitig
- Ein Draw Call für alle Partikel
- ~16 Bytes pro Partikel im GPU-Speicher
- 60 FPS auch bei voller Partikelanzahl

## Systemanforderungen

- Chrome 113+ / Edge 113+ / Electron 25+
- GPU mit WebGPU-Unterstützung
- Windows 10/11, macOS 12+, oder Linux mit Vulkan

## Lizenz

CC-BY-NC-4.0
