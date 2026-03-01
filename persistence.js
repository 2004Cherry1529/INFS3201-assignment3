// persistence.js
const { connectDB } = require('./db/connection');
const { ObjectId } = require('mongodb');

/**
 * Get all employees
 */
async function getAllEmployees() {
    const db = await connectDB();
    return await db.collection('employees').find({}).toArray();
}

/**
 * Find employee by ID - using findOne
 */
async function findEmployee(empId) {
    const db = await connectDB();
    return await db.collection('employees').findOne({ employeeId: empId });
}

/**
 * Get shifts for an employee
 */
/**
 * Get shifts for an employee 
 */
async function getEmployeeShifts(empId) {
    const db = await connectDB();
    
    // Step 1: Find all assignments for this employee
    const assignments = await db.collection('assignments')
        .find({ employeeId: empId })
        .toArray();
    
    if (assignments.length === 0) return [];
    
    // Step 2: Get all shiftIds from assignments
    const shiftIds = [];
    for (let asn of assignments) {
        shiftIds.push(asn.shiftId);
    }
    
    // Step 3: Find all shifts with those IDs
    const shifts = await db.collection('shifts')
        .find({ shiftId: { $in: shiftIds } })
        .toArray();
    
    return shifts;
}

/**
 * Add new employee
 */
async function addEmployeeRecord(emp) {
    const db = await connectDB();
    
    // Get the highest employee ID
    const result = await db.collection('employees')
        .find({})
        .sort({ employeeId: -1 })
        .limit(1)
        .toArray();
    
    let newId = 'E001';
    if (result.length > 0) {
        const lastId = result[0].employeeId;
        const num = parseInt(lastId.replace('E', '')) + 1;
        newId = 'E' + String(num).padStart(3, '0');
    }
    
    const newEmployee = {
        employeeId: newId,
        name: emp.name,
        phone: emp.phone
    };
    
    await db.collection('employees').insertOne(newEmployee);
    return newEmployee;
}

/**
 * Get shifts for employee on specific date
 */
async function getEmployeeShiftsOnDate(empId, date) {
    const db = await connectDB();
    return await db.collection('shifts')
        .find({ 
            employeeId: empId,
            date: date 
        })
        .toArray();
}

/**
 * Get daily max hours from config
 */
async function getDailyMaxHours() {
    const config = require('./config.json');
    return config.dailyMaxHours;
}
/**
 * Update an existing employee
 * @param {string} empId - Employee ID
 * @param {{name:string, phone:string}} updates - Fields to update
 * @returns {Promise<Object>} Update result
 */
async function updateEmployeeRecord(empId, updates) {
    const db = await connectDB();
    return await db.collection('employees').updateOne(
        { employeeId: empId },
        { $set: { 
            name: updates.name, 
            phone: updates.phone 
        }}
    );
}

module.exports = {
    getAllEmployees,
    findEmployee,
    getEmployeeShifts,
    addEmployeeRecord,
    getEmployeeShiftsOnDate,
    getDailyMaxHours,
    updateEmployeeRecord
};
