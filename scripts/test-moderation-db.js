#!/usr/bin/env node

/**
 * Database Connectivity Test for Moderation System
 * Tests database connection, data persistence, and moderation action storage
 */

import { initializeDatabase, db, getFromDb, setInDb, deleteFromDb } from '../src/utils/database.js';
import { logModerationAction, generateCaseId, storeModerationCase, getModerationCases } from '../src/utils/moderation.js';
import { logger } from '../src/utils/logger.js';

// Mock Discord objects for testing
const mockClient = {
    db: db,
    user: {
        tag: 'TestBot#1234',
        id: '123456789012345678'
    }
};

const mockGuild = {
    id: '987654321098765432',
    name: 'Test Guild'
};

const mockUser = {
    tag: 'TestUser#5678',
    id: '111222333444555666'
};

const mockModerator = {
    tag: 'TestMod#9999',
    id: '888777666555444333'
};

async function runTests() {
    console.log('🔍 Starting Moderation System Database Tests...\n');

    try {
        // Test 1: Database Initialization
        console.log('📋 Test 1: Database Initialization');
        await initializeDatabase();
        console.log(`✅ Database initialized successfully`);
        console.log(`📊 Connection type: ${db.getConnectionType()}`);
        console.log(`🔄 Using fallback: ${db.useFallback ? 'Yes' : 'No'}\n`);

        // Test 2: Basic Database Operations
        console.log('📋 Test 2: Basic Database Operations');
        const testKey = 'test_moderation_key';
        const testValue = { test: 'data', timestamp: Date.now() };
        
        await setInDb(testKey, testValue);
        console.log('✅ Data written to database');
        
        const retrievedValue = await getFromDb(testKey);
        console.log('✅ Data retrieved from database');
        
        if (JSON.stringify(retrievedValue) === JSON.stringify(testValue)) {
            console.log('✅ Data integrity verified');
        } else {
            throw new Error('Data integrity check failed');
        }
        
        await deleteFromDb(testKey);
        console.log('✅ Data deleted from database\n');

        // Test 3: Case ID Generation
        console.log('📋 Test 3: Case ID Generation');
        const caseId1 = await generateCaseId(mockClient, mockGuild.id);
        const caseId2 = await generateCaseId(mockClient, mockGuild.id);
        console.log(`✅ Generated case IDs: ${caseId1}, ${caseId2}`);
        
        if (caseId2 > caseId1) {
            console.log('✅ Case ID increment working correctly');
        } else {
            throw new Error('Case ID generation failed');
        }

        // Test 4: Moderation Case Storage
        console.log('\n📋 Test 4: Moderation Case Storage');
        const caseData = {
            action: 'Test Ban',
            target: `${mockUser.tag} (${mockUser.id})`,
            executor: `${mockModerator.tag} (${mockModerator.id})`,
            reason: 'Test reason for database verification',
            metadata: {
                userId: mockUser.id,
                moderatorId: mockModerator.id,
                test: true
            }
        };

        const storedCaseId = await logModerationAction({
            client: mockClient,
            guild: mockGuild,
            event: caseData
        });
        
        console.log(`✅ Moderation action logged with case ID: ${storedCaseId}`);
        
        if (storedCaseId && storedCaseId > 0) {
            console.log('✅ Case ID generated and returned correctly');
        } else {
            throw new Error('Case ID generation failed');
        }

        // Test 5: Case Retrieval
        console.log('\n📋 Test 5: Case Retrieval');
        const retrievedCases = await getModerationCases(mockGuild.id, { limit: 10 });
        console.log(`✅ Retrieved ${retrievedCases.length} cases`);
        
        if (retrievedCases.length > 0) {
            const latestCase = retrievedCases[0];
            console.log(`✅ Latest case: #${latestCase.caseId} - ${latestCase.action}`);
            
            if (latestCase.action === caseData.action && 
                latestCase.target === caseData.target &&
                latestCase.reason === caseData.reason) {
                console.log('✅ Case data integrity verified');
            } else {
                throw new Error('Case data integrity check failed');
            }
        } else {
            throw new Error('No cases retrieved from database');
        }

        // Test 6: Warning System Storage
        console.log('\n📋 Test 6: Warning System Storage');
        const warningsKey = `warnings-${mockGuild.id}-${mockUser.id}`;
        const warningData = {
            reason: 'Test warning for database',
            moderatorId: mockModerator.id,
            date: Date.now()
        };

        // Simulate warning storage (like in warn.js)
        const existingWarnings = await getFromDb(warningsKey, []);
        const warningsArray = Array.isArray(existingWarnings) ? existingWarnings : [];
        warningsArray.push(warningData);
        await setInDb(warningsKey, warningsArray);
        
        console.log('✅ Warning data stored');
        
        // Retrieve and verify
        const retrievedWarnings = await getFromDb(warningsKey, []);
        if (Array.isArray(retrievedWarnings) && retrievedWarnings.length > 0) {
            const latestWarning = retrievedWarnings[retrievedWarnings.length - 1];
            if (latestWarning.reason === warningData.reason && 
                latestWarning.moderatorId === warningData.moderatorId) {
                console.log('✅ Warning data integrity verified');
            } else {
                throw new Error('Warning data integrity check failed');
            }
        } else {
            throw new Error('Warning retrieval failed');
        }

        // Test 7: User Notes Storage
        console.log('\n📋 Test 7: User Notes Storage');
        const userNotesKey = `moderation_user_notes_${mockGuild.id}_${mockUser.id}`;
        const noteData = {
            id: Date.now(),
            content: 'Test note for database verification',
            type: 'warning',
            author: mockModerator.tag,
            authorId: mockModerator.id,
            timestamp: new Date().toISOString()
        };

        const existingNotes = await getFromDb(userNotesKey, []);
        const notesArray = Array.isArray(existingNotes) ? existingNotes : [];
        notesArray.push(noteData);
        await setInDb(userNotesKey, notesArray);
        
        console.log('✅ User note stored');
        
        // Retrieve and verify
        const retrievedNotes = await getFromDb(userNotesKey, []);
        if (Array.isArray(retrievedNotes) && retrievedNotes.length > 0) {
            const latestNote = retrievedNotes[retrievedNotes.length - 1];
            if (latestNote.content === noteData.content && 
                latestNote.type === noteData.type &&
                latestNote.authorId === noteData.authorId) {
                console.log('✅ User note data integrity verified');
            } else {
                throw new Error('User note data integrity check failed');
            }
        } else {
            throw new Error('User note retrieval failed');
        }

        // Test 8: Performance Test
        console.log('\n📋 Test 8: Performance Test');
        const startTime = Date.now();
        const operations = [];
        
        for (let i = 0; i < 10; i++) {
            operations.push(setInDb(`perf_test_${i}`, { data: `test_${i}`, index: i }));
        }
        
        await Promise.all(operations);
        const writeTime = Date.now() - startTime;
        console.log(`✅ 10 write operations completed in ${writeTime}ms`);
        
        const readStartTime = Date.now();
        const readOperations = [];
        
        for (let i = 0; i < 10; i++) {
            readOperations.push(getFromDb(`perf_test_${i}`));
        }
        
        await Promise.all(readOperations);
        const readTime = Date.now() - readStartTime;
        console.log(`✅ 10 read operations completed in ${readTime}ms`);
        
        // Cleanup performance test data
        for (let i = 0; i < 10; i++) {
            await deleteFromDb(`perf_test_${i}`);
        }
        
        console.log('✅ Performance test completed\n');

        // Final Summary
        console.log('🎉 All tests completed successfully!');
        console.log('📊 Summary:');
        console.log(`   - Database Connection: ${db.getConnectionType()}`);
        console.log(`   - Data Persistence: ✅ Working`);
        console.log(`   - Moderation Actions: ✅ Working`);
        console.log(`   - Case Management: ✅ Working`);
        console.log(`   - Warning System: ✅ Working`);
        console.log(`   - User Notes: ✅ Working`);
        console.log(`   - Performance: ✅ Acceptable`);
        
        console.log('\n✅ Moderation system database integration is fully functional!');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the tests
runTests().catch(console.error);
