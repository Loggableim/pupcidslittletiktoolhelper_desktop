package main

import (
	"bufio"
	"fmt"
	"html/template"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/pkg/browser"
)

const (
	// CREATE_NO_WINDOW flag for Windows to hide console window
	createNoWindow = 0x08000000
)

type Launcher struct {
	nodePath     string
	appDir       string
	progress     int
	status       string
	clients      map[chan string]bool
	logFile      *os.File
	logger       *log.Logger
	envFileFixed bool // Track if we auto-created .env file
}

func NewLauncher() *Launcher {
	return &Launcher{
		status:       "Initialisiere...",
		progress:     0,
		clients:      make(map[chan string]bool),
		envFileFixed: false,
	}
}

// setupLogging creates a log file in the app directory
func (l *Launcher) setupLogging(appDir string) error {
	logDir := filepath.Join(appDir, "logs")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return fmt.Errorf("failed to create log directory: %v", err)
	}

	timestamp := time.Now().Format("2006-01-02_15-04-05")
	logPath := filepath.Join(logDir, fmt.Sprintf("launcher_%s.log", timestamp))

	// Open with sync flag to ensure writes are flushed immediately
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND|os.O_SYNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create log file: %v", err)
	}

	l.logFile = logFile

	// Only write to file (not stdout) because in GUI mode stdout doesn't exist
	// This prevents silent failures when built with -H windowsgui
	l.logger = log.New(logFile, "", log.LstdFlags)

	l.logger.Println("========================================")
	l.logger.Println("TikTok Stream Tool - Launcher Log")
	l.logger.Println("========================================")
	l.logger.Printf("Log file: %s\n", logPath)
	l.logger.Printf("Platform: %s\n", runtime.GOOS)
	l.logger.Printf("Architecture: %s\n", runtime.GOARCH)
	l.logger.Println("========================================")
	
	// Force sync to ensure header is written
	if err := logFile.Sync(); err != nil {
		return fmt.Errorf("failed to sync log file: %v", err)
	}

	return nil
}

// closeLogging closes the log file
func (l *Launcher) closeLogging() {
	if l.logFile != nil {
		l.logger.Println("========================================")
		l.logger.Println("Launcher finished")
		l.logger.Println("========================================")
		l.logFile.Sync() // Ensure all writes are flushed
		l.logFile.Close()
	}
}

// logAndSync logs a message and immediately syncs to disk
// This ensures logs are written even if the process crashes
func (l *Launcher) logAndSync(format string, args ...interface{}) {
	if l.logger != nil {
		if len(args) > 0 {
			l.logger.Printf(format, args...)
		} else {
			l.logger.Println(format)
		}
		if l.logFile != nil {
			l.logFile.Sync()
		}
	}
}

func (l *Launcher) updateProgress(value int, status string) {
	l.progress = value
	l.status = status

	msg := fmt.Sprintf(`{"progress": %d, "status": "%s"}`, value, status)
	for client := range l.clients {
		select {
		case client <- msg:
		default:
		}
	}
}

func (l *Launcher) sendRedirect() {
	msg := `{"redirect": "http://localhost:3000/dashboard.html"}`
	for client := range l.clients {
		select {
		case client <- msg:
		default:
		}
	}
}

func (l *Launcher) checkNodeJS() error {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		return fmt.Errorf("Node.js ist nicht installiert")
	}
	l.nodePath = nodePath
	return nil
}

func (l *Launcher) getNodeVersion() string {
	cmd := exec.Command(l.nodePath, "--version")
	output, err := cmd.Output()
	if err != nil {
		return "unknown"
	}
	return string(output)
}

func (l *Launcher) checkNodeModules() bool {
	nodeModulesPath := filepath.Join(l.appDir, "node_modules")
	info, err := os.Stat(nodeModulesPath)
	if err != nil {
		return false
	}
	return info.IsDir()
}

func (l *Launcher) installDependencies() error {
	l.logger.Println("[INFO] Starting npm install...")
	l.updateProgress(45, "npm install wird gestartet...")
	time.Sleep(500 * time.Millisecond)
	
	// Show initial warning about potential delay
	l.updateProgress(45, "HINWEIS: npm install kann mehrere Minuten dauern, besonders bei langsamer Internetverbindung. Bitte warten...")
	time.Sleep(2 * time.Second)
	
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "npm", "install", "--cache", "false")
		// Hide the npm install window on Windows using CREATE_NO_WINDOW flag
		cmd.SysProcAttr = &syscall.SysProcAttr{
			CreationFlags: createNoWindow,
		}
	} else {
		cmd = exec.Command("npm", "install", "--cache", "false")
	}
	
	cmd.Dir = l.appDir
	
	// Capture output for logging and progress updates
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("Failed to create stdout pipe: %v", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("Failed to create stderr pipe: %v", err)
	}
	
	// Start the command
	if err := cmd.Start(); err != nil {
		l.logger.Printf("[ERROR] Failed to start npm install: %v\n", err)
		return fmt.Errorf("Failed to start npm install: %v", err)
	}
	
	// Track progress with live updates
	progressCounter := 0
	maxProgress := 75
	lastUpdate := time.Now()
	installComplete := false
	
	// Heartbeat ticker to show activity even when npm produces no output
	heartbeatTicker := time.NewTicker(3 * time.Second)
	defer heartbeatTicker.Stop()
	
	// Channel to signal when stdout reading is done
	stdoutDone := make(chan bool)
	
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			l.logger.Printf("[npm stdout] %s\n", line)
			// Show progress in UI with incremental progress bar
			if len(line) > 0 {
				// Increment progress from 45 to 75 during npm install
				progressCounter++
				currentProgress := 45 + (progressCounter / 2)
				if currentProgress > maxProgress {
					currentProgress = maxProgress
				}
				
				// Don't truncate - show full line for better visibility
				displayLine := line
				if len(displayLine) > 120 {
					displayLine = displayLine[:117] + "..."
				}
				l.updateProgress(currentProgress, fmt.Sprintf("npm install: %s", displayLine))
				lastUpdate = time.Now()
			}
		}
		stdoutDone <- true
	}()
	
	// Log errors
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			l.logger.Printf("[npm stderr] %s\n", line)
		}
	}()
	
	// Heartbeat goroutine to show activity
	go func() {
		for !installComplete {
			select {
			case <-heartbeatTicker.C:
				// If no output for more than 3 seconds, show activity indicator
				if time.Since(lastUpdate) >= 3*time.Second {
					elapsed := int(time.Since(lastUpdate).Seconds())
					currentProgress := 45 + (progressCounter / 2)
					if currentProgress > maxProgress {
						currentProgress = maxProgress
					}
					if currentProgress < 50 {
						currentProgress = 50 // Show at least 50% during install
					}
					l.updateProgress(currentProgress, fmt.Sprintf("npm install läuft... (%ds) - Bitte warten, Downloads können mehrere Minuten dauern", elapsed))
				}
			}
		}
	}()
	
	// Wait for command to complete
	err = cmd.Wait()
	installComplete = true
	
	// Wait for stdout processing to complete
	<-stdoutDone
	
	if err != nil {
		l.logger.Printf("[ERROR] npm install failed: %v\n", err)
		return fmt.Errorf("Installation fehlgeschlagen: %v", err)
	}
	
	l.logger.Println("[SUCCESS] npm install completed successfully")
	return nil
}

func (l *Launcher) startTool() (*exec.Cmd, error) {
	launchJS := filepath.Join(l.appDir, "launch.js")
	cmd := exec.Command(l.nodePath, launchJS)
	cmd.Dir = l.appDir

	// Set environment variable to disable automatic browser opening
	// The GUI launcher handles the redirect to dashboard after server is ready
	// Build environment explicitly to ensure OPEN_BROWSER is properly set
	env := []string{}
	for _, e := range os.Environ() {
		// Skip any existing OPEN_BROWSER variable to avoid conflicts
		if strings.HasPrefix(e, "OPEN_BROWSER=") {
			continue
		}
		env = append(env, e)
	}
	env = append(env, "OPEN_BROWSER=false")
	cmd.Env = env

	// Redirect both stdout and stderr to log file only (not os.Stdout because GUI mode has no console)
	if l.logFile != nil {
		cmd.Stdout = l.logFile
		cmd.Stderr = l.logFile
	}
	// Note: We don't redirect stdin in GUI mode as there's no console

	l.logAndSync("Starting Node.js server...")
	l.logAndSync("Command: %s %s", l.nodePath, launchJS)
	l.logAndSync("Working directory: %s", l.appDir)
	l.logAndSync("OPEN_BROWSER environment variable set to: false")
	l.logAndSync("--- Node.js Server Output Start ---")

	err := cmd.Start()
	if err != nil {
		return nil, err
	}

	return cmd, nil
}

// checkServerHealth checks if the server is responding
func (l *Launcher) checkServerHealth() bool {
	return l.checkServerHealthOnPort(3000)
}

// checkServerHealthOnPort checks if the server is responding on a specific port
func (l *Launcher) checkServerHealthOnPort(port int) bool {
	client := &http.Client{
		Timeout: 2 * time.Second,
	}

	url := fmt.Sprintf("http://localhost:%d/dashboard.html", port)
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == 200
}

// waitForServer waits for the server to be ready or timeout
func (l *Launcher) waitForServer(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		if l.checkServerHealth() {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}

	return fmt.Errorf("Server did not start within %v", timeout)
}

// autoFixEnvFile checks if .env exists and creates it from .env.example if missing
func (l *Launcher) autoFixEnvFile() error {
	envPath := filepath.Join(l.appDir, ".env")
	envExamplePath := filepath.Join(l.appDir, ".env.example")
	
	// Check if .env already exists
	if _, err := os.Stat(envPath); err == nil {
		l.logger.Println("[INFO] .env file already exists")
		return nil
	}
	
	// Check if .env.example exists
	if _, err := os.Stat(envExamplePath); os.IsNotExist(err) {
		l.logger.Println("[WARNING] .env.example not found, cannot auto-create .env")
		return fmt.Errorf(".env.example not found")
	}
	
	l.logger.Println("[AUTO-FIX] Creating .env from .env.example...")
	l.updateProgress(85, "🔧 Auto-Fix: Erstelle .env Datei...")
	
	// Read .env.example
	input, err := os.ReadFile(envExamplePath)
	if err != nil {
		l.logger.Printf("[ERROR] Failed to read .env.example: %v\n", err)
		return err
	}
	
	// Write to .env
	err = os.WriteFile(envPath, input, 0644)
	if err != nil {
		l.logger.Printf("[ERROR] Failed to write .env: %v\n", err)
		return err
	}
	
	l.logger.Println("[SUCCESS] .env file created successfully")
	l.updateProgress(86, "✅ .env Datei erstellt!")
	l.envFileFixed = true // Mark that we fixed the .env file
	time.Sleep(1 * time.Second)
	
	return nil
}

// checkPortAvailable checks if a port is available
func (l *Launcher) checkPortAvailable(port int) bool {
	address := fmt.Sprintf("localhost:%d", port)
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return false
	}
	listener.Close()
	return true
}

// autoFixPort checks if port 3000 is available and logs status
func (l *Launcher) autoFixPort() {
	l.logger.Println("[INFO] Checking if port 3000 is available...")
	
	if l.checkPortAvailable(3000) {
		l.logger.Println("[SUCCESS] Port 3000 is available")
		return
	}
	
	l.logger.Println("[WARNING] Port 3000 is already in use")
	l.updateProgress(87, "⚠️ Port 3000 belegt - Server wird alternativen Port nutzen")
	time.Sleep(2 * time.Second)
	
	// Check if server is already running on 3000
	if l.checkServerHealthOnPort(3000) {
		l.logger.Println("[INFO] Server is already running on port 3000")
		l.updateProgress(88, "ℹ️ Server läuft bereits auf Port 3000")
		time.Sleep(2 * time.Second)
	}
}

func (l *Launcher) runLauncher() {
	time.Sleep(1 * time.Second) // Give browser time to load

	// Phase 1: Check Node.js (0-20%)
	l.updateProgress(0, "Prüfe Node.js Installation...")
	l.logAndSync("[Phase 1] Checking Node.js installation...")
	time.Sleep(500 * time.Millisecond)

	err := l.checkNodeJS()
	if err != nil {
		l.logAndSync("[ERROR] Node.js check failed: %v", err)
		l.updateProgress(0, "FEHLER: Node.js ist nicht installiert!")
		time.Sleep(5 * time.Second)
		l.closeLogging()
		os.Exit(1)
	}

	l.updateProgress(10, "Node.js gefunden...")
	l.logAndSync("[SUCCESS] Node.js found at: %s", l.nodePath)
	time.Sleep(300 * time.Millisecond)

	version := l.getNodeVersion()
	l.updateProgress(20, fmt.Sprintf("Node.js Version: %s", version))
	l.logger.Printf("[INFO] Node.js version: %s\n", version)
	time.Sleep(300 * time.Millisecond)

	// Phase 2: Find directories (20-30%)
	l.updateProgress(25, "Prüfe App-Verzeichnis...")
	l.logger.Printf("[Phase 2] Checking app directory: %s\n", l.appDir)
	time.Sleep(300 * time.Millisecond)

	if _, err := os.Stat(l.appDir); os.IsNotExist(err) {
		l.logger.Printf("[ERROR] App directory not found: %s\n", l.appDir)
		l.updateProgress(25, "FEHLER: app Verzeichnis nicht gefunden")
		time.Sleep(5 * time.Second)
		l.closeLogging()
		os.Exit(1)
	}

	l.updateProgress(30, "App-Verzeichnis gefunden...")
	l.logger.Printf("[SUCCESS] App directory exists: %s\n", l.appDir)
	time.Sleep(300 * time.Millisecond)

	// Phase 3: Check and install dependencies (30-80%)
	l.updateProgress(30, "Prüfe Abhängigkeiten...")
	l.logger.Println("[Phase 3] Checking dependencies...")
	time.Sleep(300 * time.Millisecond)

	if !l.checkNodeModules() {
		l.updateProgress(40, "Installiere Abhängigkeiten...")
		l.logger.Println("[INFO] node_modules not found, installing dependencies...")
		time.Sleep(500 * time.Millisecond)
		l.updateProgress(45, "HINWEIS: npm install kann einige Minuten dauern, bitte das Fenster offen halten und warten")

		err = l.installDependencies()
		if err != nil {
			l.logger.Printf("[ERROR] Dependency installation failed: %v\n", err)
			l.updateProgress(45, fmt.Sprintf("FEHLER: %v", err))
			time.Sleep(5 * time.Second)
			l.closeLogging()
			os.Exit(1)
		}

		l.updateProgress(80, "Installation abgeschlossen!")
		l.logger.Println("[SUCCESS] Dependencies installed successfully")
	} else {
		l.updateProgress(80, "Abhängigkeiten bereits installiert...")
		l.logger.Println("[INFO] Dependencies already installed")
	}
	time.Sleep(300 * time.Millisecond)

	// Phase 3.5: Auto-fix common issues (80-89%)
	l.updateProgress(82, "Prüfe Konfiguration...")
	l.logger.Println("[Phase 3.5] Auto-fixing common issues...")
	time.Sleep(300 * time.Millisecond)
	
	// Auto-fix: Create .env file if missing
	if err := l.autoFixEnvFile(); err != nil {
		l.logger.Printf("[WARNING] Could not auto-create .env: %v\n", err)
	}
	
	// Auto-fix: Check port availability
	l.autoFixPort()
	
	l.updateProgress(89, "Konfiguration geprüft!")
	time.Sleep(300 * time.Millisecond)

	// Phase 4: Start tool (90-100%)
	l.updateProgress(90, "Starte Tool...")
	l.logger.Println("[Phase 4] Starting Node.js server...")
	time.Sleep(500 * time.Millisecond)

	// Start the tool
	cmd, err := l.startTool()
	if err != nil {
		l.logger.Printf("[ERROR] Failed to start server: %v\n", err)
		l.updateProgress(90, fmt.Sprintf("FEHLER beim Starten: %v", err))
		l.updateProgress(90, "Prüfe bitte die Log-Datei in app/logs/ für Details.")
		time.Sleep(30 * time.Second)
		l.closeLogging()
		os.Exit(1)
	}

	// Monitor if the process exits prematurely
	processDied := make(chan error, 1)
	go func() {
		processDied <- cmd.Wait()
	}()

	// Wait for server to be ready
	l.updateProgress(93, "Warte auf Server-Start...")
	l.logger.Println("[INFO] Waiting for server health check (60s timeout)...")
	l.logger.Println("[INFO] Checking if server responds on http://localhost:3000...")

	// Check server health with process monitoring
	healthCheckTimeout := time.After(60 * time.Second)
	healthCheckTicker := time.NewTicker(1 * time.Second)
	defer healthCheckTicker.Stop()

	serverReady := false
	attemptCount := 0
	lastLogTime := time.Now()
	
	for !serverReady {
		select {
		case err := <-processDied:
			// Process exited before server was ready
			// Ensure log file is flushed to capture all server output
			if l.logFile != nil {
				l.logFile.Sync()
				time.Sleep(100 * time.Millisecond) // Give a moment for any buffered writes
			}
			
			l.logAndSync("--- Node.js Server Output End ---")
			l.logAndSync("[ERROR] ===========================================")
			l.logAndSync("[ERROR] Node.js process exited prematurely: %v", err)
			l.logAndSync("[ERROR] Server crashed during startup!")
			l.logAndSync("[ERROR] Check the server output above for the actual error")
			l.logAndSync("[ERROR] ===========================================")
			l.logAndSync("[ERROR] Häufige Ursachen:")
			l.logAndSync("[ERROR]  - Fehlende .env Datei (kopiere .env.example zu .env)")
			l.logAndSync("[ERROR]  - Port 3000 bereits belegt")
			l.logAndSync("[ERROR]  - Fehlende Dependencies (führe 'npm install' aus)")
			l.logAndSync("[ERROR]  - Syntax-Fehler im Code")
			l.logAndSync("[ERROR] ===========================================")
			
			// Check if we just fixed the .env file - if so, retry once
			if l.envFileFixed {
				l.logAndSync("[AUTO-FIX] .env file was just created - attempting restart...")
				l.updateProgress(95, "🔄 .env erstellt - starte Server neu...")
				time.Sleep(3 * time.Second)
				
				// Mark that we already tried the fix
				l.envFileFixed = false
				
				// Start server again
				cmd, err = l.startTool()
				if err != nil {
					l.logAndSync("[ERROR] Retry failed to start server: %v", err)
				} else {
					// Monitor the restarted process
					go func() {
						processDied <- cmd.Wait()
					}()
					
					l.updateProgress(96, "🔄 Server neugestartet - warte auf Antwort...")
					l.logAndSync("[INFO] Server restarted after .env fix - waiting for health check...")
					
					// Reset the ticker for another try
					continue
				}
			}
			
			l.updateProgress(95, "⚠️ Server konnte nicht starten!")
			time.Sleep(2 * time.Second)
			l.updateProgress(96, "📋 Alle Auto-Fixes wurden versucht")
			time.Sleep(2 * time.Second)
			l.updateProgress(97, "💡 Prüfe app/logs/launcher_*.log für Details")
			time.Sleep(2 * time.Second)
			l.updateProgress(98, "💡 Oder führe manuell: cd app && npm install")
			time.Sleep(2 * time.Second)
			l.updateProgress(99, "💡 Oder prüfe ob Port 3000 frei ist")
			time.Sleep(2 * time.Second)
			l.updateProgress(100, "❌ Launcher wird in 15 Sekunden geschlossen...")
			time.Sleep(15 * time.Second)
			l.closeLogging()
			os.Exit(1)
		case <-healthCheckTicker.C:
			attemptCount++
			
			// Log progress every 5 seconds
			if time.Since(lastLogTime) >= 5 * time.Second {
				l.logger.Printf("[INFO] Health check attempt %d (waiting for server to respond)...\n", attemptCount)
				l.updateProgress(93 + (attemptCount / 5), fmt.Sprintf("Warte auf Server... (Versuch %d)", attemptCount))
				lastLogTime = time.Now()
			}
			
			// Try multiple ports (server might have failed over)
			ports := []int{3000, 3001, 3002, 3003, 3004}
			for _, port := range ports {
				if l.checkServerHealthOnPort(port) {
					l.logger.Printf("[SUCCESS] Server responded on port %d!\n", port)
					if port != 3000 {
						l.logger.Printf("[INFO] Note: Server is running on port %d instead of 3000\n", port)
					}
					serverReady = true
					break
				}
			}
		case <-healthCheckTimeout:
			l.logger.Println("[ERROR] Server health check timed out after 60 seconds")
			l.logger.Println("[ERROR] Server did not respond. Check the log above for error messages.")
			l.logger.Println("[ERROR] ===========================================")
			l.logger.Println("[ERROR] Mögliche Probleme:")
			l.logger.Println("[ERROR]  - Server startet, aber hängt sich bei Initialisierung auf")
			l.logger.Println("[ERROR]  - Dependencies werden geladen (kann lange dauern)")
			l.logger.Println("[ERROR]  - Datenbank-Migration läuft")
			l.logger.Println("[ERROR]  - Port 3000 ist blockiert durch Firewall")
			l.logger.Println("[ERROR] ===========================================")
			
			l.updateProgress(95, "⏱️ Server-Start Timeout (60s)")
			time.Sleep(2 * time.Second)
			l.updateProgress(96, "📋 Server antwortet nicht - prüfe app/logs/")
			time.Sleep(2 * time.Second)
			l.updateProgress(97, "💡 Server läuft evtl. noch im Hintergrund")
			time.Sleep(2 * time.Second)
			l.updateProgress(98, "💡 Warte 2-3 Minuten und öffne localhost:3000")
			time.Sleep(2 * time.Second)
			l.updateProgress(100, "❌ Launcher wird in 15 Sekunden geschlossen...")
			time.Sleep(15 * time.Second)
			l.closeLogging()
			os.Exit(1)
		}
	}

	l.updateProgress(100, "Server erfolgreich gestartet!")
	l.logger.Println("[SUCCESS] Server is running and healthy!")
	time.Sleep(500 * time.Millisecond)
	l.updateProgress(100, "Weiterleitung zum Dashboard...")
	l.logger.Println("[INFO] Redirecting to dashboard...")
	time.Sleep(500 * time.Millisecond)
	l.sendRedirect()

	// Keep server running to allow redirect to complete
	time.Sleep(3 * time.Second)
	l.closeLogging()
	os.Exit(0)
}

// parseChangelogToHTML converts markdown changelog to HTML
func parseChangelogToHTML(markdown string) string {
	lines := strings.Split(markdown, "\n")
	var html strings.Builder
	inList := false
	
	// Only show the first 50 lines (recent changes)
	maxLines := 50
	if len(lines) > maxLines {
		lines = lines[:maxLines]
	}
	
	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		
		// Skip the title and format line
		if strings.HasPrefix(line, "# Changelog") {
			continue
		}
		if strings.HasPrefix(line, "All notable changes") {
			continue
		}
		if strings.HasPrefix(line, "The format is") {
			continue
		}
		
		// Handle headers
		if strings.HasPrefix(line, "## ") {
			if inList {
				html.WriteString("</ul>")
				inList = false
			}
			version := strings.TrimPrefix(line, "## ")
			html.WriteString(fmt.Sprintf("<div class='changelog-version'>%s</div>", template.HTMLEscapeString(version)))
		} else if strings.HasPrefix(line, "### ") {
			if inList {
				html.WriteString("</ul>")
				inList = false
			}
			title := strings.TrimPrefix(line, "### ")
			html.WriteString(fmt.Sprintf("<h3>%s</h3>", template.HTMLEscapeString(title)))
		} else if strings.HasPrefix(line, "- ") {
			if !inList {
				html.WriteString("<ul>")
				inList = true
			}
			item := strings.TrimPrefix(line, "- ")
			// Handle bold text **text** by replacing pairs of **
			for strings.Contains(item, "**") {
				// Find first pair and replace
				firstPos := strings.Index(item, "**")
				if firstPos != -1 {
					// Replace first ** with <strong>
					item = item[:firstPos] + "<strong>" + item[firstPos+2:]
					// Find next ** and replace with </strong>
					secondPos := strings.Index(item[firstPos:], "**")
					if secondPos != -1 {
						actualPos := firstPos + secondPos
						item = item[:actualPos] + "</strong>" + item[actualPos+2:]
					} else {
						// Unmatched **, revert the change
						item = strings.Replace(item, "<strong>", "**", 1)
						break
					}
				} else {
					break
				}
			}
			html.WriteString(fmt.Sprintf("<li>%s</li>", item))
		} else if strings.TrimSpace(line) == "" {
			if inList {
				html.WriteString("</ul>")
				inList = false
			}
		} else if !strings.HasPrefix(line, "[") {
			// Regular paragraph
			if inList {
				html.WriteString("</ul>")
				inList = false
			}
			if strings.TrimSpace(line) != "" {
				html.WriteString(fmt.Sprintf("<p>%s</p>", template.HTMLEscapeString(line)))
			}
		}
	}
	
	if inList {
		html.WriteString("</ul>")
	}
	
	return html.String()
}

func main() {
	launcher := NewLauncher()

	// Get executable directory
	exePath, err := os.Executable()
	if err != nil {
		log.Fatal("Kann Programmverzeichnis nicht ermitteln:", err)
	}

	exeDir := filepath.Dir(exePath)
	launcher.appDir = filepath.Join(exeDir, "app")
	bgImagePath := filepath.Join(launcher.appDir, "launcherbg.jpg")

	// Setup logging immediately
	if err := launcher.setupLogging(launcher.appDir); err != nil {
		// If logging fails, create a fallback logger that does nothing
		// (since stdout doesn't exist in GUI mode)
		launcher.logger = log.New(io.Discard, "", log.LstdFlags)
	}

	launcher.logAndSync("Launcher started successfully")
	launcher.logAndSync("Executable directory: %s", exeDir)
	launcher.logAndSync("App directory: %s", launcher.appDir)

	// Setup HTTP server
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.New("index").Parse(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>TikTok Stream Tool - Launcher</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            width: 100vw;
            height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            overflow: hidden;
            position: relative;
        }
        
        .launcher-container {
            width: 100vw;
            height: 100vh;
            display: grid;
            grid-template-columns: 250px 1fr 350px;
            grid-template-rows: auto 1fr auto;
            gap: 15px;
            padding: 15px;
        }
        
        /* Top-left logo */
        .logo-container {
            grid-column: 1;
            grid-row: 1;
            background-color: rgba(255, 255, 255, 0.95);
            border-radius: 10px;
            padding: 10px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        
        .logo-container img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 5px;
        }
        
        /* Top-right logging area */
        .logging-container {
            grid-column: 3;
            grid-row: 1 / 3;
            background-color: rgba(255, 255, 255, 0.95);
            border-radius: 10px;
            padding: 15px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            display: flex;
            flex-direction: column;
        }
        
        .logging-title {
            font-size: 16px;
            font-weight: bold;
            color: #333;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }
        
        .status-text {
            color: #333;
            font-size: 13px;
            font-weight: 500;
            margin-bottom: 15px;
            line-height: 1.4;
            flex: 1;
            overflow-y: auto;
            word-wrap: break-word;
            overflow-wrap: break-word;
            padding-right: 5px;
        }
        
        .progress-bar-bg {
            width: 100%;
            height: 35px;
            background-color: #e0e0e0;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
            flex-shrink: 0;
        }
        
        .progress-bar-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            border-radius: 20px;
            transition: width 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 14px;
            box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
        }
        
        /* Center changelog area */
        .changelog-container {
            grid-column: 1 / 3;
            grid-row: 2 / 3;
            background-color: rgba(255, 255, 255, 0.95);
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            overflow-y: auto;
        }
        
        .changelog-title {
            font-size: 24px;
            font-weight: bold;
            color: #333;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 3px solid #667eea;
        }
        
        .changelog-content {
            color: #555;
            font-size: 14px;
            line-height: 1.6;
        }
        
        .changelog-content h3 {
            color: #667eea;
            margin-top: 15px;
            margin-bottom: 8px;
            font-size: 18px;
        }
        
        .changelog-content ul {
            margin-left: 20px;
            margin-bottom: 10px;
        }
        
        .changelog-content li {
            margin-bottom: 5px;
        }
        
        .changelog-version {
            color: #764ba2;
            font-weight: bold;
            font-size: 16px;
            margin-top: 20px;
            margin-bottom: 10px;
        }
        
        /* Bottom-right links */
        .links-container {
            grid-column: 1 / 4;
            grid-row: 3;
            background-color: rgba(255, 255, 255, 0.95);
            border-radius: 10px;
            padding: 15px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 20px;
        }
        
        .link-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 20px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 14px;
            transition: transform 0.2s, box-shadow 0.2s;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }
        
        .link-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
        }
        
        .link-icon {
            font-size: 18px;
        }
        
        /* Custom scrollbar */
        .status-text::-webkit-scrollbar,
        .changelog-container::-webkit-scrollbar {
            width: 8px;
        }
        
        .status-text::-webkit-scrollbar-track,
        .changelog-container::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 10px;
        }
        
        .status-text::-webkit-scrollbar-thumb,
        .changelog-container::-webkit-scrollbar-thumb {
            background: #667eea;
            border-radius: 10px;
        }
        
        .status-text::-webkit-scrollbar-thumb:hover,
        .changelog-container::-webkit-scrollbar-thumb:hover {
            background: #764ba2;
        }
    </style>
</head>
<body>
    <div class="launcher-container">
        <!-- Top-left logo -->
        <div class="logo-container">
            <img src="/bg" alt="TikTok Stream Tool Logo">
        </div>
        
        <!-- Top-right logging area -->
        <div class="logging-container">
            <div class="logging-title">📋 Status</div>
            <div class="status-text" id="status">Initialisiere...</div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" id="progressBar">0%</div>
            </div>
        </div>
        
        <!-- Center changelog area -->
        <div class="changelog-container">
            <div class="changelog-title">📝 Changelog</div>
            <div class="changelog-content" id="changelog">
                <p style="color: #999;">Lade Changelog...</p>
            </div>
        </div>
        
        <!-- Bottom links -->
        <div class="links-container">
            <a href="https://github.com/Loggableim/ltth.app/discussions" target="_blank" class="link-item">
                <span class="link-icon">💬</span>
                <span>GitHub Discussions</span>
            </a>
            <a href="https://discord.gg/pawsunited" target="_blank" class="link-item">
                <span class="link-icon">💜</span>
                <span>Discord Community</span>
            </a>
        </div>
    </div>
    
    <script>
        const evtSource = new EventSource('/events');
        
        evtSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            
            // Handle redirect
            if (data.redirect) {
                evtSource.close();
                // Wait a moment for the dashboard to be ready, then redirect
                setTimeout(function() {
                    window.location.replace(data.redirect);
                }, 2000);
                return;
            }
            
            // Handle progress updates
            const progressBar = document.getElementById('progressBar');
            const statusText = document.getElementById('status');
            
            progressBar.style.width = data.progress + '%';
            progressBar.textContent = data.progress + '%';
            statusText.textContent = data.status;
        };
        
        // Load changelog
        // Note: This content is from our own CHANGELOG.md file served by the launcher,
        // so it's safe to use innerHTML. It's not user-generated content.
        fetch('/changelog')
            .then(response => response.text())
            .then(data => {
                document.getElementById('changelog').innerHTML = data;
            })
            .catch(error => {
                document.getElementById('changelog').innerHTML = '<p style="color: #999;">Changelog konnte nicht geladen werden.</p>';
            });
    </script>
</body>
</html>
`))
		tmpl.Execute(w, nil)
	})

	http.HandleFunc("/bg", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, bgImagePath)
	})

	http.HandleFunc("/changelog", func(w http.ResponseWriter, r *http.Request) {
		changelogPath := filepath.Join(exeDir, "CHANGELOG.md")
		content, err := os.ReadFile(changelogPath)
		if err != nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte("<p style='color: #999;'>Changelog konnte nicht geladen werden.</p>"))
			return
		}
		
		// Parse markdown and convert to HTML (simple conversion)
		html := parseChangelogToHTML(string(content))
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(html))
	})

	http.HandleFunc("/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		client := make(chan string, 10)
		launcher.clients[client] = true

		// Send initial state
		msg := fmt.Sprintf(`{"progress": %d, "status": "%s"}`, launcher.progress, launcher.status)
		fmt.Fprintf(w, "data: %s\n\n", msg)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}

		// Listen for updates
		for {
			select {
			case msg := <-client:
				fmt.Fprintf(w, "data: %s\n\n", msg)
				if f, ok := w.(http.Flusher); ok {
					f.Flush()
				}
			case <-r.Context().Done():
				delete(launcher.clients, client)
				return
			}
		}
	})

	// Start HTTP server
	go func() {
		if err := http.ListenAndServe("127.0.0.1:58734", nil); err != nil {
			log.Fatal(err)
		}
	}()

	// Give server time to start
	time.Sleep(500 * time.Millisecond)

	// Open browser
	browser.OpenURL("http://127.0.0.1:58734")

	// Run launcher
	go launcher.runLauncher()

	// Keep running
	select {}
}
