const persistence = require('./persistence.js')

/**
 * Return a list of all employees loaded from the storage.
 * @returns {Array<{ employeeId: string, name: string, phone: string }>} List of employees
 */
async function getAllEmployees() {
    return await persistence.getAllEmployees()
}


/**
 * Add a new employee record to the system. The empId is automatically generated based
 * on the next available ID number from what is already in the file.
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
module.exports = {
    getAllEmployees, addEmployeeRecord, getEmployeeShifts
}