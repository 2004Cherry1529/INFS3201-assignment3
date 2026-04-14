// business.js
const persistence = require('./persistence.js');
const crypto = require('crypto');
const emailSystem = require('./emailSystem');
// Store for pending 2FA logins (temporary)
const pending2FALogins = new Map(); // key: username, value: { tempSessionId, expiresAt }
// ─── Employees ────────────────────────────────────────────────────────────────

/**
 * Return all employees.
 * @returns {Promise<Array>}
 */
async function getAllEmployees() {
    return await persistence.getAllEmployees();
}

/**
 * Find a single employee by their MongoDB _id string.
 * @param {string} id - ObjectId string
 * @returns {Promise<Object|null>}
 */
async function findEmployee(id) {
    return await persistence.findEmployee(id);
}

/**
 * Add a new employee. MongoDB _id is the primary key — no employeeId generated.
 * @param {{ name: string, phone: string }} emp
 * @returns {Promise<Object>} The new employee document
 */
async function addEmployeeRecord(emp) {
    return await persistence.addEmployeeRecord(emp);
}

/**
 * Update an employee's name and/or phone by _id.
 * @param {string} id - ObjectId string
 * @param {{ name?: string, phone?: string }} updates
 * @returns {Promise<Object>}
 */
async function updateEmployeeRecord(id, updates) {
    return await persistence.updateEmployeeRecord(id, updates);
}

/**
 * Update an employee's photo (file path or URL).
 * @param {string} id - ObjectId string
 * @param {string} photoPath
 * @returns {Promise<Object>}
 */
async function updateEmployeePhoto(id, photoPath) {
    return await persistence.updateEmployeePhoto(id, photoPath);
}

/**
 * Delete an employee and cascade-remove them from all shifts.
 * @param {string} id - ObjectId string
 * @returns {Promise<Object>}
 */
async function deleteEmployee(id) {
    return await persistence.deleteEmployee(id);
}

// ─── Shifts ───────────────────────────────────────────────────────────────────

/**
 * Return all shifts (employees field contains ObjectIds, not populated).
 * @returns {Promise<Array>}
 */
async function getAllShifts() {
    return await persistence.getAllShifts();
}

/**
 * Find a single shift by _id.
 * @param {string} id - ObjectId string
 * @returns {Promise<Object|null>}
 */
async function findShift(id) {
    return await persistence.findShift(id);
}

/**
 * Create a new shift with an empty employees array.
 * @param {{ date: string, startTime: string, endTime: string }} shiftData
 * @returns {Promise<Object>}
 */
async function createShift(shiftData) {
    return await persistence.createShift(shiftData);
}

/**
 * Update a shift's fields by _id.
 * @param {string} id - ObjectId string
 * @param {Object} updates
 * @returns {Promise<Object>}
 */
async function updateShift(id, updates) {
    return await persistence.updateShift(id, updates);
}

/**
 * Delete a shift by _id.
 * @param {string} id - ObjectId string
 * @returns {Promise<Object>}
 */
async function deleteShift(id) {
    return await persistence.deleteShift(id);
}

/**
 * Get all shifts for an employee. Annotates each with isMorning flag.
 * @param {string} employeeId - ObjectId string
 * @returns {Promise<Array>}
 */
async function getEmployeeShifts(employeeId) {
    const shifts = await persistence.getEmployeeShifts(employeeId);
    for (const shift of shifts) {
        const hour = parseInt(shift.startTime.split(':')[0]);
        shift.isMorning = hour < 12;
    }
    return shifts; // ✅ shifts return karo, shiftId wali line hata di
}

/**
 * Get fully populated employee documents for a shift.
 * @param {string} shiftId - ObjectId string
 * @returns {Promise<Array>}
 */
async function getEmployeesByShift(shiftId) {
    return await persistence.getEmployeesByShiftId(shiftId);
}

/**
 * Assign an employee to a shift with conflict detection.
 * Rejects if the employee is already assigned to an overlapping shift on the same date.
 * @param {string} shiftId - ObjectId string
 * @param {string} employeeId - ObjectId string
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function assignEmployeeToShift(shiftId, employeeId) {
    const targetShift = await persistence.findShift(shiftId);
    if (!targetShift) return { success: false, message: 'Shift not found' };

    const existingShifts = await persistence.getEmployeeShifts(employeeId);
    const sameDayShifts  = existingShifts.filter(s => s.date === targetShift.date);

    for (const existing of sameDayShifts) {
        if (timesOverlap(existing.startTime, existing.endTime, targetShift.startTime, targetShift.endTime)) {
            return {
                success: false,
                message: `Conflict: employee already assigned ${existing.startTime}–${existing.endTime} on ${existing.date}`
            };
        }
    }

    await persistence.addEmployeeToShift(shiftId, employeeId);
    return { success: true, message: 'Employee assigned successfully' };
}

/**
 * Remove an employee from a shift.
 * @param {string} shiftId - ObjectId string
 * @param {string} employeeId - ObjectId string
 * @returns {Promise<Object>}
 */
async function removeEmployeeFromShift(shiftId, employeeId) {
    return await persistence.removeEmployeeFromShift(shiftId, employeeId);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Validate credentials and create a new session on success.
 * @param {string} username
 * @param {string} plainPassword
 * @returns {Promise<Object|null>} Session document or null if invalid
 */
async function login(username, plainPassword) {
    const user = await persistence.getUserByUsername(username);
    if (!user) return null;

    const hashed = crypto.createHash('sha256').update(plainPassword).digest('hex');
    if (hashed !== user.hashedPassword) return null;

    return await persistence.createSession(username);
}

/**
 * Validate a session cookie and return the session if still active.
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
async function validateSession(sessionId) {
    return await persistence.getSessionById(sessionId);
}

/**
 * Extend a session's expiry by 5 minutes from now.
 * Called on every authenticated request (assignment requirement).
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
async function touchSession(sessionId) {
    return await persistence.touchSession(sessionId);
}

/**
 * Delete a session (logout).
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
async function logout(sessionId) {
    return await persistence.deleteSession(sessionId);
}

// ─── Security Log ─────────────────────────────────────────────────────────────

/**
 * Log a request to the security_log collection.
 * @param {{ username: string|null, urlAccessed: string, method: string }} logData
 * @returns {Promise<Object>}
 */
async function logAccess(logData) {
    return await persistence.createSecurityLog(logData);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Check if two HH:MM time ranges overlap.
 * @param {string} start1 @param {string} end1
 * @param {string} start2 @param {string} end2
 * @returns {boolean}
 */
function timesOverlap(start1, end1, start2, end2) {
    const toMins = t => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };
    return toMins(start1) < toMins(end2) && toMins(start2) < toMins(end1);
}

/**
 * Step 1: Verify password, generate 2FA code, send email
 * @returns {Object} { success: boolean, message: string, needs2FA: boolean }
 */
async function initiateLogin(username, plainPassword) {
    const user = await persistence.getUserByUsername(username);
    if (!user) return { success: false, message: 'Invalid credentials', needs2FA: false };
    
    const hashed = crypto.createHash('sha256').update(plainPassword).digest('hex');
    if (hashed !== user.hashedPassword) return { success: false, message: 'Invalid credentials', needs2FA: false };
    
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store code in database (expires in 3 minutes)
    await persistence.store2FACode(username, code, 3);
    
    // Send email with code
    emailSystem.sendEmail(
        `${username}@example.com`, // In real app, you'd store user's email
        'Your 2FA Verification Code',
        `Your verification code is: ${code}\nThis code expires in 3 minutes.`
    );
    
    // Create temporary pending session
    const tempSessionId = crypto.randomBytes(32).toString('hex');
    pending2FALogins.set(username, {
        tempSessionId,
        expiresAt: Date.now() + 3 * 60 * 1000
    });
    
    return { 
        success: true, 
        message: '2FA code sent to your email', 
        needs2FA: true,
        tempSessionId,
        username
    };
}

/**
 * Step 2: Verify 2FA code and create real session
 */
async function verify2FALogin(username, code, tempSessionId) {
    // Check if temp session exists and not expired
    const pending = pending2FALogins.get(username);
    if (!pending || pending.tempSessionId !== tempSessionId) {
        return { success: false, message: 'Invalid or expired 2FA session' };
    }
    if (Date.now() > pending.expiresAt) {
        pending2FALogins.delete(username);
        return { success: false, message: '2FA session expired' };
    }
    
    // Verify the code
    const result = await persistence.verify2FACode(username, code);
    
    if (result.isLocked) {
        pending2FALogins.delete(username);
        await emailSystem.sendEmail(
            `${username}@example.com`,
            'Account Locked',
            'Your account has been locked due to 10 failed 2FA attempts. Contact an administrator.'
        );
        return { success: false, message: 'Account locked due to too many failed attempts' };
    }
    
    if (!result.valid) {
        if (result.attemptsLeft === 0) {
            // After 3 failed attempts, send suspicious activity email
            await emailSystem.sendEmail(
                `${username}@example.com`,
                'Suspicious Activity Detected',
                `There have been 3 failed 2FA attempts on your account. If this wasn't you, please contact support.`
            );
            return { success: false, message: `Too many failed attempts. Check your email.` };
        }
        return { success: false, message: `Invalid code. ${result.attemptsLeft} attempt(s) left.` };
    }
    
    // Code valid - create real session
    pending2FALogins.delete(username);
    const session = await persistence.createSession(username);
    return { success: true, session };
}

/**
 * Check if account is locked
 */
async function isAccountLocked(username) {
    const attempts = await persistence.get2FAAttempts(username);
    return attempts >= 10;
}
/**
 * Upload document for employee
 */
async function uploadEmployeeDocument(employeeId, file) {
    // Validate PDF
    if (file.mimetype !== 'application/pdf') {
        throw new Error('Only PDF files are allowed');
    }
    
    // Validate size (2MB = 2 * 1024 * 1024)
    if (file.size > 2 * 1024 * 1024) {
        throw new Error('File size must be less than 2MB');
    }
    
    return await persistence.addEmployeeDocument(
        employeeId,
        file.originalname,
        file.path,
        file.size
    );
}

/**
 * Get employee documents
 */
async function getEmployeeDocuments(employeeId) {
    return await persistence.getEmployeeDocuments(employeeId);
}

/**
 * Download document (returns file info)
 */
async function getDocumentForDownload(employeeId, documentId) {
    const doc = await persistence.getDocumentById(employeeId, documentId);
    if (!doc) throw new Error('Document not found');
    return doc;
}

/**
 * Delete document
 */
async function deleteEmployeeDocument(employeeId, documentId) {
    return await persistence.deleteEmployeeDocument(employeeId, documentId);
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
    getEmployeesByShift,
    assignEmployeeToShift,
    removeEmployeeFromShift,

    // Auth
    login,
    validateSession,
    touchSession,
    logout,

    // Security log
    logAccess,
    initiateLogin,
    verify2FALogin,
    isAccountLocked,
    uploadEmployeeDocument,
    getEmployeeDocuments,
    getDocumentForDownload,
    deleteEmployeeDocument
};