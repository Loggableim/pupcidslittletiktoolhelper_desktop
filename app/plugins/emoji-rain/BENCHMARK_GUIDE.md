# Emoji Rain FPS Benchmarking Guide

## Überblick

Das Emoji Rain Plugin enthält jetzt ein automatisches Benchmarking-Tool, das die FPS (Frames Per Second) misst und die Einstellungen automatisch auf die gewünschte Ziel-FPS optimiert.

## Features

- **Automatische FPS-Messung**: Testet 5 verschiedene Qualitätsstufen
- **Intelligente Optimierung**: Findet die beste Einstellung für deine Ziel-FPS
- **Einfache Bedienung**: Ein Klick zum Starten, automatische Empfehlungen
- **Performance-Stufen**: Von Maximum Quality bis Minimal Quality

## So verwendest du das Benchmark-Tool

### 1. Ziel-FPS einstellen

1. Öffne die Emoji Rain Konfigurationsseite
2. Scrolle zum Abschnitt "🔬 FPS Benchmark & Auto-Optimierung"
3. Gib deine gewünschte Ziel-FPS ein (Standard: 60 FPS)
   - Empfohlen: 60 FPS für flüssige Animationen
   - Schwache PCs: 30-45 FPS
   - Leistungsstarke PCs: 60-120 FPS

### 2. Benchmark starten

1. Klicke auf "🔬 Benchmark starten"
2. Der Benchmark läuft etwa 25 Sekunden
3. Es werden 5 verschiedene Qualitätsstufen getestet:
   - **Maximum Quality**: 200 Emojis, alle Effekte
   - **High Quality**: 150 Emojis, reduzierte Effekte
   - **Medium Quality**: 100 Emojis, Basiseffekte
   - **Low Quality**: 75 Emojis, minimale Effekte
   - **Minimal Quality**: 50 Emojis, keine Effekte

### 3. Ergebnisse ansehen

Nach Abschluss des Benchmarks siehst du:
- Eine Tabelle mit FPS-Werten für jede Qualitätsstufe
- Durchschnittliche FPS, minimale FPS, maximale FPS
- Markierung, welche Einstellungen die Ziel-FPS erreichen ✅

### 4. Optimierte Einstellungen anwenden

1. Überprüfe die empfohlenen Einstellungen
2. Klicke auf "✨ Optimierte Einstellungen anwenden"
3. Die Einstellungen werden automatisch übernommen
4. Das Overlay wird mit den neuen Einstellungen aktualisiert

## Qualitätsstufen im Detail

### Maximum Quality
- Max. Emojis: 200
- Emoji-Größe: 40-80px
- Rotation: Aktiv (0.05)
- Wind: Aktiviert
- Rainbow: Aktiviert
- **Beste für**: Leistungsstarke PCs mit GPU

### High Quality
- Max. Emojis: 150
- Emoji-Größe: 35-70px
- Rotation: Reduziert (0.04)
- Wind: Aktiviert
- Rainbow: Deaktiviert
- **Beste für**: Mittelstarke PCs

### Medium Quality
- Max. Emojis: 100
- Emoji-Größe: 30-60px
- Rotation: Minimal (0.03)
- Wind: Deaktiviert
- Effekte: Aus
- **Beste für**: Standard-PCs

### Low Quality
- Max. Emojis: 75
- Emoji-Größe: 30-50px
- Rotation: Sehr minimal (0.02)
- Alle Effekte: Deaktiviert
- **Beste für**: Ältere PCs

### Minimal Quality
- Max. Emojis: 50
- Emoji-Größe: 25-45px
- Rotation: Deaktiviert
- Alle Effekte: Deaktiviert
- **Beste für**: Sehr schwache PCs / Toaster Mode

## Tipps für beste Ergebnisse

1. **Während des Streamings testen**: Führe den Benchmark aus, während dein System unter normaler Streaming-Last läuft
2. **OBS geschlossen**: Schließe andere ressourcenintensive Programme während des Tests
3. **Mehrmals testen**: Führe den Test 2-3 Mal aus für konsistente Ergebnisse
4. **Realistisch bleiben**: Wenn dein PC nur 30 FPS schafft, stelle die Ziel-FPS auf 30 statt 60

## Benchmark manuell stoppen

Falls du den Benchmark vorzeitig beenden möchtest:
1. Klicke auf "⏹️ Benchmark stoppen"
2. Die aktuellen Einstellungen bleiben erhalten
3. Keine Ergebnisse werden gespeichert

## Technische Details

### Testdauer
- Jeder Test läuft 5 Sekunden
- Insgesamt: 5 Tests × 5 Sekunden = 25 Sekunden
- Plus Ladezeit zwischen Tests

### FPS-Messung
- Verwendet `requestAnimationFrame` für präzise Messung
- Durchschnittliche, minimale und maximale FPS werden erfasst
- 5% Toleranz bei der Zielerreichung

### Automatische Anpassung
- Wählt die höchste Qualitätsstufe, die die Ziel-FPS erreicht
- Falls keine Stufe die Ziel-FPS erreicht, wird die schnellste gewählt
- Einstellungen werden sofort angewendet und in der Datenbank gespeichert

## API-Endpunkte

Für fortgeschrittene Benutzer / Entwickler:

```javascript
// Benchmark starten
POST /api/emoji-rain/benchmark/start
Body: { targetFPS: 60 }

// Benchmark stoppen
POST /api/emoji-rain/benchmark/stop

// Optimierte Einstellungen anwenden
POST /api/emoji-rain/benchmark/apply
Body: { settings: {...} }
```

## Socket.io Events

```javascript
// Benchmark-Updates empfangen (Client)
socket.on('emoji-rain:benchmark-update', (data) => {
  // data.type: 'progress' | 'complete' | 'stopped'
  // data.test: Aktueller Test-Index
  // data.total: Gesamtanzahl Tests
  // data.results: Array mit Ergebnissen
  // data.optimal: Empfohlene Einstellung
});

// Benchmark starten (Server -> Overlay)
socket.emit('emoji-rain:benchmark-start', { targetFPS: 60 });

// Benchmark-Status senden (Overlay -> Server)
socket.emit('emoji-rain:benchmark-status', resultData);
```

## Fehlerbehebung

### Benchmark startet nicht
- Überprüfe, ob ein Overlay geöffnet ist
- Stelle sicher, dass die Emoji Rain Overlay-Seite geladen ist
- Prüfe die Browser-Konsole auf Fehler

### Ungenaue Ergebnisse
- Schließe andere Browser-Tabs
- Schließe ressourcenintensive Programme
- Führe den Test mehrmals aus

### Zu niedrige FPS überall
- Aktiviere den Toaster Modus für maximale Performance
- Reduziere die Ziel-FPS auf 30
- Schließe andere Programme während des Streamings

## Zusammenfassung

Das Benchmark-Tool hilft dir, die optimale Balance zwischen visueller Qualität und Performance zu finden. Nutze es regelmäßig, um deine Einstellungen an dein System anzupassen!
