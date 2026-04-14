// persistence.js
const { connectDB } = require('./db/connection');
const { ObjectId } = require('mongodb');
const crypto = require('crypto');

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Safely convert a string to ObjectId.
 * Throws a typed error if the string is not a valid ObjectId (Risk 2 mitigation).
 * @param {string} id
 * @returns {ObjectId}
 */
function toObjectId(id) {
    try {
        return new ObjectId(id);
    } catch {
        throw new Error(`Invalid ObjectId: "${id}"`);
    }
}

// ─── Employees ────────────────────────────────────────────────────────────────

/**
 * Get all employees.
 * @returns {Promise<Array>}
 */
async function getAllEmployees() {
    const db = await connectDB();
    return await db.collection('employees').find({}).toArray();
}

/**
 * Find a single employee by their MongoDB _id.
 * @param {string} id - ObjectId string
 * @returns {Promise<Object|null>}
 */
async function findEmployee(id) {
    const db = await connectDB();
    return await db.collection('employees').findOne({ _id: toObjectId(id) });
}

/**
 * Add a new employee. No employeeId generated — MongoDB _id is the key.
 * @param {{ name: string, phone: string }} emp
 * @returns {Promise<Object>} The inserted document (with _id)
 */
async function addEmployeeRecord(emp) {
    const db = await connectDB();
    const newEmployee = {
        name:  emp.name,
        phone: emp.phone,
        photo: null          // photo field added as null until uploaded
    };
    const result = await db.collection('employees').insertOne(newEmployee);
    return { _id: result.insertedId, ...newEmployee };
}

/**
 * Update an existing employee's name and/or phone by _id.
 * @param {string} id - ObjectId string
 * @param {{ name?: string, phone?: string }} updates
 * @returns {Promise<Object>} MongoDB update result
 */
async function updateEmployeeRecord(id, updates) {
    const db = await connectDB();
    return await db.collection('employees').updateOne(
        { _id: toObjectId(id) },
        { $set: updates }
    );
}

/**
 * Update an employee's photo path/URL.
 * @param {string} id - ObjectId string
 * @param {string} photoPath - Filesystem path or URL
 * @returns {Promise<Object>} MongoDB update result
 */
async function updateEmployeePhoto(id, photoPath) {
    const db = await connectDB();
    return await db.collection('employees').updateOne(
        { _id: toObjectId(id) },
        { $set: { photo: photoPath } }
    );
}

/**
 * Delete an employee and cascade-remove their ObjectId from all shifts.
 * Pull is done first to avoid dangling references if delete fails (Risk 1 mitigation).
 * @param {string} id - ObjectId string
 * @returns {Promise<Object>} MongoDB delete result
 */
async function deleteEmployee(id) {
    const db = await connectDB();
    const oid = toObjectId(id);

    // Cascade: remove from all shift.employees arrays first
    await db.collection('shifts').updateMany(
        { employees: oid },
        { $pull: { employees: oid } }
    );

    return await db.collection('employees').deleteOne({ _id: oid });
}

// ─── Shifts ───────────────────────────────────────────────────────────────────

/**
 * Get all shifts. employees field contains ObjectIds (not populated).
 * @returns {Promise<Array>}
 */
async function getAllShifts() {
    const db = await connectDB();
    return await db.collection('shifts').find({}).toArray();
}

/**
 * Find a single shift by _id.
 * @param {string} id - ObjectId string
 * @returns {Promise<Object|null>}
 */
async function findShift(id) {
    const db = await connectDB();
    return await db.collection('shifts').findOne({ _id: toObjectId(id) });
}

/**
 * Create a new shift. No shiftId generated — MongoDB _id is the key.
 * @param {{ date: string, startTime: string, endTime: string }} shiftData
 * @returns {Promise<Object>} The inserted document (with _id)
 */
async function createShift(shiftData) {
    const db = await connectDB();
    const newShift = {
        date:      shiftData.date,
        startTime: shiftData.startTime,
        endTime:   shiftData.endTime,
        employees: []
    };
    const result = await db.collection('shifts').insertOne(newShift);
    return { _id: result.insertedId, ...newShift };
}

/**
 * Update a shift's date/time fields by _id.
 * @param {string} id - ObjectId string
 * @param {{ date?: string, startTime?: string, endTime?: string }} updates
 * @returns {Promise<Object>} MongoDB update result
 */
async function updateShift(id, updates) {
    const db = await connectDB();
    return await db.collection('shifts').updateOne(
        { _id: toObjectId(id) },
        { $set: updates }
    );
}

/**
 * Delete a shift by _id.
 * @param {string} id - ObjectId string
 * @returns {Promise<Object>} MongoDB delete result
 */
async function deleteShift(id) {
    const db = await connectDB();
    return await db.collection('shifts').deleteOne({ _id: toObjectId(id) });
}

/**
 * Get all shifts assigned to a specific employee (replaces assignments query).
 * @param {string} employeeId - ObjectId string
 * @returns {Promise<Array>}
 */
async function getShiftsByEmployeeId(employeeId) {
    const db = await connectDB();
    return await db.collection('shifts')
        .find({ employees: toObjectId(employeeId) })
        .toArray();
}

/**
 * Get all shifts for an employee — alias used by business layer.
 * @param {string} employeeId - ObjectId string
 * @returns {Promise<Array>}
 */
async function getEmployeeShifts(employeeId) {
    return await getShiftsByEmployeeId(employeeId);
}

/**
 * Return fully populated employee documents for a given shift (Option B join).
 * @param {string} shiftId - ObjectId string
 * @returns {Promise<Array>} Employee documents
 */
async function getEmployeesByShiftId(shiftId) {
    const db = await connectDB();
    const shift = await db.collection('shifts').findOne({ _id: toObjectId(shiftId) });
    if (!shift || !shift.employees.length) return [];
    return await db.collection('employees')
        .find({ _id: { $in: shift.employees } })
        .toArray();
}

/**
 * Add an employee to a shift. Uses $addToSet to prevent duplicates.
 * Validates both documents exist before updating.
 * @param {string} shiftId - ObjectId string
 * @param {string} employeeId - ObjectId string
 * @returns {Promise<Object>} MongoDB update result
 */
async function addEmployeeToShift(shiftId, employeeId) {
    const db = await connectDB();
    const shiftOid    = toObjectId(shiftId);
    const employeeOid = toObjectId(employeeId);

    // Validate both exist before modifying
    const shiftExists    = await db.collection('shifts').findOne({ _id: shiftOid }, { projection: { _id: 1 } });
    const employeeExists = await db.collection('employees').findOne({ _id: employeeOid }, { projection: { _id: 1 } });

    if (!shiftExists)    throw new Error(`Shift not found: ${shiftId}`);
    if (!employeeExists) throw new Error(`Employee not found: ${employeeId}`);

    return await db.collection('shifts').updateOne(
        { _id: shiftOid },
        { $addToSet: { employees: employeeOid } }
    );
}

/**
 * Remove an employee from a shift.
 * @param {string} shiftId - ObjectId string
 * @param {string} employeeId - ObjectId string
 * @returns {Promise<Object>} MongoDB update result
 */
async function removeEmployeeFromShift(shiftId, employeeId) {
    const db = await connectDB();
    return await db.collection('shifts').updateOne(
        { _id: toObjectId(shiftId) },
        { $pull: { employees: toObjectId(employeeId) } }
    );
}

// ─── Users ────────────────────────────────────────────────────────────────────

/**
 * Create a new user with a SHA-256 hashed password.
 * @param {string} username
 * @param {string} plainPassword - Will be hashed here
 * @returns {Promise<Object>} The inserted document
 */
async function createUser(username, plainPassword) {
    const db = await connectDB();
    const hashedPassword = crypto.createHash('sha256').update(plainPassword).digest('hex');
    const result = await db.collection('users').insertOne({ username, hashedPassword });
    return { _id: result.insertedId, username };
}

/**
 * Find a user by username for login validation.
 * @param {string} username
 * @returns {Promise<Object|null>}
 */
async function getUserByUsername(username) {
    const db = await connectDB();
    return await db.collection('users').findOne({ username });
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

/**
 * Create a new session with a cryptographically secure ID.
 * @param {string} username
 * @param {number} ttlMinutes - Session lifetime in minutes (default 60)
 * @returns {Promise<Object>} The new session document
 */
async function createSession(username, ttlMinutes = 60) {
    const db = await connectDB();
    const sessionId = crypto.randomBytes(32).toString('hex');
    const now       = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    const session = { sessionId, username, createdAt: now, expiresAt };
    await db.collection('sessions').insertOne(session);
    return session;
}

/**
 * Find a session by sessionId. Returns null if expired.
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
async function getSessionById(sessionId) {
    const db = await connectDB();
    const session = await db.collection('sessions').findOne({ sessionId });
    if (!session) return null;
    if (session.expiresAt < new Date()) {
        await db.collection('sessions').deleteOne({ sessionId });
        return null;
    }
    return session;
}

/**
 * Delete a session (logout).
 * @param {string} sessionId
 * @returns {Promise<Object>} MongoDB delete result
 */
async function deleteSession(sessionId) {
    const db = await connectDB();
    return await db.collection('sessions').deleteOne({ sessionId });
}

// ─── Security Log ─────────────────────────────────────────────────────────────

/**
 * Insert a security log entry.
 * @param {{ username: string|null, urlAccessed: string, method: string }} logData
 * @returns {Promise<Object>} MongoDB insert result
 */
async function createSecurityLog(logData) {
    const db = await connectDB();
    return await db.collection('security_log').insertOne({
        timestamp:   new Date(),
        username:    logData.username ?? null,
        urlAccessed: logData.urlAccessed,
        method:      logData.method
    });
}

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Get daily max hours from config file.
 * @returns {number}
 */
async function getDailyMaxHours() {
    const config = require('./config.json');
    return config.maxDailyHours;
}
async function touchSession(sessionId) {
    const db = await connectDB();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    return await db.collection('sessions').updateOne(
        { sessionId },
        { $set: { expiresAt } }
    );
}
// ─── Two-Factor Authentication (2FA) ─────────────────────────────────────────

/**
 * Store 2FA code for a user during login attempt
 * @param {string} username
 * @param {string} code - 6-digit code
 * @param {number} expiresInMinutes - default 3 minutes
 */
async function store2FACode(username, code, expiresInMinutes = 3) {
    try{
        const db = await connectDB();
        const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    
        await db.collection('two_fa_codes').updateOne(
            { username },
            { $set: { code, expiresAt, attempts: 0 } },
            { upsert: true }
        );}
    catch(error){
        console.log(error)
    }
}

/**
 * Verify 2FA code for a user
 * @returns {Object} { valid: boolean, attemptsLeft: number, isLocked: boolean }
 */
async function verify2FACode(username, enteredCode) {
    const db = await connectDB();
    const record = await db.collection('two_fa_codes').findOne({ username });
    
    if (!record) return { valid: false, attemptsLeft: 0, isLocked: false };
    
    // Check if locked (10+ attempts)
    if (record.attempts >= 10) {
        return { valid: false, attemptsLeft: 0, isLocked: true };
    }
    
    // Check if expired
    if (new Date() > record.expiresAt) {
        await db.collection('two_fa_codes').deleteOne({ username });
        return { valid: false, attemptsLeft: 0, isLocked: false };
    }
    
    // Verify code
    if (record.code === enteredCode) {
        await db.collection('two_fa_codes').deleteOne({ username });
        return { valid: true, attemptsLeft: 3, isLocked: false };
    }
    
    // Wrong code - increment attempts
    const newAttempts = record.attempts + 1;
    await db.collection('two_fa_codes').updateOne(
        { username },
        { $set: { attempts: newAttempts } }
    );
    
    const attemptsLeft = 3 - newAttempts;
    return { valid: false, attemptsLeft: Math.max(0, attemptsLeft), isLocked: false };
}

/**
 * Get 2FA attempts for a user
 */
async function get2FAAttempts(username) {
    const db = await connectDB();
    const record = await db.collection('two_fa_codes').findOne({ username });
    return record ? record.attempts : 0;
}
// ─── Employee Documents ─────────────────────────────────────────────────────

/**
 * Add a document for an employee
 * @param {string} employeeId - ObjectId string
 * @param {string} filename - Original filename
 * @param {string} filepath - Stored file path
 * @param {number} size - File size in bytes
 * @returns {Promise<Object>}
 */
async function addEmployeeDocument(employeeId, filename, filepath, size) {
    const db = await connectDB();
    const oid = toObjectId(employeeId);
    
    // Check current document count
    const employee = await db.collection('employees').findOne({ _id: oid });
    const currentDocs = employee?.documents || [];
    
    if (currentDocs.length >= 5) {
        throw new Error('Maximum 5 documents per employee');
    }
    
    const doc = {
        _id: new ObjectId(),
        filename: filename,
        filepath: filepath,
        size: size,
        uploadedAt: new Date()
    };
    
    await db.collection('employees').updateOne(
        { _id: oid },
        { $push: { documents: doc } }
    );
    
    return doc;
}

/**
 * Get all documents for an employee
 */
async function getEmployeeDocuments(employeeId) {
    const db = await connectDB();
    const employee = await db.collection('employees').findOne(
        { _id: toObjectId(employeeId) },
        { projection: { documents: 1 } }
    );
    return employee?.documents || [];
}

/**
 * Get a single document by ID
 */
async function getDocumentById(employeeId, documentId) {
    const db = await connectDB();
    const employee = await db.collection('employees').findOne(
        { 
            _id: toObjectId(employeeId),
            'documents._id': toObjectId(documentId)
        },
        { projection: { 'documents.$': 1 } }
    );
    return employee?.documents?.[0] || null;
}

/**
 * Delete a document
 */
async function deleteEmployeeDocument(employeeId, documentId) {
    const db = await connectDB();
    const doc = await getDocumentById(employeeId, documentId);
    
    if (doc && doc.filepath) {
        // Delete file from filesystem
        const fs = require('fs');
        if (fs.existsSync(doc.filepath)) {
            fs.unlinkSync(doc.filepath);
        }
    }
    
    await db.collection('employees').updateOne(
        { _id: toObjectId(employeeId) },
        { $pull: { documents: { _id: toObjectId(documentId) } } }
    );
}
// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    // Employees
    getAllEmployees,
    findEmployee,
    addEmployeeRecord,
    updateEmployeeRecord,
    updateEmployeePhoto,
    deleteEmployee,

    // Shifts
    getAllShifts,
    findShift,
    createShift,
    updateShift,
    deleteShift,
    getEmployeeShifts,
    getShiftsByEmployeeId,
    getEmployeesByShiftId,
    addEmployeeToShift,
    removeEmployeeFromShift,

    // Users
    createUser,
    getUserByUsername,

    // Sessions
    createSession,
    getSessionById,
    deleteSession,

    // Security log
    createSecurityLog,

    // Config
    getDailyMaxHours,

    touchSession,
    addEmployeeDocument,
    deleteEmployeeDocument,
    getEmployeeDocuments,
    verify2FACode,
    get2FAAttempts,
    store2FACode
};