package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
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
	nodePath       string
	appDir         string
	progress       int
	status         string
	clients        map[chan string]bool
	logFile        *os.File
	logger         *log.Logger
	envFileFixed   bool
	serverCmd      *exec.Cmd
	serverLogs     []string
	loggingEnabled bool
}

type Language struct {
	Code string `json:"code"`
	Name string `json:"name"`
	Flag string `json:"flag"`
}

type Profile struct {
	Username string    `json:"username"`
	Created  time.Time `json:"created"`
	Modified time.Time `json:"modified"`
}

func NewLauncher() *Launcher {
	return &Launcher{
		status:         "Initializing...",
		progress:       0,
		clients:        make(map[chan string]bool),
		envFileFixed:   false,
		serverLogs:     make([]string, 0),
		loggingEnabled: false,
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

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND|os.O_SYNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create log file: %v", err)
	}

	l.logFile = logFile
	l.logger = log.New(logFile, "", log.LstdFlags)

	l.logger.Println("========================================")
	l.logger.Println("TikTok Stream Tool - Enhanced Launcher")
	l.logger.Println("========================================")
	l.logger.Printf("Log file: %s\n", logPath)
	l.logger.Printf("Platform: %s\n", runtime.GOOS)
	l.logger.Printf("Architecture: %s\n", runtime.GOARCH)
	l.logger.Println("========================================")
	
	if err := logFile.Sync(); err != nil {
		return fmt.Errorf("failed to sync log file: %v", err)
	}

	return nil
}

func (l *Launcher) closeLogging() {
	if l.logFile != nil {
		l.logger.Println("========================================")
		l.logger.Println("Launcher finished")
		l.logger.Println("========================================")
		l.logFile.Sync()
		l.logFile.Close()
	}
}

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

func (l *Launcher) addServerLog(logLine string) {
	l.serverLogs = append(l.serverLogs, logLine)
	// Keep only last 1000 lines
	if len(l.serverLogs) > 1000 {
		l.serverLogs = l.serverLogs[len(l.serverLogs)-1000:]
	}
	
	// Send to clients if logging is enabled
	if l.loggingEnabled {
		msg := fmt.Sprintf(`{"serverLog": %s}`, jsonEscape(logLine))
		for client := range l.clients {
			select {
			case client <- msg:
			default:
			}
		}
	}
}

func (l *Launcher) updateProgress(value int, status string) {
	l.progress = value
	l.status = status

	msg := fmt.Sprintf(`{"progress": %d, "status": %s}`, value, jsonEscape(status))
	for client := range l.clients {
		select {
		case client <- msg:
		default:
		}
	}
}

func (l *Launcher) sendRedirect(keepOpen bool) {
	msg := fmt.Sprintf(`{"redirect": "http://localhost:3000/dashboard.html", "keepOpen": %t}`, keepOpen)
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
		return fmt.Errorf("Node.js is not installed")
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
	return strings.TrimSpace(string(output))
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
	l.updateProgress(45, "Starting npm install...")
	time.Sleep(500 * time.Millisecond)
	
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "npm", "install", "--cache", "false")
		cmd.SysProcAttr = &syscall.SysProcAttr{
			CreationFlags: createNoWindow,
		}
	} else {
		cmd = exec.Command("npm", "install", "--cache", "false")
	}
	
	cmd.Dir = l.appDir
	
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("Failed to create stdout pipe: %v", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("Failed to create stderr pipe: %v", err)
	}
	
	if err := cmd.Start(); err != nil {
		l.logger.Printf("[ERROR] Failed to start npm install: %v\n", err)
		return fmt.Errorf("Failed to start npm install: %v", err)
	}
	
	progressCounter := 0
	maxProgress := 75
	
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			l.logger.Printf("[npm stdout] %s\n", line)
			progressCounter++
			currentProgress := 45 + (progressCounter / 2)
			if currentProgress > maxProgress {
				currentProgress = maxProgress
			}
			l.updateProgress(currentProgress, fmt.Sprintf("npm install: %s", line))
		}
	}()
	
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			l.logger.Printf("[npm stderr] %s\n", line)
		}
	}()
	
	err = cmd.Wait()
	if err != nil {
		l.logger.Printf("[ERROR] npm install failed: %v\n", err)
		return fmt.Errorf("Installation failed: %v", err)
	}
	
	l.logger.Println("[SUCCESS] npm install completed successfully")
	return nil
}

func (l *Launcher) startTool() (*exec.Cmd, error) {
	launchJS := filepath.Join(l.appDir, "launch.js")
	cmd := exec.Command(l.nodePath, launchJS)
	cmd.Dir = l.appDir

	env := []string{}
	for _, e := range os.Environ() {
		if strings.HasPrefix(e, "OPEN_BROWSER=") {
			continue
		}
		env = append(env, e)
	}
	env = append(env, "OPEN_BROWSER=false")
	cmd.Env = env

	// Capture server output for logging tab
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %v", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stderr pipe: %v", err)
	}

	l.logAndSync("Starting Node.js server...")
	l.logAndSync("Command: %s %s", l.nodePath, launchJS)
	l.logAndSync("Working directory: %s", l.appDir)

	err = cmd.Start()
	if err != nil {
		return nil, err
	}

	// Capture server output asynchronously
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			l.logAndSync("[Server stdout] %s", line)
			l.addServerLog(line)
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			l.logAndSync("[Server stderr] %s", line)
			l.addServerLog(line)
		}
	}()

	l.serverCmd = cmd
	return cmd, nil
}

func (l *Launcher) checkServerHealth() bool {
	client := &http.Client{
		Timeout: 2 * time.Second,
	}

	resp, err := client.Get("http://localhost:3000/dashboard.html")
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == 200
}

func (l *Launcher) autoFixEnvFile() error {
	envPath := filepath.Join(l.appDir, ".env")
	envExamplePath := filepath.Join(l.appDir, ".env.example")
	
	if _, err := os.Stat(envPath); err == nil {
		l.logger.Println("[INFO] .env file already exists")
		return nil
	}
	
	if _, err := os.Stat(envExamplePath); os.IsNotExist(err) {
		l.logger.Println("[WARNING] .env.example not found")
		return fmt.Errorf(".env.example not found")
	}
	
	l.logger.Println("[AUTO-FIX] Creating .env from .env.example...")
	l.updateProgress(85, "🔧 Auto-Fix: Creating .env file...")
	
	input, err := os.ReadFile(envExamplePath)
	if err != nil {
		return err
	}
	
	err = os.WriteFile(envPath, input, 0644)
	if err != nil {
		return err
	}
	
	l.logger.Println("[SUCCESS] .env file created successfully")
	l.envFileFixed = true
	return nil
}

func (l *Launcher) setActiveProfile(profileName string) error {
	// Wait a bit for server to be ready
	maxRetries := 30
	retryDelay := 1 * time.Second
	
	// First, try to create the profile
	for i := 0; i < maxRetries; i++ {
		client := &http.Client{Timeout: 5 * time.Second}
		
		// Try to create profile first
		createReqBody := fmt.Sprintf(`{"username": "%s"}`, profileName)
		createReq, err := http.NewRequest("POST", "http://localhost:3000/api/profiles", 
			strings.NewReader(createReqBody))
		if err == nil {
			createReq.Header.Set("Content-Type", "application/json")
			
			resp, err := client.Do(createReq)
			if err == nil {
				defer resp.Body.Close()
				if resp.StatusCode == 200 || resp.StatusCode == 201 {
					l.logAndSync("[SUCCESS] Profile created: %s", profileName)
				} else {
					// Profile might already exist, that's ok
					body, _ := io.ReadAll(resp.Body)
					l.logAndSync("[INFO] Profile creation response: %s", string(body))
				}
				break
			}
		}
		
		// Server not ready yet, retry
		time.Sleep(retryDelay)
	}
	
	// Now set it as active
	for i := 0; i < maxRetries; i++ {
		client := &http.Client{Timeout: 5 * time.Second}
		
		// Prepare request body
		reqBody := fmt.Sprintf(`{"username": "%s"}`, profileName)
		req, err := http.NewRequest("POST", "http://localhost:3000/api/profiles/switch", 
			strings.NewReader(reqBody))
		if err != nil {
			return err
		}
		
		req.Header.Set("Content-Type", "application/json")
		
		resp, err := client.Do(req)
		if err != nil {
			// Server not ready yet, retry
			time.Sleep(retryDelay)
			continue
		}
		defer resp.Body.Close()
		
		if resp.StatusCode == 200 {
			l.logAndSync("[SUCCESS] Profile set to: %s", profileName)
			return nil
		}
		
		// Read error response
		body, _ := io.ReadAll(resp.Body)
		l.logAndSync("[WARNING] Failed to set profile: %s", string(body))
		time.Sleep(retryDelay)
	}
	
	return fmt.Errorf("failed to set profile after %d retries", maxRetries)
}

func (l *Launcher) runLauncher(keepOpen bool, profileName string) {
	time.Sleep(1 * time.Second)

	l.updateProgress(0, "Checking Node.js installation...")
	l.logAndSync("[Phase 1] Checking Node.js installation...")
	time.Sleep(500 * time.Millisecond)

	err := l.checkNodeJS()
	if err != nil {
		l.logAndSync("[ERROR] Node.js check failed: %v", err)
		l.updateProgress(0, "ERROR: Node.js is not installed!")
		time.Sleep(5 * time.Second)
		l.closeLogging()
		os.Exit(1)
	}

	l.updateProgress(10, "Node.js found...")
	l.logAndSync("[SUCCESS] Node.js found at: %s", l.nodePath)
	time.Sleep(300 * time.Millisecond)

	version := l.getNodeVersion()
	l.updateProgress(20, fmt.Sprintf("Node.js Version: %s", version))
	l.logger.Printf("[INFO] Node.js version: %s\n", version)
	time.Sleep(300 * time.Millisecond)

	l.updateProgress(30, "Checking dependencies...")
	time.Sleep(300 * time.Millisecond)

	if !l.checkNodeModules() {
		l.updateProgress(40, "Installing dependencies...")
		err = l.installDependencies()
		if err != nil {
			l.logger.Printf("[ERROR] Dependency installation failed: %v\n", err)
			l.updateProgress(45, fmt.Sprintf("ERROR: %v", err))
			time.Sleep(5 * time.Second)
			l.closeLogging()
			os.Exit(1)
		}
		l.updateProgress(80, "Installation complete!")
	} else {
		l.updateProgress(80, "Dependencies already installed...")
	}
	time.Sleep(300 * time.Millisecond)

	l.updateProgress(82, "Checking configuration...")
	if err := l.autoFixEnvFile(); err != nil {
		l.logger.Printf("[WARNING] Could not auto-create .env: %v\n", err)
	}
	
	l.updateProgress(90, "Starting server...")
	time.Sleep(500 * time.Millisecond)

	cmd, err := l.startTool()
	if err != nil {
		l.logger.Printf("[ERROR] Failed to start server: %v\n", err)
		l.updateProgress(90, fmt.Sprintf("ERROR starting server: %v", err))
		time.Sleep(30 * time.Second)
		l.closeLogging()
		os.Exit(1)
	}

	processDied := make(chan error, 1)
	go func() {
		processDied <- cmd.Wait()
	}()

	l.updateProgress(93, "Waiting for server to start...")
	
	healthCheckTimeout := time.After(60 * time.Second)
	healthCheckTicker := time.NewTicker(1 * time.Second)
	defer healthCheckTicker.Stop()

	serverReady := false
	
	for !serverReady {
		select {
		case err := <-processDied:
			if l.logFile != nil {
				l.logFile.Sync()
				time.Sleep(100 * time.Millisecond)
			}
			
			l.logAndSync("[ERROR] Server crashed: %v", err)
			l.updateProgress(95, "⚠️ Server failed to start!")
			time.Sleep(15 * time.Second)
			l.closeLogging()
			os.Exit(1)
		case <-healthCheckTicker.C:
			if l.checkServerHealth() {
				serverReady = true
			}
		case <-healthCheckTimeout:
			l.logger.Println("[ERROR] Server health check timed out")
			l.updateProgress(95, "⏱️ Server start timeout")
			time.Sleep(15 * time.Second)
			l.closeLogging()
			os.Exit(1)
		}
	}

	l.updateProgress(100, "Server started successfully!")
	l.logger.Println("[SUCCESS] Server is running!")
	time.Sleep(500 * time.Millisecond)
	
	// Set active profile if provided
	if profileName != "" {
		l.updateProgress(100, "Setting active profile...")
		l.logger.Printf("[INFO] Setting active profile: %s", profileName)
		if err := l.setActiveProfile(profileName); err != nil {
			l.logAndSync("[WARNING] Could not set active profile: %v", err)
			// Don't fail here, just log the warning
		}
	}
	
	l.updateProgress(100, "Redirecting to dashboard...")
	time.Sleep(500 * time.Millisecond)
	l.sendRedirect(keepOpen)

	if !keepOpen {
		time.Sleep(3 * time.Second)
		l.closeLogging()
		os.Exit(0)
	}
	
	// Keep launcher running if keepOpen is true
	// Wait for server to exit
	<-processDied
	l.closeLogging()
	os.Exit(0)
}

func jsonEscape(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func parseChangelogToHTML(markdown string) string {
	lines := strings.Split(markdown, "\n")
	var html strings.Builder
	inList := false
	
	maxLines := 50
	if len(lines) > maxLines {
		lines = lines[:maxLines]
	}
	
	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		
		if strings.HasPrefix(line, "# Changelog") || strings.HasPrefix(line, "All notable changes") {
			continue
		}
		
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
			html.WriteString(fmt.Sprintf("<li>%s</li>", template.HTMLEscapeString(item)))
		} else if strings.TrimSpace(line) == "" {
			if inList {
				html.WriteString("</ul>")
				inList = false
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

	exePath, err := os.Executable()
	if err != nil {
		log.Fatal("Cannot determine program directory:", err)
	}

	exeDir := filepath.Dir(exePath)
	launcher.appDir = filepath.Join(exeDir, "app")
	logoPath := filepath.Join(launcher.appDir, "public", "ltthmini_nightmode.png")

	if err := launcher.setupLogging(launcher.appDir); err != nil {
		launcher.logger = log.New(io.Discard, "", log.LstdFlags)
	}

	launcher.logAndSync("Enhanced Launcher started")
	launcher.logAndSync("Executable directory: %s", exeDir)
	launcher.logAndSync("App directory: %s", launcher.appDir)

	// Setup HTTP server for launcher UI
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		serveMainPage(w, r)
	})

	http.HandleFunc("/logo", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, logoPath)
	})

	http.HandleFunc("/changelog", func(w http.ResponseWriter, r *http.Request) {
		changelogPath := filepath.Join(exeDir, "CHANGELOG.md")
		content, err := os.ReadFile(changelogPath)
		if err != nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte("<p style='color: #999;'>Changelog konnte nicht geladen werden.</p>"))
			return
		}
		
		html := parseChangelogToHTML(string(content))
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(html))
	})

	http.HandleFunc("/api/languages", func(w http.ResponseWriter, r *http.Request) {
		languages := []Language{
			{Code: "de", Name: "Deutsch", Flag: "🇩🇪"},
			{Code: "en", Name: "English", Flag: "🇬🇧"},
			{Code: "fr", Name: "Français", Flag: "🇫🇷"},
			{Code: "es", Name: "Español", Flag: "🇪🇸"},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(languages)
	})

	http.HandleFunc("/api/translations", func(w http.ResponseWriter, r *http.Request) {
		lang := r.URL.Query().Get("lang")
		if lang == "" {
			lang = "en"
		}
		
		translationPath := filepath.Join(launcher.appDir, "locales", lang+".json")
		content, err := os.ReadFile(translationPath)
		if err != nil {
			http.Error(w, "Translation not found", http.StatusNotFound)
			return
		}
		
		w.Header().Set("Content-Type", "application/json")
		w.Write(content)
	})

	http.HandleFunc("/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		client := make(chan string, 10)
		launcher.clients[client] = true

		msg := fmt.Sprintf(`{"progress": %d, "status": %s}`, launcher.progress, jsonEscape(launcher.status))
		fmt.Fprintf(w, "data: %s\n\n", msg)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}

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

	http.HandleFunc("/api/start", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			KeepOpen bool   `json:"keepOpen"`
			Profile  string `json:"profile"`
			Language string `json:"language"`
		}
		
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		launcher.logAndSync("Starting with profile: %s, language: %s, keepOpen: %v", req.Profile, req.Language, req.KeepOpen)

		// Start the launcher process
		go launcher.runLauncher(req.KeepOpen, req.Profile)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})

	http.HandleFunc("/api/logging/toggle", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			Enabled bool `json:"enabled"`
		}
		
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		launcher.loggingEnabled = req.Enabled
		launcher.logAndSync("Logging toggle: %v", req.Enabled)

		// If enabling, send all existing logs
		if req.Enabled {
			for _, logLine := range launcher.serverLogs {
				msg := fmt.Sprintf(`{"serverLog": %s}`, jsonEscape(logLine))
				for client := range launcher.clients {
					select {
					case client <- msg:
					default:
					}
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	})

	// Start HTTP server
	go func() {
		if err := http.ListenAndServe("127.0.0.1:58734", nil); err != nil {
			log.Fatal(err)
		}
	}()

	time.Sleep(500 * time.Millisecond)
	browser.OpenURL("http://127.0.0.1:58734")

	select {}
}

func serveMainPage(w http.ResponseWriter, r *http.Request) {
	tmpl := template.Must(template.New("index").Parse(getMainPageHTML()))
	tmpl.Execute(w, nil)
}

func getMainPageHTML() string {
	return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>TikTok Stream Tool - Launcher</title>
    <style>` + getStyles() + `</style>
</head>
<body>
    <!-- Language Selection Screen -->
    <div id="languageSelection" class="language-selection">
        <div class="language-backdrop"></div>
        <div class="language-dialog">
            <h1 id="langTitle">Select Your Language</h1>
            <p id="langSubtitle">Choose your preferred language to continue</p>
            <div id="languageOptions" class="language-options"></div>
        </div>
    </div>

    <!-- Main Launcher Screen -->
    <div id="mainLauncher" class="launcher-container" style="display: none;">
        <!-- Header with Logo -->
        <div class="header-section">
            <div class="logo-container">
                <img src="/logo" alt="LTTH Logo" class="logo-img">
            </div>
            <div class="title-section">
                <h1 id="appTitle">PupCid's Little TikTool Helper</h1>
                <p id="appTagline">Loading...</p>
            </div>
        </div>

        <!-- Main Content Area with Tabs -->
        <div class="content-section">
            <!-- Tab Navigation -->
            <div class="tab-navigation">
                <button class="tab-btn active" data-tab="welcome" id="tabWelcome">Welcome</button>
                <button class="tab-btn" data-tab="resources" id="tabResources">Resources</button>
                <button class="tab-btn" data-tab="changelog" id="tabChangelog">Changelog</button>
                <button class="tab-btn" data-tab="community" id="tabCommunity">Community</button>
                <button class="tab-btn" data-tab="logging" id="tabLogging">Logging</button>
            </div>

            <!-- Tab Content -->
            <div class="tab-content">
                <!-- Welcome Tab -->
                <div id="welcome-tab" class="tab-pane active">
                    <h2 id="welcomeTitle">Welcome</h2>
                    <div id="welcomeContent">Loading...</div>
                </div>

                <!-- Resources Tab -->
                <div id="resources-tab" class="tab-pane">
                    <h2 id="resourcesTitle">Resources</h2>
                    <div id="resourcesContent">Loading...</div>
                </div>

                <!-- Changelog Tab -->
                <div id="changelog-tab" class="tab-pane">
                    <h2 id="changelogTitle">Changelog</h2>
                    <div id="changelogContent">Loading...</div>
                </div>

                <!-- Community Tab -->
                <div id="community-tab" class="tab-pane">
                    <h2 id="communityTitle">Community</h2>
                    <div id="communityContent">Loading...</div>
                </div>

                <!-- Logging Tab -->
                <div id="logging-tab" class="tab-pane">
                    <h2 id="loggingTitle">Server Logs</h2>
                    <div class="logging-controls">
                        <label class="checkbox-label">
                            <input type="checkbox" id="loggingToggle">
                            <span id="loggingToggleLabel">Enable Logging</span>
                        </label>
                    </div>
                    <div id="loggingContent" class="logging-output">
                        <p id="loggingPlaceholder">Enable logging to view server output.</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Profile Selection Section -->
        <div class="profile-section" id="profileSection">
            <h3 id="profileTitle">User Profile</h3>
            <div id="profileContent">
                <div class="profile-selector">
                    <label id="selectProfileLabel">Select Profile:</label>
                    <select id="profileSelect">
                        <option value="">Loading profiles...</option>
                    </select>
                    <button id="createProfileBtn">+ Create New</button>
                </div>
                <div class="profile-creator" id="profileCreator" style="display: none;">
                    <label id="usernameLabel">TikTok Username:</label>
                    <input type="text" id="usernameInput" placeholder="@username">
                    <div class="profile-actions">
                        <button id="confirmCreateBtn">Create</button>
                        <button id="cancelCreateBtn">Cancel</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Progress Section -->
        <div class="progress-section">
            <div class="status-text" id="status">Initializing...</div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" id="progressBar">0%</div>
            </div>
        </div>

        <!-- Bottom Options -->
        <div class="options-section">
            <label class="checkbox-label">
                <input type="checkbox" id="keepOpenCheckbox">
                <span id="keepOpenLabel">Keep launcher open after starting</span>
            </label>
            <button id="startBtn" class="start-button">Start</button>
        </div>
    </div>

    <script>` + getJavaScript() + `</script>
</body>
</html>`
}

func getStyles() string {
	return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            width: 100vw; height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            overflow: hidden;
        }

        /* Language Selection */
        .language-selection {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            display: flex; align-items: center; justify-content: center;
            z-index: 1000;
        }

        .language-backdrop {
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(10px);
        }

        .language-dialog {
            position: relative; background: white;
            border-radius: 20px; padding: 40px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px; width: 90%;
            text-align: center;
        }

        .language-dialog h1 {
            color: #333; font-size: 32px; margin-bottom: 10px;
        }

        .language-dialog p {
            color: #666; font-size: 16px; margin-bottom: 30px;
        }

        .language-options {
            display: grid; grid-template-columns: 1fr 1fr;
            gap: 15px;
        }

        .language-option {
            padding: 20px; border: 2px solid #e0e0e0;
            border-radius: 10px; cursor: pointer;
            transition: all 0.2s; background: white;
        }

        .language-option:hover {
            border-color: #667eea; transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }

        .language-flag {
            font-size: 40px; margin-bottom: 10px;
        }

        .language-name {
            font-size: 18px; font-weight: 600; color: #333;
        }

        /* Main Launcher */
        .launcher-container {
            width: 100vw; height: 100vh;
            display: flex; flex-direction: column;
            padding: 20px; gap: 15px;
        }

        .header-section {
            display: flex; align-items: center; gap: 20px;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 10px; padding: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .logo-container {
            width: 80px; height: 80px;
            flex-shrink: 0;
        }

        .logo-img {
            width: 100%; height: 100%;
            object-fit: contain; border-radius: 10px;
        }

        .title-section h1 {
            font-size: 28px; color: #333;
            margin-bottom: 5px;
        }

        .title-section p {
            font-size: 14px; color: #666;
        }

        .content-section {
            flex: 1; display: flex; flex-direction: column;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            overflow: hidden;
        }

        .tab-navigation {
            display: flex; background: #f5f5f5;
            border-bottom: 2px solid #e0e0e0;
        }

        .tab-btn {
            flex: 1; padding: 15px;
            background: transparent; border: none;
            cursor: pointer; font-size: 14px; font-weight: 600;
            color: #666; transition: all 0.2s;
            border-bottom: 3px solid transparent;
        }

        .tab-btn:hover {
            background: rgba(102, 126, 234, 0.1);
            color: #667eea;
        }

        .tab-btn.active {
            color: #667eea;
            border-bottom-color: #667eea;
            background: white;
        }

        .tab-content {
            flex: 1; overflow-y: auto;
            padding: 20px;
        }

        .tab-pane {
            display: none;
        }

        .tab-pane.active {
            display: block;
        }

        .tab-pane h2 {
            font-size: 24px; color: #333;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }

        .profile-section {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 10px; padding: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .profile-section h3 {
            font-size: 18px; color: #333;
            margin-bottom: 15px;
        }

        .profile-selector {
            display: flex; gap: 10px; align-items: center;
        }

        .profile-selector select {
            flex: 1; padding: 10px;
            border: 2px solid #e0e0e0;
            border-radius: 5px; font-size: 14px;
        }

        .profile-selector button,
        .profile-creator button {
            padding: 10px 20px;
            background: #667eea; color: white;
            border: none; border-radius: 5px;
            cursor: pointer; font-weight: 600;
            transition: all 0.2s;
        }

        .profile-selector button:hover,
        .profile-creator button:hover {
            background: #764ba2;
            transform: translateY(-1px);
        }

        .profile-creator {
            display: flex; flex-direction: column; gap: 10px;
        }

        .profile-creator input {
            padding: 10px;
            border: 2px solid #e0e0e0;
            border-radius: 5px; font-size: 14px;
        }

        .profile-actions {
            display: flex; gap: 10px;
        }

        .progress-section {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 10px; padding: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .status-text {
            color: #333; font-size: 14px;
            margin-bottom: 10px; font-weight: 500;
        }

        .progress-bar-bg {
            width: 100%; height: 35px;
            background-color: #e0e0e0;
            border-radius: 20px; overflow: hidden;
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .progress-bar-fill {
            height: 100%; width: 0%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            border-radius: 20px; transition: width 0.3s ease;
            display: flex; align-items: center;
            justify-content: center; color: white;
            font-weight: bold; font-size: 14px;
        }

        .options-section {
            display: flex; justify-content: space-between;
            align-items: center; gap: 20px;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 10px; padding: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .checkbox-label {
            display: flex; align-items: center; gap: 10px;
            cursor: pointer; font-size: 14px; color: #333;
        }

        .checkbox-label input[type="checkbox"] {
            width: 20px; height: 20px;
            cursor: pointer;
        }

        .start-button {
            padding: 15px 40px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white; border: none;
            border-radius: 8px; font-size: 16px;
            font-weight: 600; cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }

        .start-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
        }

        .start-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .logging-controls {
            margin-bottom: 15px;
        }

        .logging-output {
            background: #1e1e1e; color: #d4d4d4;
            padding: 15px; border-radius: 5px;
            font-family: 'Courier New', monospace;
            font-size: 12px; height: 300px;
            overflow-y: auto;
        }

        .logging-output p {
            color: #888;
        }

        .log-line {
            margin-bottom: 2px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .community-links {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
        }

        .community-link {
            padding: 20px;
            background: #f9f9f9;
            border-radius: 8px;
            border: 2px solid #e0e0e0;
            text-decoration: none;
            transition: all 0.2s;
        }

        .community-link:hover {
            border-color: #667eea;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
        }

        .community-link h3 {
            font-size: 18px;
            color: #667eea;
            margin-bottom: 8px;
        }

        .community-link p {
            font-size: 14px;
            color: #666;
            line-height: 1.5;
        }

        .changelog-version {
            color: #764ba2;
            font-weight: bold;
            font-size: 16px;
            margin-top: 20px;
            margin-bottom: 10px;
        }

        .tab-content ul {
            margin-left: 20px;
            margin-bottom: 10px;
        }

        .tab-content li {
            margin-bottom: 5px;
        }
    `
}

func getJavaScript() string {
	return `
        let selectedLanguage = 'en';
        let translations = {};
        let serverStarted = false;

        // Initialize
        (async function init() {
            await loadLanguages();
        })();

        async function loadLanguages() {
            try {
                const response = await fetch('/api/languages');
                const languages = await response.json();
                
                const container = document.getElementById('languageOptions');
                container.innerHTML = '';
                
                languages.forEach(lang => {
                    const option = document.createElement('div');
                    option.className = 'language-option';
                    option.innerHTML = ` + "`" + `
                        <div class="language-flag">${lang.flag}</div>
                        <div class="language-name">${lang.name}</div>
                    ` + "`" + `;
                    option.onclick = () => selectLanguage(lang.code);
                    container.appendChild(option);
                });
            } catch (error) {
                console.error('Failed to load languages:', error);
            }
        }

        async function selectLanguage(lang) {
            selectedLanguage = lang;
            await loadTranslations(lang);
            
            document.getElementById('languageSelection').style.display = 'none';
            document.getElementById('mainLauncher').style.display = 'flex';
            
            updateUILanguage();
            setupEventListeners();
            loadProfiles();
            loadChangelog();
        }

        async function loadTranslations(lang) {
            try {
                const response = await fetch('/api/translations?lang=' + lang);
                translations = await response.json();
            } catch (error) {
                console.error('Failed to load translations:', error);
                translations = { launcher: {} };
            }
        }

        function t(path) {
            const keys = path.split('.');
            let value = translations;
            for (const key of keys) {
                value = value[key];
                if (!value) return path;
            }
            return value;
        }

        function updateUILanguage() {
            // Header
            document.getElementById('appTitle').textContent = t('app.name');
            document.getElementById('appTagline').textContent = t('app.tagline');

            // Tabs
            document.getElementById('tabWelcome').textContent = t('launcher.tabs.welcome');
            document.getElementById('tabResources').textContent = t('launcher.tabs.resources');
            document.getElementById('tabChangelog').textContent = t('launcher.tabs.changelog');
            document.getElementById('tabCommunity').textContent = t('launcher.tabs.community');
            document.getElementById('tabLogging').textContent = t('launcher.tabs.logging');

            // Tab content
            renderWelcomeTab();
            renderResourcesTab();
            renderCommunityTab();
            
            document.getElementById('changelogTitle').textContent = t('launcher.changelog.title');
            document.getElementById('loggingTitle').textContent = t('launcher.logging.title');
            document.getElementById('loggingToggleLabel').textContent = t('launcher.logging.enable');
            document.getElementById('loggingPlaceholder').textContent = t('launcher.logging.no_logs');

            // Profile
            document.getElementById('profileTitle').textContent = t('launcher.profile.title');
            document.getElementById('selectProfileLabel').textContent = t('launcher.profile.select_profile');
            document.getElementById('createProfileBtn').textContent = t('launcher.profile.create_profile');
            document.getElementById('usernameLabel').textContent = t('launcher.profile.username_label');
            document.getElementById('usernameInput').placeholder = t('launcher.profile.username_placeholder');

            // Options
            document.getElementById('keepOpenLabel').textContent = t('launcher.options.keep_launcher_open');
            document.getElementById('startBtn').textContent = t('launcher.profile.continue_button');
        }

        function renderWelcomeTab() {
            const content = document.getElementById('welcomeContent');
            const welcome = translations.launcher.welcome;
            content.innerHTML = ` + "`" + `
                <h3>${welcome.thank_you}</h3>
                <p>${welcome.description}</p>
                <h4>${welcome.features.title}</h4>
                <ul>
                    <li>${welcome.features.live_connection}</li>
                    <li>${welcome.features.overlays}</li>
                    <li>${welcome.features.tts}</li>
                    <li>${welcome.features.automation}</li>
                    <li>${welcome.features.plugins}</li>
                    <li>${welcome.features.osc}</li>
                </ul>
            ` + "`" + `;
        }

        function renderResourcesTab() {
            const content = document.getElementById('resourcesContent');
            const res = translations.launcher.resources;
            content.innerHTML = ` + "`" + `
                <h3>${res.dependencies.title}</h3>
                <p>${res.dependencies.subtitle}</p>
                <ul>
                    <li>${res.dependencies.nodejs}</li>
                    <li>${res.dependencies.npm}</li>
                </ul>
                <p><code>${res.dependencies.install_command} npm install</code></p>
                
                <h3 style="margin-top: 20px;">${res.api_keys.title}</h3>
                <div>
                    <h4>${res.api_keys.required}:</h4>
                    <ul>
                        <li><strong>${res.api_keys.tiktok.title}:</strong> ${res.api_keys.tiktok.description}</li>
                    </ul>
                    
                    <h4>${res.api_keys.optional}:</h4>
                    <ul>
                        <li><strong>${res.api_keys.openai.title}:</strong> ${res.api_keys.openai.description}</li>
                        <li><strong>${res.api_keys.elevenlabs.title}:</strong> ${res.api_keys.elevenlabs.description}</li>
                        <li><strong>${res.api_keys.obs.title}:</strong> ${res.api_keys.obs.description}</li>
                    </ul>
                </div>
            ` + "`" + `;
        }

        function renderCommunityTab() {
            const content = document.getElementById('communityContent');
            const comm = translations.launcher.community.links;
            content.innerHTML = ` + "`" + `
                <div class="community-links">
                    <a href="${comm.website.url}" target="_blank" class="community-link">
                        <h3>🌐 ${comm.website.title}</h3>
                        <p>${comm.website.description}</p>
                    </a>
                    <a href="${comm.discord.url}" target="_blank" class="community-link">
                        <h3>💬 ${comm.discord.title}</h3>
                        <p>${comm.discord.description}</p>
                    </a>
                    <a href="${comm.github.url}" target="_blank" class="community-link">
                        <h3>📦 ${comm.github.title}</h3>
                        <p>${comm.github.description}</p>
                    </a>
                    <a href="${comm.discussions.url}" target="_blank" class="community-link">
                        <h3>💡 ${comm.discussions.title}</h3>
                        <p>${comm.discussions.description}</p>
                    </a>
                    <a href="${comm.feature_requests.url}" target="_blank" class="community-link">
                        <h3>✨ ${comm.feature_requests.title}</h3>
                        <p>${comm.feature_requests.description}</p>
                    </a>
                    <a href="${comm.bug_reports.url}" target="_blank" class="community-link">
                        <h3>🐛 ${comm.bug_reports.title}</h3>
                        <p>${comm.bug_reports.description}</p>
                    </a>
                </div>
            ` + "`" + `;
        }

        function setupEventListeners() {
            // Tab switching
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const tab = btn.dataset.tab;
                    
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                    
                    btn.classList.add('active');
                    document.getElementById(tab + '-tab').classList.add('active');
                });
            });

            // Profile creation
            document.getElementById('createProfileBtn').addEventListener('click', () => {
                document.querySelector('.profile-selector').style.display = 'none';
                document.getElementById('profileCreator').style.display = 'flex';
            });

            document.getElementById('cancelCreateBtn').addEventListener('click', () => {
                document.getElementById('profileCreator').style.display = 'none';
                document.querySelector('.profile-selector').style.display = 'flex';
            });

            document.getElementById('confirmCreateBtn').addEventListener('click', createProfile);

            // Logging toggle
            document.getElementById('loggingToggle').addEventListener('change', (e) => {
                toggleLogging(e.target.checked);
            });

            // Start button
            document.getElementById('startBtn').addEventListener('click', startServer);

            // Event source for updates
            const evtSource = new EventSource('/events');
            evtSource.onmessage = function(event) {
                const data = JSON.parse(event.data);
                
                if (data.redirect) {
                    evtSource.close();
                    const keepOpen = data.keepOpen;
                    setTimeout(() => {
                        if (keepOpen) {
                            window.open(data.redirect, '_blank');
                        } else {
                            window.location.replace(data.redirect);
                        }
                    }, 2000);
                    return;
                }
                
                if (data.serverLog) {
                    addServerLog(data.serverLog);
                }
                
                if (data.progress !== undefined) {
                    const progressBar = document.getElementById('progressBar');
                    progressBar.style.width = data.progress + '%';
                    progressBar.textContent = data.progress + '%';
                }
                
                if (data.status) {
                    document.getElementById('status').textContent = data.status;
                }
            };
        }

        async function loadProfiles() {
            // Since server is not started yet, we can't load profiles
            // Instead, we'll just show the profile creator
            const select = document.getElementById('profileSelect');
            select.innerHTML = '<option value="">' + t('launcher.profile.select_profile') + '</option>';
            
            // For now, just enable profile creation
            // After server starts, profiles will be managed through the dashboard
        }

        async function createProfile() {
            const username = document.getElementById('usernameInput').value.trim().replace('@', '');
            
            if (!username) {
                alert(t('launcher.profile.username_required'));
                return;
            }

            // Store the username for later use when server starts
            const select = document.getElementById('profileSelect');
            const option = document.createElement('option');
            option.value = username;
            option.text = username;
            option.selected = true;
            select.innerHTML = '';
            select.appendChild(option);

            document.getElementById('profileCreator').style.display = 'none';
            document.querySelector('.profile-selector').style.display = 'flex';
        }

        async function toggleLogging(enabled) {
            try {
                await fetch('/api/logging/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled })
                });
                
                const label = document.getElementById('loggingToggleLabel');
                label.textContent = enabled ? t('launcher.logging.disable') : t('launcher.logging.enable');
                
                if (!enabled) {
                    document.getElementById('loggingContent').innerHTML = 
                        '<p>' + t('launcher.logging.no_logs') + '</p>';
                }
            } catch (error) {
                console.error('Failed to toggle logging:', error);
            }
        }

        function addServerLog(logLine) {
            const content = document.getElementById('loggingContent');
            const firstChild = content.firstChild;
            
            if (firstChild && firstChild.tagName === 'P') {
                content.innerHTML = '';
            }
            
            const line = document.createElement('div');
            line.className = 'log-line';
            line.textContent = logLine;
            content.appendChild(line);
            
            content.scrollTop = content.scrollHeight;
        }

        async function loadChangelog() {
            try {
                const response = await fetch('/changelog');
                const html = await response.text();
                document.getElementById('changelogContent').innerHTML = html;
            } catch (error) {
                document.getElementById('changelogContent').innerHTML = 
                    '<p>' + t('launcher.changelog.failed') + '</p>';
            }
        }

        async function startServer() {
            if (serverStarted) return;
            
            const profileSelect = document.getElementById('profileSelect');
            const selectedProfile = profileSelect.value;
            const keepOpen = document.getElementById('keepOpenCheckbox').checked;
            
            if (!selectedProfile) {
                alert(t('launcher.profile.username_required'));
                // Show profile creator if no profile
                document.querySelector('.profile-selector').style.display = 'none';
                document.getElementById('profileCreator').style.display = 'flex';
                return;
            }

            serverStarted = true;
            document.getElementById('startBtn').disabled = true;

            try {
                await fetch('/api/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        profile: selectedProfile,
                        language: selectedLanguage,
                        keepOpen: keepOpen
                    })
                });
            } catch (error) {
                console.error('Failed to start server:', error);
                serverStarted = false;
                document.getElementById('startBtn').disabled = false;
            }
        }
    `
}
