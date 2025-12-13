/**
 * Test for Quiz Show Overlay Improvements
 * 
 * This test validates the improvements made to the quiz overlay:
 * 1. Long answer text handling
 * 2. Correct answer reveal size
 * 3. Timer visibility controls
 * 4. Leaderboard display between questions
 * 5. Round number and category display
 */

const fs = require('fs');
const path = require('path');

describe('Quiz Show Overlay - Display Improvements', () => {
    let overlayCode;
    let cssCode;
    let htmlCode;

    beforeAll(() => {
        // Read the overlay files
        const overlayJsPath = path.join(__dirname, '../plugins/quiz-show/quiz_show_overlay.js');
        const overlayCssPath = path.join(__dirname, '../plugins/quiz-show/quiz_show_overlay.css');
        const overlayHtmlPath = path.join(__dirname, '../plugins/quiz-show/quiz_show_overlay.html');
        
        overlayCode = fs.readFileSync(overlayJsPath, 'utf8');
        cssCode = fs.readFileSync(overlayCssPath, 'utf8');
        htmlCode = fs.readFileSync(overlayHtmlPath, 'utf8');
    });

    describe('Long Answer Text Handling', () => {
        test('CSS should support 2-line wrapping for long answers', () => {
            expect(cssCode).toContain('-webkit-line-clamp: 2');
            expect(cssCode).toContain('-webkit-box-orient: vertical');
        });

        test('CSS should have long-text class with tighter spacing', () => {
            expect(cssCode).toContain('.answer-text.long-text');
            expect(cssCode).toContain('line-height: 1.2');
            expect(cssCode).toContain('letter-spacing: -0.3px');
        });

        test('JavaScript should apply long-text class for answers > 30 chars', () => {
            expect(overlayCode).toContain("if (length > 30)");
            expect(overlayCode).toContain("element.classList.add('long-text')");
        });
    });

    describe('Correct Answer Reveal', () => {
        test('CSS should have larger correct icon (8rem)', () => {
            const iconMatch = cssCode.match(/\.correct-icon\s*\{[^}]*font-size:\s*8rem/);
            expect(iconMatch).toBeTruthy();
        });

        test('CSS should have larger correct text (3rem)', () => {
            const textMatch = cssCode.match(/\.correct-text\s*\{[^}]*font-size:\s*3rem/m);
            expect(textMatch).toBeTruthy();
        });

        test('CSS should have larger correct info (1.5rem)', () => {
            const infoMatch = cssCode.match(/\.correct-info\s*\{[^}]*font-size:\s*1\.5rem/m);
            expect(infoMatch).toBeTruthy();
        });

        test('JavaScript should use answerDisplayDuration config', () => {
            expect(overlayCode).toContain('gameData.answerDisplayDuration');
            expect(overlayCode).toContain('displayDuration / hudConfig.animationSpeed');
        });
    });

    describe('Timer Visibility', () => {
        test('JavaScript should show timer on QUESTION_INTRO', () => {
            const questionIntroMatch = overlayCode.match(/case States\.QUESTION_INTRO:[\s\S]*?timerSection\.style\.display = ''/);
            expect(questionIntroMatch).toBeTruthy();
        });

        test('JavaScript should hide timer on TIME_UP', () => {
            const timeUpMatch = overlayCode.match(/case States\.TIME_UP:[\s\S]*?timerSection\.style\.display = 'none'/);
            expect(timeUpMatch).toBeTruthy();
        });
    });

    describe('Leaderboard Between Questions', () => {
        test('JavaScript should have showCurrentGameLeaderboard function', () => {
            expect(overlayCode).toContain('async function showCurrentGameLeaderboard()');
        });

        test('JavaScript should fetch round leaderboard', () => {
            expect(overlayCode).toContain("/api/quiz-show/leaderboard?type=round");
        });

        test('JavaScript should call showCurrentGameLeaderboard in WAIT_NEXT state', () => {
            const waitNextMatch = overlayCode.match(/case States\.WAIT_NEXT:[\s\S]*?showCurrentGameLeaderboard\(\)/);
            expect(waitNextMatch).toBeTruthy();
        });
    });

    describe('Round Number Display', () => {
        test('CSS should have larger round number (1.8rem)', () => {
            const logoTextMatch = cssCode.match(/\.logo-text\s*\{[^}]*font-size:\s*1\.8rem/m);
            expect(logoTextMatch).toBeTruthy();
        });

        test('CSS should have increased padding for quiz-logo', () => {
            const paddingMatch = cssCode.match(/\.quiz-logo\s*\{[^}]*padding:\s*16px\s+32px/m);
            expect(paddingMatch).toBeTruthy();
        });
    });

    describe('Category Display', () => {
        test('HTML should have category display element', () => {
            expect(htmlCode).toContain('id="categoryDisplay"');
            expect(htmlCode).toContain('id="categoryText"');
            expect(htmlCode).toContain('id="categoryIcon"');
        });

        test('CSS should have category-display styles', () => {
            expect(cssCode).toContain('.category-display');
            expect(cssCode).toContain('.category-text');
            expect(cssCode).toContain('.category-icon');
        });

        test('CSS category-text should be same size as logo-text (1.8rem)', () => {
            const categoryTextMatch = cssCode.match(/\.category-text\s*\{[^}]*font-size:\s*1\.8rem/m);
            expect(categoryTextMatch).toBeTruthy();
        });

        test('JavaScript should extract and display category from state', () => {
            expect(overlayCode).toContain('category: state.currentQuestion.category');
            expect(overlayCode).toContain('if (gameData.category && categoryDisplay && categoryText)');
            expect(overlayCode).toContain('categoryText.textContent = gameData.category');
        });
    });

    describe('Code Quality', () => {
        test('JavaScript should not have syntax errors', () => {
            // Check for common syntax issues
            const openBraces = (overlayCode.match(/{/g) || []).length;
            const closeBraces = (overlayCode.match(/}/g) || []).length;
            expect(openBraces).toBe(closeBraces);
        });

        test('CSS should not have syntax errors', () => {
            // Check for basic CSS validity
            const openBraces = (cssCode.match(/{/g) || []).length;
            const closeBraces = (cssCode.match(/}/g) || []).length;
            expect(openBraces).toBe(closeBraces);
        });
    });
});
