const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const business = require('./business');

const app = express();

app.engine('hbs', engine({ extname: '.hbs', defaultLayout: false }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));


app.get('/', async (req, res) => {
    try {
        const employees = await business.getAllEmployees();
        res.render('landing', { employees });
    } catch (error) {
        res.send('Error: ' + error.message);
    }
});

app.get('/employee/:id', async (req, res) => {
    try {
        const employee = await business.findEmployee(req.params.id);
        if (!employee) {
            return res.send('Employee not found');
        }
        const shifts = await business.getEmployeeShifts(req.params.id);        
        for (let i = 0; i < shifts.length; i++) {
            const hour = parseInt(shifts[i].startTime.split(':')[0]);
            shifts[i].isMorning = (hour < 12);
        }
        
        res.render('employee-details', { employee, shifts });
        
    } catch (error) {
        res.send('Error: ' + error.message);
    }
});

//EDIT FORM-GET
app.get('/employee/:id/edit', async (req, res) => {
    try {
        const employee = await business.findEmployee(req.params.id);
        if (!employee) {
            return res.send('Employee not found');
        }
        res.render('edit-employee', { employee });
    } catch (error) {
        res.send('Error: ' + error.message);
    }
});

//EDIT FORM-POST
app.post('/employee/:id/edit', async (req, res) => {
    try {
        const { name, phone } = req.body;
        const empId = req.params.id;  
        const trimmedName = name ? name.trim() : '';
        const trimmedPhone = phone ? phone.trim() : '';       
        if (!trimmedName) {
            return res.send('Error: Name cannot be empty');
        }     
        const phoneRegex = /^\d{4}-\d{4}$/;
        if (!phoneRegex.test(trimmedPhone)) {
            return res.send('Error: Phone must be in format 1234-5678');
        }
        
        await business.updateEmployeeRecord(empId, {
            name: trimmedName,
            phone: trimmedPhone
        });
        
        res.redirect('/');
        
    } catch (error) {
        res.send('Error updating: ' + error.message);
    }
});

// Starting server
app.listen(3001, () => {
    console.log('Server running on http://localhost:3001');
});