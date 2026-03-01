// import-data.js
const { connectDB } = require('./db/connection');
const fs = require('fs');
const { MongoClient } = require('mongodb');

async function importData() {
    const db = await connectDB();  
    
    try {
        console.log('Starting data import...');
        
        // Import employees
        if (fs.existsSync('employees.json')) {
            const employees = JSON.parse(fs.readFileSync('employees.json'));
            if (employees.length > 0) {
                await db.collection('employees').insertMany(employees);
                console.log(`Imported ${employees.length} employees`);
            }
        }
        
        // Import shifts
        if (fs.existsSync('shifts.json')) {
            const shifts = JSON.parse(fs.readFileSync('shifts.json'));
            if (shifts.length > 0) {
                await db.collection('shifts').insertMany(shifts);
                console.log(`Imported ${shifts.length} shifts`);
            }
        }
        
        // Import assignments
        if (fs.existsSync('assignments.json')) {
            const assignments = JSON.parse(fs.readFileSync('assignments.json'));
            if (assignments.length > 0) {
                await db.collection('assignments').insertMany(assignments);
                console.log(`Imported ${assignments.length} assignments`);
            }
        }
        
        console.log('Data import completed!');
        
    } catch (error) {
        console.error('Error importing data:', error);
    }
}

importData();