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

    touchSession
};