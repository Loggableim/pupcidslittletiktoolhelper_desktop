let socket = null;
let goals = [];
let editingGoalId = null;
let previewUpdateTimer = null;

// Initialize
function init() {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected');
        socket.emit('goals:get-all');
    });

    socket.on('goals:all', (data) => {
        if (data.success) {
            goals = data.goals;
            renderGoals();
        }
    });

    socket.on('goals:created', (data) => {
        goals.push(data.goal);
        renderGoals();
    });

    socket.on('goals:updated', (data) => {
        const index = goals.findIndex(g => g.id === data.goal.id);
        if (index !== -1) {
            goals[index] = data.goal;
            renderGoals();
        }
    });

    socket.on('goals:deleted', (data) => {
        goals = goals.filter(g => g.id !== data.goalId);
        renderGoals();
    });

    socket.on('goals:value-changed', (data) => {
        const index = goals.findIndex(g => g.id === data.goal.id);
        if (index !== -1) {
            goals[index] = data.goal;
            renderGoals();
        }
    });

    // Show increment amount when needed
    document.getElementById('goal-on-reach').addEventListener('change', (e) => {
        document.getElementById('increment-amount-group').style.display =
            e.target.value === 'increment' ? 'block' : 'none';
    });

    // Update color pickers when goal type changes
    document.getElementById('goal-type').addEventListener('change', (e) => {
        const theme = getDefaultTheme(e.target.value);
        document.getElementById('goal-primary-color').value = theme.primaryColor;
        document.getElementById('goal-secondary-color').value = theme.secondaryColor;
        // Text and bg colors stay the same
    });

    // Setup preview update listeners
    setupPreviewListeners();
}

function renderGoals() {
    const container = document.getElementById('goals-container');

    if (goals.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎯</div>
                <div class="empty-state-text">No goals created yet</div>
                <button class="btn btn-primary" id="create-first-goal-btn">Create Your First Goal</button>
            </div>
        `;
        // Add event listener to the newly created button
        document.getElementById('create-first-goal-btn').addEventListener('click', openCreateModal);
        return;
    }

    container.innerHTML = goals.map(goal => {
        const progress = Math.min(100, (goal.current_value / goal.target_value) * 100);
        const badgeClass = `badge-${goal.goal_type}`;
        const overlayUrl = `${window.location.origin}/goals/overlay?id=${goal.id}`;

        return `
            <div class="goal-card">
                <div class="goal-card-header">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span class="goal-card-title">${escapeHtml(goal.name)}</span>
                        <span class="goal-card-badge ${badgeClass}">${goal.goal_type}</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;" data-action="edit-goal" data-goal-id="${goal.id}">Edit</button>
                        <button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.85rem;" data-action="delete-goal" data-goal-id="${goal.id}">Delete</button>
                    </div>
                </div>

                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>

                <div class="goal-stats">
                    <span>${goal.current_value} / ${goal.target_value}</span>
                    <span>${progress.toFixed(0)}%</span>
                    <span>Template: ${goal.template_id}</span>
                </div>

                <div style="margin-top: 16px;">
                    <strong style="font-size: 0.85rem; color: var(--text-secondary);">Overlay URL:</strong>
                    <div class="overlay-url">
                        ${overlayUrl}
                        <button class="btn btn-primary copy-btn" data-action="copy-url" data-url="${escapeHtml(overlayUrl)}">Copy</button>
                    </div>
                </div>

                <div class="goal-actions">
                    <button class="btn btn-secondary" data-action="reset-goal" data-goal-id="${goal.id}">Reset</button>
                    <button class="btn btn-secondary" data-action="increment-goal" data-goal-id="${goal.id}">+1</button>
                    ${goal.goal_type === 'custom' ? `<button class="btn btn-secondary" data-action="set-goal-value" data-goal-id="${goal.id}">Set Value</button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Set up event delegation for dynamically created buttons
    setupGoalCardEventListeners();
}

function openCreateModal() {
    editingGoalId = null;
    document.querySelector('.modal-header').textContent = 'Create New Goal';
    document.getElementById('goal-form').reset();
    
    // Set default colors based on coin type (will update when type changes)
    const defaultTheme = getDefaultTheme('coin');
    document.getElementById('goal-primary-color').value = defaultTheme.primaryColor;
    document.getElementById('goal-secondary-color').value = defaultTheme.secondaryColor;
    document.getElementById('goal-text-color').value = defaultTheme.textColor;
    document.getElementById('goal-bg-color').value = '#0f172a'; // Default bg in hex
    document.getElementById('goal-font-family').value = "'Impact', 'Haettenschweiler', 'Arial Narrow Bold', sans-serif";
    document.getElementById('goal-font-size').value = '20';
    
    document.getElementById('goal-modal').classList.add('active');
    
    // Update preview with default values
    setTimeout(() => {
        updatePreview();
        const firstInput = document.getElementById('goal-name');
        if (firstInput) {
            firstInput.focus();
        }
    }, 100);
}

function editGoal(id) {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;

    editingGoalId = id;
    document.querySelector('.modal-header').textContent = 'Edit Goal';
    document.getElementById('goal-name').value = goal.name;
    document.getElementById('goal-type').value = goal.goal_type;
    document.getElementById('goal-template').value = goal.template_id;
    document.getElementById('goal-start').value = goal.start_value;
    document.getElementById('goal-target').value = goal.target_value;
    document.getElementById('goal-anim-update').value = goal.animation_on_update;
    document.getElementById('goal-anim-reach').value = goal.animation_on_reach;
    document.getElementById('goal-on-reach').value = goal.on_reach_action;
    document.getElementById('goal-increment').value = goal.on_reach_increment;
    document.getElementById('goal-width').value = goal.overlay_width;
    document.getElementById('goal-height').value = goal.overlay_height;

    document.getElementById('increment-amount-group').style.display =
        goal.on_reach_action === 'increment' ? 'block' : 'none';

    document.getElementById('goal-modal').classList.add('active');
    
    // Update preview with current goal values
    setTimeout(() => {
        updatePreview();
        const firstInput = document.getElementById('goal-name');
        if (firstInput) {
            firstInput.focus();
        }
    }, 100);
}

function closeModal() {
    document.getElementById('goal-modal').classList.remove('active');
    editingGoalId = null;
}

async function saveGoal(e) {
    e.preventDefault();

    const data = {
        name: document.getElementById('goal-name').value,
        goal_type: document.getElementById('goal-type').value,
        template_id: document.getElementById('goal-template').value,
        start_value: parseInt(document.getElementById('goal-start').value),
        target_value: parseInt(document.getElementById('goal-target').value),
        current_value: parseInt(document.getElementById('goal-start').value),
        animation_on_update: document.getElementById('goal-anim-update').value,
        animation_on_reach: document.getElementById('goal-anim-reach').value,
        on_reach_action: document.getElementById('goal-on-reach').value,
        on_reach_increment: parseInt(document.getElementById('goal-increment').value),
        overlay_width: parseInt(document.getElementById('goal-width').value),
        overlay_height: parseInt(document.getElementById('goal-height').value),
        enabled: 1
    };

    const url = editingGoalId ? `/api/goals/${editingGoalId}` : '/api/goals';
    const method = editingGoalId ? 'PUT' : 'POST';

    const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    const result = await response.json();
    if (result.success) {
        closeModal();
    } else {
        alert('Error saving goal: ' + result.error);
    }
}

async function deleteGoal(id) {
    if (!confirm('Are you sure you want to delete this goal?')) return;

    const response = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!result.success) {
        alert('Error deleting goal: ' + result.error);
    }
}

async function resetGoal(id) {
    const response = await fetch(`/api/goals/${id}/reset`, { method: 'POST' });
    const result = await response.json();
    if (!result.success) {
        alert('Error resetting goal: ' + result.error);
    }
}

async function incrementGoal(id) {
    const response = await fetch(`/api/goals/${id}/increment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1 })
    });
    const result = await response.json();
    if (!result.success) {
        alert('Error incrementing goal: ' + result.error);
    }
}

async function setGoalValue(id) {
    const value = prompt('Enter new value:');
    if (value === null) return;

    const response = await fetch(`/api/goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_value: parseInt(value) })
    });
    const result = await response.json();
    if (!result.success) {
        alert('Error setting value: ' + result.error);
    }
}

function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        alert('URL copied to clipboard!');
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event delegation for dynamically created goal card buttons
function setupGoalCardEventListeners() {
    const container = document.getElementById('goals-container');
    
    // Remove old listener if exists to avoid duplicates
    const oldListener = container._goalEventListener;
    if (oldListener) {
        container.removeEventListener('click', oldListener);
    }
    
    // Create new listener
    const listener = function(event) {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        
        const action = button.dataset.action;
        const goalId = button.dataset.goalId;
        const url = button.dataset.url;
        
        switch(action) {
            case 'edit-goal':
                editGoal(goalId);
                break;
            case 'delete-goal':
                deleteGoal(goalId);
                break;
            case 'copy-url':
                copyUrl(url);
                break;
            case 'reset-goal':
                resetGoal(goalId);
                break;
            case 'increment-goal':
                incrementGoal(goalId);
                break;
            case 'set-goal-value':
                setGoalValue(goalId);
                break;
        }
    };
    
    container.addEventListener('click', listener);
    container._goalEventListener = listener;
}

// Initialize on load
init();

// Set up event listeners
document.getElementById('create-goal-btn').addEventListener('click', openCreateModal);
document.getElementById('goal-form').addEventListener('submit', saveGoal);
document.getElementById('cancel-goal-btn').addEventListener('click', closeModal);

// Also set up listener for the initial empty state button (if it exists)
const initialCreateBtn = document.getElementById('create-first-goal-initial-btn');
if (initialCreateBtn) {
    initialCreateBtn.addEventListener('click', openCreateModal);
}

// ============================================================================
// PREVIEW FUNCTIONALITY
// ============================================================================

/**
 * Setup event listeners for preview updates
 */
function setupPreviewListeners() {
    const fieldsToWatch = [
        'goal-name',
        'goal-type',
        'goal-template',
        'goal-start',
        'goal-target',
        'goal-width',
        'goal-height',
        'goal-primary-color',
        'goal-secondary-color',
        'goal-text-color',
        'goal-bg-color',
        'goal-font-family',
        'goal-font-size'
    ];

    fieldsToWatch.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', updatePreviewDebounced);
            field.addEventListener('change', updatePreviewDebounced);
        }
    });
}

/**
 * Debounced preview update to avoid excessive rendering
 */
function updatePreviewDebounced() {
    if (previewUpdateTimer) {
        clearTimeout(previewUpdateTimer);
    }
    previewUpdateTimer = setTimeout(updatePreview, 150);
}

/**
 * Update the live preview with current form values
 */
function updatePreview() {
    const previewFrame = document.getElementById('goal-preview-frame');
    const previewContainer = document.getElementById('goal-preview-container');
    if (!previewFrame || !previewContainer) return;

    // Get current form values
    const name = document.getElementById('goal-name').value || 'Sample Goal';
    const goalType = document.getElementById('goal-type').value || 'coin';
    const templateId = document.getElementById('goal-template').value || 'compact-bar';
    const startValue = parseInt(document.getElementById('goal-start').value) || 0;
    const targetValue = parseInt(document.getElementById('goal-target').value) || 1000;
    const overlayWidth = parseInt(document.getElementById('goal-width').value) || 500;
    const overlayHeight = parseInt(document.getElementById('goal-height').value) || 100;

    // Get custom style values
    const primaryColor = document.getElementById('goal-primary-color')?.value;
    const secondaryColor = document.getElementById('goal-secondary-color')?.value;
    const textColor = document.getElementById('goal-text-color')?.value;
    const bgColor = document.getElementById('goal-bg-color')?.value;
    const fontFamily = document.getElementById('goal-font-family')?.value;
    const fontSize = document.getElementById('goal-font-size')?.value;

    // Create mock goal object for preview
    const mockGoal = {
        id: 'preview',
        name: name,
        goal_type: goalType,
        template_id: templateId,
        current_value: Math.floor(startValue + (targetValue - startValue) * 0.65), // Show 65% progress
        target_value: targetValue,
        start_value: startValue
    };

    // Get the template
    const template = getTemplate(templateId);
    if (!template) {
        previewFrame.innerHTML = '<div class="preview-loading">Template not found</div>';
        return;
    }

    // Get theme (default or custom)
    let theme = getDefaultTheme(goalType);
    
    // Apply custom colors if set
    if (primaryColor) theme.primaryColor = primaryColor;
    if (secondaryColor) theme.secondaryColor = secondaryColor;
    if (textColor) theme.textColor = textColor;
    if (bgColor) {
        // Convert hex to rgba with opacity
        const hex = bgColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        theme.bgColor = `rgba(${r}, ${g}, ${b}, 0.95)`;
    }
    if (fontFamily) theme.fontFamily = fontFamily;
    if (fontSize) theme.fontSize = parseInt(fontSize);

    // Calculate scale to fit preview while maintaining aspect ratio
    const containerWidth = previewContainer.clientWidth - 40; // Account for padding
    const containerHeight = 300; // Fixed preview height
    const aspectRatio = overlayWidth / overlayHeight;
    
    let previewWidth, previewHeight, scale;
    
    if (aspectRatio > containerWidth / containerHeight) {
        // Width is the limiting factor
        previewWidth = Math.min(containerWidth, overlayWidth);
        previewHeight = previewWidth / aspectRatio;
        scale = previewWidth / overlayWidth;
    } else {
        // Height is the limiting factor
        previewHeight = Math.min(containerHeight, overlayHeight);
        previewWidth = previewHeight * aspectRatio;
        scale = previewHeight / overlayHeight;
    }

    // Render the preview
    try {
        const html = template.render(mockGoal, theme);
        const styles = template.getStyles(theme);

        previewFrame.innerHTML = `
            <style>${styles}</style>
            ${html}
        `;
        
        // Apply size and scaling
        previewFrame.style.width = overlayWidth + 'px';
        previewFrame.style.height = overlayHeight + 'px';
        previewFrame.style.transform = `scale(${scale})`;
    } catch (error) {
        console.error('Preview render error:', error);
        previewFrame.innerHTML = '<div class="preview-loading">Error rendering preview</div>';
    }
}

/**
 * Get default theme colors based on goal type
 */
function getDefaultTheme(goalType) {
    const themes = {
        coin: {
            primaryColor: '#fbbf24',
            secondaryColor: '#f59e0b',
            textColor: '#ffffff',
            bgColor: 'rgba(15, 23, 42, 0.95)'
        },
        likes: {
            primaryColor: '#f87171',
            secondaryColor: '#ef4444',
            textColor: '#ffffff',
            bgColor: 'rgba(15, 23, 42, 0.95)'
        },
        follower: {
            primaryColor: '#60a5fa',
            secondaryColor: '#3b82f6',
            textColor: '#ffffff',
            bgColor: 'rgba(15, 23, 42, 0.95)'
        },
        custom: {
            primaryColor: '#a78bfa',
            secondaryColor: '#8b5cf6',
            textColor: '#ffffff',
            bgColor: 'rgba(15, 23, 42, 0.95)'
        }
    };

    return themes[goalType] || themes.custom;
}

/**
 * Get template by ID (uses shared templates from templates-shared.js)
 */
function getTemplate(id) {
    if (!window.GoalTemplates) {
        console.error('GoalTemplates not loaded');
        return null;
    }

    const templateMap = {
        'compact-bar': window.GoalTemplates.CompactBarTemplate,
        'full-width': window.GoalTemplates.FullWidthTemplate,
        'minimal-counter': window.GoalTemplates.MinimalCounterTemplate,
        'circular-progress': window.GoalTemplates.CircularProgressTemplate,
        'floating-pill': window.GoalTemplates.FloatingPillTemplate,
        'vertical-meter': window.GoalTemplates.VerticalMeterTemplate,
        'neon-glow': window.GoalTemplates.NeonGlowTemplate,
        'hexagon-progress': window.GoalTemplates.HexagonProgressTemplate,
        'glassy-card': window.GoalTemplates.GlassyCardTemplate
    };

    return templateMap[id] || templateMap['compact-bar'];
}
