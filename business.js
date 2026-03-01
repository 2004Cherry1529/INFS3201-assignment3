const persistence = require('./persistence.js')

/**
 * Return a list of all employees loaded from the storage.
 * @returns {Array<{ employeeId: string, name: string, phone: string }>} List of employees
 */
async function getAllEmployees() {
    return await persistence.getAllEmployees()
}

/**
 * Find a single employee by ID
 * @param {string} empId 
 * @returns {Object|null} Employee object or null
 */
async function findEmployee(empId) {
    return await persistence.findEmployee(empId)  // ← ADD THIS FUNCTION
}

/**
 * Add a new employee record to the system.
 * @param {{name:string, phone:string}} emp 
 */
async function addEmployeeRecord(emp) {
    return await persistence.addEmployeeRecord(emp)
}

/**
 * Get a list of shifts for an employee.
 * @param {string} empId 
 * @returns {Array} List of shifts
 */
async function getEmployeeShifts(empId) {
    return await persistence.getEmployeeShifts(empId)
}

/**
 * Update an existing employee
 * @param {string} empId 
 * @param {{name:string, phone:string}} updates 
 */
async function updateEmployeeRecord(empId, updates) {
    return await persistence.updateEmployeeRecord(empId, updates)
}

module.exports = {
    getAllEmployees, 
    findEmployee,          
    addEmployeeRecord, 
    getEmployeeShifts,    
    updateEmployeeRecord
}