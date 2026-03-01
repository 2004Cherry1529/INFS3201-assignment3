const business = require('./business.js')
const prompt=require('prompt-sync')()


/**
 * A function to interact with the user and display the results of the
 * employee schedule in a CSV like format.
 */
async function getEmployeeSchedule() {
    let empId = prompt('Enter employee ID: ')
    console.log('Looking for employee:', empId)
    
    let details = await business.getEmployeeShifts(empId)
    console.log('Raw data from business:', details)
    
    if (!details || details.length === 0) {
        console.log('No shifts found for this employee')
        return
    }
    
    console.log('\n')
    console.log('date, start, end')
    for (let d of details) {
        console.log('Shift object:', d)  // See what fields exist
        console.log(`${d.date}, ${d.startTime}, ${d.endTime}`)
    }
}

/**
 * Display the employee list in a nicely formatted table.
 */
async function displayEmployees() {
    let employees = await business.getAllEmployees()
    console.log('Employee ID  Name                Phone')
    console.log('-----------  ------------------- ---------')
    for (let emp of employees) {
        console.log(`${emp.employeeId.padEnd(13)}${emp.name.padEnd(20)}${emp.phone}`)
    }
}

/**
 * The UI function for adding a new employee to the system.
 */
async function addNewEmployee() {
    let name = prompt('Enter employee name: ')
    let phone = prompt('Enter phone number: ')
    await business.addEmployeeRecord({
        name: name,
        phone: phone
    })
    console.log('Employee added...')
}


/**
 * The UI function for displaying the menu and calling the various UI functions.  The function
 * is made async because many of the called functions are also async.
 */
async function displayMenu() {
    while (true) {
        console.log('1. Show all employees')
        console.log('2. Add new employee')
        console.log('3. View employee schedule')
        console.log('4. Exit')
        let choice = Number(prompt("What is your choice> "))
        if (choice === 1) {
            await displayEmployees()
            console.log('\n\n')
        }
        else if (choice == 2) {
            await addNewEmployee()
            console.log('\n\n')
        }
        else if (choice == 3) {
            await getEmployeeSchedule()
            console.log('\n\n')
        }
        else if (choice == 4) {
            break
        }
        else {
            console.log("Error in selection")
        }
    }
    console.log('*** Goodbye!')
}

displayMenu()

