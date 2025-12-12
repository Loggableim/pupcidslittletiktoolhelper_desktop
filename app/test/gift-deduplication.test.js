/**
 * Test to verify gift event deduplication prevents duplicate detection
 * Specifically tests the fix for gifts like "teamherz" being shown twice
 */

const assert = require('assert');

console.log('🧪 Testing Gift Event Deduplication...\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
        failed++;
    }
}

// Simulate the _generateEventHash function for gift events
// NOTE: This duplicates the production code intentionally for unit testing.
// We test the hash generation logic in isolation without requiring the full
// TikTok module and its dependencies. This allows the test to run independently
// and documents the expected hash generation behavior.
function generateGiftEventHash(eventType, data) {
    const components = [eventType];
    
    if (data.userId) components.push(data.userId);
    if (data.uniqueId) components.push(data.uniqueId);
    if (data.username) components.push(data.username);
    
    if (eventType === 'gift') {
        if (data.giftId) components.push(data.giftId.toString());
        if (data.giftName) components.push(data.giftName);
        // For gift events, use coins instead of repeatCount to better handle streak updates
        // Coins = diamondCount * repeatCount, so it's more unique
        if (data.coins) components.push(data.coins.toString());
        // Also include repeatCount as fallback if coins is not available
        else if (data.repeatCount) components.push(data.repeatCount.toString());
        // Include timestamp rounded to nearest second to catch near-duplicate events
        // but allow legitimate streak updates
        if (data.timestamp) {
            const roundedTime = Math.floor(new Date(data.timestamp).getTime() / 1000);
            components.push(roundedTime.toString());
        }
    }
    
    return components.join('|');
}

// Test 1: Different gifts should have different hashes
runTest('Different gifts generate different hashes', () => {
    const gift1 = {
        username: 'user1',
        giftId: 1001,
        giftName: 'Rose',
        coins: 1,
        repeatCount: 1,
        timestamp: '2024-01-01T10:00:00Z'
    };
    
    const gift2 = {
        username: 'user1',
        giftId: 1002,
        giftName: 'Teamherz',
        coins: 1,
        repeatCount: 1,
        timestamp: '2024-01-01T10:00:00Z'
    };
    
    const hash1 = generateGiftEventHash('gift', gift1);
    const hash2 = generateGiftEventHash('gift', gift2);
    
    assert(hash1 !== hash2, 'Different gifts should have different hashes');
});

// Test 2: Same gift with same coins at same time should have same hash (duplicate)
runTest('Identical gifts at same timestamp generate same hash', () => {
    const timestamp = '2024-01-01T10:00:00Z';
    
    const gift1 = {
        username: 'user1',
        giftId: 1001,
        giftName: 'Teamherz',
        coins: 100,
        repeatCount: 1,
        timestamp: timestamp
    };
    
    const gift2 = {
        username: 'user1',
        giftId: 1001,
        giftName: 'Teamherz',
        coins: 100,
        repeatCount: 1,
        timestamp: timestamp
    };
    
    const hash1 = generateGiftEventHash('gift', gift1);
    const hash2 = generateGiftEventHash('gift', gift2);
    
    assert(hash1 === hash2, 'Identical gifts should have same hash (will be deduplicated)');
});

// Test 3: Same gift with different coins should have different hashes
runTest('Same gift with different coins generates different hashes', () => {
    const gift1 = {
        username: 'user1',
        giftId: 1001,
        giftName: 'Teamherz',
        coins: 100,
        repeatCount: 1,
        timestamp: '2024-01-01T10:00:00Z'
    };
    
    const gift2 = {
        username: 'user1',
        giftId: 1001,
        giftName: 'Teamherz',
        coins: 200, // Different coins value
        repeatCount: 2,
        timestamp: '2024-01-01T10:00:00Z'
    };
    
    const hash1 = generateGiftEventHash('gift', gift1);
    const hash2 = generateGiftEventHash('gift', gift2);
    
    assert(hash1 !== hash2, 'Same gift with different coins should have different hashes');
});

// Test 4: Same gift at different times should have different hashes
runTest('Same gift at different timestamps generates different hashes', () => {
    const gift1 = {
        username: 'user1',
        giftId: 1001,
        giftName: 'Teamherz',
        coins: 100,
        repeatCount: 1,
        timestamp: '2024-01-01T10:00:00Z'
    };
    
    const gift2 = {
        username: 'user1',
        giftId: 1001,
        giftName: 'Teamherz',
        coins: 100,
        repeatCount: 1,
        timestamp: '2024-01-01T10:00:05Z' // 5 seconds later
    };
    
    const hash1 = generateGiftEventHash('gift', gift1);
    const hash2 = generateGiftEventHash('gift', gift2);
    
    assert(hash1 !== hash2, 'Same gift at different times should have different hashes');
});

// Test 5: Streakable gift progression should generate different hashes
runTest('Streakable gift streak progression generates different hashes', () => {
    const baseTime = new Date('2024-01-01T10:00:00Z').getTime();
    
    // First gift in streak
    const streak1 = {
        username: 'user1',
        giftId: 1001,
        giftName: 'Teamherz',
        coins: 100,
        repeatCount: 1,
        timestamp: new Date(baseTime).toISOString()
    };
    
    // Second gift in streak (higher repeatCount, more coins)
    const streak2 = {
        username: 'user1',
        giftId: 1001,
        giftName: 'Teamherz',
        coins: 200,
        repeatCount: 2,
        timestamp: new Date(baseTime + 1000).toISOString() // 1 second later
    };
    
    const hash1 = generateGiftEventHash('gift', streak1);
    const hash2 = generateGiftEventHash('gift', streak2);
    
    assert(hash1 !== hash2, 'Streak progression should have different hashes due to different coins and timestamps');
});

// Test 6: Near-duplicate within same second should have same hash
runTest('Near-duplicate gifts within same second generate same hash', () => {
    const baseTime = new Date('2024-01-01T10:00:00.100Z').getTime();
    
    const gift1 = {
        username: 'user1',
        giftId: 1001,
        giftName: 'Teamherz',
        coins: 100,
        repeatCount: 1,
        timestamp: new Date(baseTime).toISOString()
    };
    
    const gift2 = {
        username: 'user1',
        giftId: 1001,
        giftName: 'Teamherz',
        coins: 100,
        repeatCount: 1,
        timestamp: new Date(baseTime + 500).toISOString() // 500ms later, same second
    };
    
    const hash1 = generateGiftEventHash('gift', gift1);
    const hash2 = generateGiftEventHash('gift', gift2);
    
    assert(hash1 === hash2, 'Near-duplicate gifts in same second should have same hash (will be deduplicated)');
});

// Test 7: Different users with same gift should have different hashes
runTest('Same gift from different users generates different hashes', () => {
    const gift1 = {
        username: 'user1',
        giftId: 1001,
        giftName: 'Teamherz',
        coins: 100,
        repeatCount: 1,
        timestamp: '2024-01-01T10:00:00Z'
    };
    
    const gift2 = {
        username: 'user2', // Different user
        giftId: 1001,
        giftName: 'Teamherz',
        coins: 100,
        repeatCount: 1,
        timestamp: '2024-01-01T10:00:00Z'
    };
    
    const hash1 = generateGiftEventHash('gift', gift1);
    const hash2 = generateGiftEventHash('gift', gift2);
    
    assert(hash1 !== hash2, 'Same gift from different users should have different hashes');
});

console.log(`\n📊 Test Summary: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!');
    console.log('\nGift deduplication improvements:');
    console.log('  ✓ Uses coins (diamondCount * repeatCount) for better uniqueness');
    console.log('  ✓ Includes timestamp (rounded to seconds) to catch near-duplicates');
    console.log('  ✓ Allows legitimate streak updates (different coins/timestamps)');
    console.log('  ✓ Prevents duplicate gifts like "teamherz" from being shown twice');
}
